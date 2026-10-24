type Timer = ReturnType<typeof setTimeout>;
/** One completion-driven poller. Durable database leases still own job delivery. */
export function createAdaptiveWorker(options:{name:string;run:()=>Promise<number>;activeMs?:number;idleMaxMs?:number;errorMaxMs?:number;random?:()=>number;schedule?:(fn:()=>void,ms:number)=>Timer;cancel?:(timer:Timer)=>void;now?:()=>number;log?:(entry:Record<string,unknown>)=>void}){
 const activeMs=options.activeMs??15_000,idleMaxMs=options.idleMaxMs??120_000,errorMaxMs=options.errorMaxMs??300_000;
 const schedule=options.schedule??((fn,ms)=>{const timer=setTimeout(fn,ms);timer.unref();return timer;}),cancel=options.cancel??clearTimeout,now=options.now??Date.now,random=options.random??Math.random;
 const log=options.log??(entry=>console.warn(JSON.stringify(entry)));
 let stopped=false,running=false,timer:Timer|undefined,idle=0,failures=0,woken=false,lastLog=-Infinity;
 const stats={polls:0,jobs:0,errors:0,nextDelayMs:0};
 function queue(ms:number){if(stopped)return;if(timer)cancel(timer);stats.nextDelayMs=Math.round(ms*(.9+random()*.2));timer=schedule(()=>{timer=undefined;void tick();},stats.nextDelayMs);}
 async function tick(){if(stopped||running)return;running=true;stats.polls++;let delay=activeMs;
  try{const jobs=await options.run();stats.jobs+=jobs;if(failures)log({event:'background_worker_recovered',worker:options.name,failedPolls:failures});failures=0;idle=jobs?0:Math.min(idle+1,16);delay=jobs?activeMs:Math.min(idleMaxMs,activeMs*2**idle);}
  catch{failures++;stats.errors++;idle=0;delay=Math.min(errorMaxMs,activeMs*2**Math.min(failures,16));if(now()-lastLog>=300_000){lastLog=now();log({event:'background_worker_deferred',worker:options.name,failedPolls:failures,retryInMs:delay});}}
  finally{running=false;const wake=woken;woken=false;queue(wake&&!failures?250:delay);}
 }
 queue(Math.floor(random()*1000));
 return {wake(){if(stopped||failures)return;if(running){woken=true;return;}idle=0;queue(250);},stop(){stopped=true;if(timer)cancel(timer);timer=undefined;},metrics:()=>({...stats,running,stopped})};
}
