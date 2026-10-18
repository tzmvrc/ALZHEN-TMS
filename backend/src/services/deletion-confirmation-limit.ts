import {randomUUID} from "node:crypto";
import {createClient} from "redis";
import {ApiError} from "../utils/api-response.js";

const windowMs=15*60*1000;
/** Five confirmations per Admin / 15 minutes, including failed passwords. */
export function createDeletionConfirmationLimit(now=Date.now,redisFactory=createClient) {
 const attempts=new Map<string,{count:number;until:number}>(),active=new Set<string>();
 let redis:ReturnType<typeof createClient>|undefined,connecting:Promise<unknown>|undefined;
 return async(id:string):Promise<()=>Promise<void>>=>{
  const workers=Number(process.env.WEB_CONCURRENCY??1);
  if(!Number.isSafeInteger(workers)||workers<1)throw new ApiError("Deletion worker topology is invalid. Nothing was deleted.",503,"DELETE_CONFIRM_LIMIT_UNAVAILABLE");
  if(process.env.SOCKET_REDIS_URL){
   try {
    if(!redis){redis=redisFactory({url:process.env.SOCKET_REDIS_URL,socket:{connectTimeout:3000,reconnectStrategy:false}});redis.on("error",()=>{});connecting=redis.connect();}
    await connecting;if(!redis.isReady)throw Error();
    const key=`tms:whole-trip-confirm:${id}`,lease=randomUUID();
    const code=Number(await redis.eval(`local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; if n>5 then return 2 end; if not redis.call('SET',KEYS[2],ARGV[2],'NX','PX',120000) then return 1 end; return 0`,{keys:[key,`${key}:active`],arguments:[String(windowMs),lease]}));
    if(code===2)throw new ApiError("Too many deletion confirmation attempts. Wait 15 minutes before trying again.",429,"DELETE_CONFIRM_RATE_LIMIT");
    if(code!==0)throw new ApiError("A deletion confirmation is already processing for this Admin.",409,"DELETE_CONFIRM_BUSY");
    const client=redis;
    return async()=>{try{await client.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",{keys:[`${key}:active`],arguments:[lease]});}catch{/* Lease expires; never replay a confirmed mutation. */}};
   } catch(e){if(e instanceof ApiError)throw e;throw new ApiError("Deletion verification rate protection is unavailable. Nothing was deleted.",503,"DELETE_CONFIRM_LIMIT_UNAVAILABLE");}
  }
  if(workers>1)throw new ApiError("Shared rate protection is required for multi-instance deletion.",503,"DELETE_CONFIRM_LIMIT_UNAVAILABLE");
  const time=now();for(const [key,value] of attempts)if(value.until<=time)attempts.delete(key);
  if(active.has(id))throw new ApiError("A deletion confirmation is already processing for this Admin.",409,"DELETE_CONFIRM_BUSY");
  const value=attempts.get(id)??{count:0,until:time+windowMs};
  if(!attempts.has(id)&&attempts.size>=10000)throw new ApiError("Deletion verification is temporarily unavailable.",503,"DELETE_CONFIRM_LIMIT_UNAVAILABLE");
  if(value.count>=5)throw new ApiError("Too many deletion confirmation attempts. Wait 15 minutes before trying again.",429,"DELETE_CONFIRM_RATE_LIMIT");
  value.count++;attempts.set(id,value);active.add(id);
  return async()=>{active.delete(id);};
 };
}
export const enterDeletionConfirmation=createDeletionConfirmationLimit();
