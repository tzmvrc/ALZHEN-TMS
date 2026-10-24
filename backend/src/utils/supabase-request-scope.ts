import {AsyncLocalStorage} from 'node:async_hooks';
const deadlines=new AsyncLocalStorage<AbortSignal>();
/** Only explicitly scoped background work inherits this deadline. */
export const currentSupabaseDeadline=()=>deadlines.getStore();
export function withSupabaseDeadline<T>(ms:number,work:()=>Promise<T>):Promise<T>{return deadlines.run(AbortSignal.timeout(ms),work);}
