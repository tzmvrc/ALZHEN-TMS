import type {Response} from "express";

/** Local diagnostics only by default. Durations contain no identities or values. */
export async function withServerTiming<T>(res:Response,name:string,read:()=>PromiseLike<T>):Promise<T>{
 const enabled=process.env.NODE_ENV!=="production"||process.env.PERFORMANCE_DIAGNOSTICS==="true";
 if(!enabled)return read();
 const started=performance.now();
 try{return await read();}finally{if(!res.headersSent)res.append("Server-Timing",`${name};dur=${(performance.now()-started).toFixed(1)}`);}
}
