/** One task at a time. A service outage backs polling off without losing queued
 * work; the first successful poll restores the normal interval. */
export function startBackoffWorker({run,onUnavailable,intervalMs=15_000,maxDelayMs=300_000,immediate=false}:{
 run:()=>Promise<void>;onUnavailable:(error:unknown,retryMs:number)=>void;
 intervalMs?:number;maxDelayMs?:number;immediate?:boolean;
}){
 let stopped=false,failures=0,timer:ReturnType<typeof setTimeout>|undefined;
 const schedule=(delay:number)=>{if(stopped)return;timer=setTimeout(()=>{void tick();},delay);timer.unref();};
 const tick=async()=>{
  if(stopped)return;
  try{await run();failures=0;}
  catch(error){failures=Math.min(failures+1,20);if(failures===1)onUnavailable(error,Math.min(maxDelayMs,intervalMs*2));}
  finally{schedule(Math.min(maxDelayMs,intervalMs*2**failures));}
 };
 if(immediate)void tick();else schedule(intervalMs);
 return()=>{stopped=true;if(timer)clearTimeout(timer);};
}
