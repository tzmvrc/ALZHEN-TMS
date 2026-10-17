export type BrowserFix={latitude:number;longitude:number;accuracy_meters:number;captured_at:string};
export type CaptureApi={begin():Promise<{session_id:string}>;send(sessionId:string,fix:BrowserFix,signal:AbortSignal):Promise<void>;stop(sessionId:string):Promise<void>};

/** Opt-in controller, deliberately not mounted until protected tracking APIs are
 * approved. No browser permission request occurs at construction/navigation. */
export function createLocationCapture(options:{geolocation:Pick<Geolocation,"getCurrentPosition"|"watchPosition"|"clearWatch">;api:CaptureApi;onState:(state:string)=>void;now?:()=>number;intervalMs?:number;schedule?:(fn:()=>void,ms:number)=>ReturnType<typeof setTimeout>;cancelScheduled?:(timer:ReturnType<typeof setTimeout>)=>void}){
 const now=options.now??Date.now,interval=Math.max(5000,options.intervalMs??30000);
 const schedule=options.schedule??setTimeout,cancelScheduled=options.cancelScheduled??clearTimeout;
 let generation=0,watch:number|null=null,session:string|null=null,pending:BrowserFix|null=null,busy=false,lastSent=-Infinity,controller:AbortController|null=null,timer:ReturnType<typeof setTimeout>|null=null,lastAccepted=-Infinity;
 function fix(position:GeolocationPosition):BrowserFix|null{
  const {latitude,longitude,accuracy}=position.coords,captured=position.timestamp;
  if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180||!Number.isFinite(accuracy)||accuracy<0||accuracy>=100000||!Number.isFinite(captured)||Math.abs(now()-captured)>120000||captured<=lastAccepted)return null;
  lastAccepted=captured;return {latitude,longitude,accuracy_meters:accuracy,captured_at:new Date(captured).toISOString()};
 }
 function queue(epoch:number){
  if(timer!==null||!pending||!session||epoch!==generation)return;
  timer=schedule(()=>{timer=null;void send(epoch);},Math.max(0,interval-(now()-lastSent)));
 }
 async function send(epoch:number){
  if(busy||!pending||!session||epoch!==generation)return;
  if(now()-Date.parse(pending.captured_at)>120000){pending=null;options.onState("LOCATION_UNAVAILABLE");return;}
  if(now()-lastSent<interval){queue(epoch);return;}
  const next=pending;pending=null;const sessionId=session;busy=true;controller=new AbortController();lastSent=now();
  try{await options.api.send(sessionId,next,controller.signal);if(epoch===generation)options.onState("SHARING");}
  catch{if(epoch===generation){if(!pending)pending=next;options.onState("LOCATION_NOT_SAVED");}}
  finally{if(epoch===generation){busy=false;controller=null;queue(epoch);}}
 }
 function clear(){if(watch!==null)options.geolocation.clearWatch(watch);watch=null;if(timer!==null)cancelScheduled(timer);timer=null;controller?.abort();controller=null;pending=null;busy=false;lastSent=-Infinity;lastAccepted=-Infinity;}
 async function stop(){const epoch=++generation;clear();const old=session;session=null;options.onState("STOPPED");if(old){try{await options.api.stop(old);}catch{if(epoch===generation){session=old;options.onState("STOP_CONFIRMATION_PENDING");}return false;}}return true;}
 return {
  async start(){
   const stopping=stop(),epoch=generation;if(!await stopping||epoch!==generation)return;options.onState("REQUESTING_PERMISSION");
   let position:GeolocationPosition;
   try{position=await new Promise<GeolocationPosition>((resolve,reject)=>options.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:15000}));}
   catch{if(epoch===generation)options.onState("PERMISSION_OR_LOCATION_UNAVAILABLE");return;}
   if(epoch!==generation)return;
   const initial=fix(position);if(!initial){options.onState("PERMISSION_OR_LOCATION_UNAVAILABLE");return;}
   try{
    const created=await options.api.begin();
    if(epoch!==generation){await options.api.stop(created.session_id).catch(()=>{});return;}
    session=created.session_id;pending=initial;
    const newWatch=options.geolocation.watchPosition(p=>{if(epoch===generation){const next=fix(p);if(!next)return;pending=next;void send(epoch);}},error=>{if(epoch!==generation)return;if(error.code===1)void stop();else options.onState("LOCATION_UNAVAILABLE");},{enableHighAccuracy:true,maximumAge:10000,timeout:15000});
    if(epoch!==generation){options.geolocation.clearWatch(newWatch);return;}
    watch=newWatch;void send(epoch);
   }catch{if(epoch===generation){await stop();if(generation===epoch+1)options.onState("TRACKING_UNAVAILABLE");}}
  },
  stop,
 };
}
export function locationIsStale(capturedAt:string|null,now=Date.now()){return !capturedAt||!Number.isFinite(Date.parse(capturedAt))||now-Date.parse(capturedAt)>120000;}
