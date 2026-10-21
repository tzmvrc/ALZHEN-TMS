/** Share simultaneous reads only. Completed results (including permissions)
 * are never cached: every later request must validate against the live source. */
export function createConcurrentReadGate(maxPending=128){
 const pending=new Map<string,Promise<unknown>>();
 return async function read<T>(key:string,load:()=>PromiseLike<T>|Promise<T>):Promise<T>{
  const existing=pending.get(key);if(existing)return existing as Promise<T>;
  if(pending.size>=maxPending)return load();
  const request=Promise.resolve().then(load);pending.set(key,request);
  try{return await request;}finally{if(pending.get(key)===request)pending.delete(key);}
 };
}
