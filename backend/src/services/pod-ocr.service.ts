import {ApiError} from '../utils/api-response.js';
type Factory=typeof import('tesseract.js')['createWorker'];
let initializing=0;
async function bounded<T>(promise:Promise<T>,signal:AbortSignal,error:ApiError):Promise<T>{
 if(signal.aborted)throw error;
 let abort:()=>void=()=>{};
 try{return await Promise.race([promise,new Promise<never>((_,reject)=>{abort=()=>reject(error);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();})]);}
 finally{signal.removeEventListener('abort',abort);}
}
/** The same Tesseract.js engine; initialization, recognition and cleanup are bounded separately. */
export async function createReceiptOcr(signal:AbortSignal,factory?:Factory){
 let worker:Awaited<ReturnType<Factory>>|undefined,closed=false;
 const stop=()=>{closed=true;void worker?.terminate().catch(()=>{});};
 signal.addEventListener('abort',stop,{once:true});
 try{
  const create=factory??(await import('tesseract.js')).createWorker;
  const initSignal=AbortSignal.any([signal,AbortSignal.timeout(12000)]);
  if(initializing>=2)throw new ApiError('Receipt OCR initialization is still recovering. Retry shortly or review manually.',503,'POD_OCR_INIT_BUSY');
  initializing++;
  const creation=Promise.resolve().then(()=>create('eng',1,{logger:()=>{},errorHandler:()=>{},...(process.env.TESSERACT_LANG_PATH?{langPath:process.env.TESSERACT_LANG_PATH}:{}),...(process.env.TESSERACT_CACHE_PATH?{cachePath:process.env.TESSERACT_CACHE_PATH}:{})})).then(created=>{worker=created;if(closed||initSignal.aborted){void created.terminate().catch(()=>{});throw Error('OCR initialization cancelled');}return created;});
  // Hold the initialization slot until the underlying worker settles, even if its caller times out.
  void creation.then(()=>{initializing--;},()=>{initializing--;});
  try{worker=await bounded(creation,initSignal,new ApiError('Receipt OCR could not initialize in time. Retry; an administrator should check English language data and the OCR cache directory.',503,'POD_OCR_INIT_TIMEOUT'));}
  catch(error){if(error instanceof ApiError)throw error;throw new ApiError('Receipt OCR could not initialize. Check the Tesseract installation, English language data and cache permissions; manual review remains available.',503,'POD_OCR_INIT_FAILED');}
  return {
   async recognize(bytes:Buffer){
    if(closed||signal.aborted)throw new ApiError('Receipt OCR was cancelled or timed out. Retry or review manually.',503,'POD_OCR_TIMEOUT');
    try{
     const {data}=await bounded(worker!.recognize(bytes,{rotateAuto:true},{text:true,tsv:true}),AbortSignal.any([signal,AbortSignal.timeout(20000)]),new ApiError('Receipt OCR took too long. Retry or review manually.',503,'POD_OCR_TIMEOUT'));
     const words:Array<{text:string;height:number;left:number;top:number;width:number}>=[];
     for(const line of (data.tsv??'').split(/\r?\n/).slice(1)){const columns=line.split('\t');if(columns[0]!=='5'||columns.length<12)continue;const text=columns.slice(11).join(' ').trim();if(text)words.push({text,height:Number(columns[9]),left:Number(columns[6]),top:Number(columns[7]),width:Number(columns[8])});}
     return {text:(data.text??'').trim().slice(0,40000),confidence:Number.isFinite(data.confidence)?Math.round(data.confidence):0,words};
    }catch(error){stop();if(error instanceof ApiError)throw error;throw new ApiError('Receipt OCR could not process this image. Retry or review it manually.',503,'POD_OCR_FAILED');}
   },
   async close(){signal.removeEventListener('abort',stop);closed=true;if(worker){let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([worker.terminate().catch(()=>{}),new Promise<void>(resolve=>{timer=setTimeout(resolve,1000);})]);}finally{clearTimeout(timer);}}},
  };
 }catch(error){signal.removeEventListener('abort',stop);stop();if(error instanceof ApiError)throw error;throw new ApiError('Receipt OCR dependency is unavailable. Check backend dependencies and English language data; manual review remains available.',503,'POD_OCR_INIT_FAILED');}
}
