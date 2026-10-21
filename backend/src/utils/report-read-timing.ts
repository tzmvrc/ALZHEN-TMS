import {AsyncLocalStorage} from "node:async_hooks";
import type {RequestHandler} from "express";
const reads=new AsyncLocalStorage<Array<{resource:string;ms:number;status:number}>>();
/** Request-local timings contain no tokens, SQL, values or record identifiers. */
export const timedSupabaseFetch:typeof fetch=async(input,init)=>{
 const scope=reads.getStore();if(!scope)return fetch(input,init);
 const url=new URL(input instanceof Request?input.url:String(input));
 const method=(init?.method??(input instanceof Request?input.method:"GET")).toUpperCase();
 const resource=url.pathname.startsWith("/rest/v1/")?url.pathname.slice(9).split("/")[0]:url.pathname.startsWith("/auth/")?"authentication":"storage";
 // Bound only report database GETs. Writes, RPCs and authorization keep their
 // existing semantics. AbortError prevents the SDK retrying a timed-out read
 // several times before the client can show Retry with its cached rows intact.
 const bounded=method==="GET"&&url.pathname.startsWith("/rest/v1/");
 const controller=bounded?new AbortController():undefined;
 const inherited=init?.signal??(input instanceof Request?input.signal:undefined);
 const abort=()=>controller?.abort();
 if(inherited?.aborted)abort();else inherited?.addEventListener("abort",abort,{once:true});
 const configured=Number(process.env.REPORT_UPSTREAM_TIMEOUT_MS??12000);
 const timer=controller?setTimeout(abort,Number.isFinite(configured)?Math.max(1000,Math.min(60000,configured)):12000):undefined;
 const start=performance.now();
 try{const result=await fetch(input,controller?{...init,signal:controller.signal}:init);if(scope.length<1000)scope.push({resource,ms:Math.round(performance.now()-start),status:result.status});return result;}
 catch(error){if(scope.length<1000)scope.push({resource,ms:Math.round(performance.now()-start),status:0});throw error;}
 finally{if(timer)clearTimeout(timer);inherited?.removeEventListener("abort",abort);}
};
export const reportReadTiming:RequestHandler=(req,res,next)=>{if(req.method!=="GET"||!req.path.startsWith("/api/reports/"))return next();const start=performance.now(),measurements:Array<{resource:string;ms:number;status:number}>=[];reads.run(measurements,()=>{const original=res.json.bind(res);res.json=body=>{res.setHeader("Server-Timing",`upstream;dur=${measurements.reduce((total,r)=>total+r.ms,0)};desc="${measurements.length} upstream reads"`);return original(body);};res.once("finish",()=>{const ms=Math.round(performance.now()-start);if(ms>=2000)console.warn(JSON.stringify({event:"slow_report_read",report:req.originalUrl.split("?")[0].replace(/[^/]+$/,"[report]"),ms,reads:measurements}));});next();});};
