import test from 'node:test';
import assert from 'node:assert/strict';
import {createAdaptiveWorker} from '../src/utils/adaptive-worker.js';
function clock(){let id=0;const timers=new Map<number,{fn:()=>void;ms:number}>();return {schedule:(fn:()=>void,ms:number)=>{timers.set(++id,{fn,ms});return id as any;},cancel:(id:any)=>{timers.delete(id);},next:()=>[...timers.values()][0]?.ms,async fire(){const [id,t]=[...timers][0]!;timers.delete(id);t.fn();await new Promise(resolve=>setImmediate(resolve));},size:()=>timers.size};}
test('idle queues back off, wake promptly for new work and keep a single poll in flight',async()=>{
 const c=clock();let work=0,finish:((n:number)=>void)|undefined;
 const worker=createAdaptiveWorker({name:'fixture',random:()=>.5,...c,run:async()=>{work++;return work===4?new Promise<number>(resolve=>{finish=resolve;}):0;}});
 await c.fire();assert.equal(c.next(),30_000);await c.fire();assert.equal(c.next(),60_000);await c.fire();assert.equal(c.next(),120_000);
 worker.wake();assert.equal(c.next(),250);await c.fire();assert.equal(c.size(),0);worker.wake();worker.wake();assert.equal(work,4);finish!(1);await new Promise(resolve=>setImmediate(resolve));assert.equal(c.size(),1);assert.equal(c.next(),250);
 worker.stop();assert.equal(c.size(),0);worker.wake();assert.equal(c.size(),0);
});
test('outages back off to five minutes, coalesce logs, and recover without disabling work',async()=>{
 const c=clock(),logs:Record<string,unknown>[]=[];let time=0,fail=true;
 const worker=createAdaptiveWorker({name:'fixture',random:()=>.5,...c,now:()=>time,log:entry=>logs.push(entry),run:async()=>{if(fail)throw Error('offline');return 2;}});
 await c.fire();assert.equal(c.next(),30_000);worker.wake();assert.equal(c.next(),30_000);
 time+=30_000;await c.fire();assert.equal(c.next(),60_000);assert.equal(logs.length,1);
 time+=60_000;await c.fire();time+=120_000;await c.fire();time+=240_000;await c.fire();assert.equal(c.next(),300_000);assert.equal(logs.length,2);
 fail=false;await c.fire();assert.equal(c.next(),15_000);assert.equal(logs.at(-1)?.event,'background_worker_recovered');worker.stop();
});
