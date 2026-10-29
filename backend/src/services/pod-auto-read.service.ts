import {extractPodVision,POD_VISION_MODEL,reviewablePodVision} from './pod-vision.service.js';
import {createHash} from 'node:crypto';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {supabaseAdmin as db} from '../config/supabase.js';
import {ApiError} from '../utils/api-response.js';
import {isValidUuid} from '../utils/validation.js';
import {deliveryAssignment,type DeliveryActor} from './delivery-workspace.service.js';
import {validatePodDocument} from './pod-document.logic.js';
import {createReceiptOcr} from './pod-ocr.service.js';
import {extractOcrFields,mergePodFields,validateAiFields,clearlyUnreadable,podExtractionRequest,type PodContext,type PodFields} from './pod-extraction.logic.js';
import {renderPodPdf} from './pdf-renderer.service.js';

type Fields=PodFields;
type Result={non_pod_confirmed?:boolean;document_classification?:import('./pod-vision.service.js').VisionDocumentClassification;unreadable_confirmed?:boolean;serial_groups?:import('./pod-vision.service.js').VisionSerialGroup[];scan_complete?:boolean;scan_issues?:string[];conflicts?:{dr:string[];date:string[]};source?:'vision'|'ocr_fallback';state:'READY'|'PARTIAL'|'UNREADABLE'|'UNAVAILABLE'|'INVALID';fields:Fields;ocr_text:string;confidence:number|null;warnings:string[];message?:string;code?:string;detected_dr?:string;service_error?:{code:string;message:string}};
const blank=():Fields=>({dr:'',receiver:'',date:'',models:''});
const unreadable="We couldn't read this receipt clearly. Please take another photo.";
const norm=(value:string)=>value.replace(/\s+/g,' ').trim().toLowerCase();
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const cache=new Map<string,{until:number;result:Result}>(),ocrCache=new Map<string,{until:number;text:string;confidence:number;warnings:string[];bad:boolean}>();
const ocrListeners=new Map<string,Set<(result:Result)=>void>>(),preliminary=new Map<string,Result>();
const pending=new Map<string,Promise<Result>>(),budgets=new Map<string,{at:number;count:number}>();
let active=0,modelCheck:{key:string;until:number;request:Promise<void>}|undefined;

function configuration(){
 const key=process.env.DEEPSEEK_API_KEY?.trim(),model=process.env.DEEPSEEK_MODEL?.trim();
 if(process.env.POD_AI_ENABLED!=='true'||!key||!model)throw new ApiError('Automatic receipt reading is disabled or not configured. Retry later or review manually.',503,'POD_AI_NOT_CONFIGURED');
 if(/flash/i.test(model))throw new ApiError('Configure a supported non-Flash DeepSeek model. Manual review remains available.',503,'POD_AI_MODEL_UNSUPPORTED');
 let base:URL;try{base=new URL(process.env.DEEPSEEK_BASE_URL??'https://api.deepseek.com');}catch{throw new ApiError('The backend DeepSeek API URL is invalid.',503,'POD_AI_CONFIGURATION');}
 if(base.protocol!=='https:'||base.hostname!=='api.deepseek.com'||base.username||base.password||base.search||base.hash||!['/','/v1','/v1/'].includes(base.pathname))throw new ApiError('Configure the official HTTPS DeepSeek API base URL.',503,'POD_AI_CONFIGURATION');
 return {key,model,base:base.href.replace(/\/$/,'')};
}
async function jsonBody(response:Response){
 const reader=response.body?.getReader();if(!reader)throw Error('No provider response');
 let bytes=0,text='';const decoder=new TextDecoder();
 while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>100000){await reader.cancel();throw Error('Response too large');}text+=decoder.decode(part.value,{stream:true});}
 return JSON.parse(text+decoder.decode());
}
async function confirmModel(config:ReturnType<typeof configuration>){
 const key=createHash('sha256').update(`${config.key}:${config.base}:${config.model}`).digest('hex');
 if(modelCheck?.key===key&&modelCheck.until>Date.now())return modelCheck.request;
 const request=(async()=>{
  const response=await fetch(`${config.base}/models`,{headers:{Authorization:`Bearer ${config.key}`},signal:AbortSignal.timeout(5000),redirect:'error'});
  if(response.status===401||response.status===403)throw new ApiError('DeepSeek authentication failed. Ask an administrator to check the API key and account access; OCR details are retained.',503,'POD_AI_AUTH_FAILED');
  if(!response.ok)throw new ApiError('DeepSeek model compatibility could not be checked. Check the backend account configuration, or review manually.',503,'POD_AI_MODEL_CHECK_FAILED');
  const body=await jsonBody(response);
  if(!Array.isArray(body.data)||!body.data.some((item:unknown)=>object(item)&&item.id===config.model))throw new ApiError('The configured DeepSeek model is not listed for this API account. Ask an administrator to check DEEPSEEK_MODEL; manual review remains available.',503,'POD_AI_MODEL_UNSUPPORTED');
 })();
 modelCheck={key,until:Date.now()+600000,request};
 try{await request;}catch(error){if(modelCheck?.request===request)modelCheck.until=Date.now()+30000;throw error;}
}
// Inspect encoded dimensions before decoding to bound raster memory.
function dimensions(bytes:Buffer,mime:string):[number,number]{
 if(mime==='image/png'&&bytes.length>=24)return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
 if(mime==='image/webp'&&bytes.length>=30){
  const kind=bytes.toString('ascii',12,16);
  if(kind==='VP8X')return [1+bytes.readUIntLE(24,3),1+bytes.readUIntLE(27,3)];
  if(kind==='VP8 ')return [bytes.readUInt16LE(26)&16383,bytes.readUInt16LE(28)&16383];
  if(kind==='VP8L'){const bits=bytes.readUInt32LE(21);return [(bits&16383)+1,((bits>>>14)&16383)+1];}
 }
 if(mime==='image/jpeg'){let offset=2;while(offset+8<bytes.length){if(bytes[offset++]!==255)continue;while(bytes[offset]===255)offset++;const marker=bytes[offset++];if(marker===217||marker===218)break;if(marker===216||marker===1||marker>=208&&marker<=215)continue;const size=bytes.readUInt16BE(offset);if(size<2||offset+size>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return [bytes.readUInt16BE(offset+5),bytes.readUInt16BE(offset+3)];offset+=size;}}
 throw new ApiError('This image could not be safely decoded. Choose another receipt photo.',422,'POD_IMAGE_INVALID');
}
async function imageQuality(bytes:Buffer,mime:string){
 const [width,height]=dimensions(bytes,mime);
 if(width<1||height<1||width*height>24000000)throw new ApiError('Receipt image dimensions exceed the safe processing limit. Choose a smaller photo.',422,'POD_IMAGE_INVALID');
 const image=await loadImage(bytes),ratio=Math.min(1,640/Math.max(width,height));
 const canvas=createCanvas(Math.max(1,Math.round(width*ratio)),Math.max(1,Math.round(height*ratio))),ctx=canvas.getContext('2d');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
 const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data,gray=new Float32Array(canvas.width*canvas.height);
 let dark=0,light=0,sum=0,square=0,count=0;
 for(let i=0;i<gray.length;i++){const value=.299*rgba[i*4]+.587*rgba[i*4+1]+.114*rgba[i*4+2];gray[i]=value;if(value<25)dark++;if(value>245)light++;}
 for(let y=1;y<canvas.height-1;y++)for(let x=1;x<canvas.width-1;x++){const i=y*canvas.width+x,v=4*gray[i]-gray[i-1]-gray[i+1]-gray[i-canvas.width]-gray[i+canvas.width];sum+=v;square+=v*v;count++;}
 return {width,height,dark:dark/gray.length,glare:light/gray.length,sharpness:count?square/count-(sum/count)**2:0};
}
const structuredCache=new Map<string,{until:number;value:{fields:Fields;nonReceipt:boolean}}>();
const structuredPending=new Map<string,Promise<{fields:Fields;nonReceipt:boolean}>>();
async function structure(text:string){
 const config=configuration(),key=createHash('sha256').update(JSON.stringify([config.base,config.model,config.key,podExtractionRequest(config.model,text)])).digest('hex');
 for(const [k,item] of structuredCache)if(item.until<=Date.now())structuredCache.delete(k);
 const cached=structuredCache.get(key);if(cached)return cached.value;
 const flight=structuredPending.get(key);if(flight)return flight;
 const request=structureUncached(text,config);structuredPending.set(key,request);
 try{const value=await request;if(structuredCache.size>=100)structuredCache.delete(structuredCache.keys().next().value!);structuredCache.set(key,{until:Date.now()+600000,value});return value;}finally{structuredPending.delete(key);}
}
async function structureUncached(text:string,config:ReturnType<typeof configuration>){
 await confirmModel(config);
 const response=await fetch(`${config.base}/chat/completions`,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${config.key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(18000),body:JSON.stringify(podExtractionRequest(config.model,text))});
 if(response.status===401||response.status===403)throw new ApiError('DeepSeek authentication failed. Ask an administrator to check API access; OCR details are retained.',503,'POD_AI_AUTH_FAILED');
 if(!response.ok)throw new ApiError(response.status===429?'Receipt AI is busy. Retry shortly or review manually.':'DeepSeek could not read this receipt. Retry or review manually; an administrator may need to check model access and JSON output support.',503,response.status===429?'POD_AI_RATE_LIMIT':'POD_AI_UNAVAILABLE');
 const envelope=await jsonBody(response),choice=envelope.choices?.[0];
 if(choice?.finish_reason!=='stop'||typeof choice.message?.content!=='string')throw new ApiError('DeepSeek returned an incomplete extraction. OCR details are retained; retry or complete the fields manually.',502,'POD_AI_INCOMPLETE');
 let result:unknown;try{result=JSON.parse(choice.message.content);}catch{throw new ApiError('DeepSeek returned invalid JSON. OCR details are retained; retry or review manually.',502,'POD_AI_INVALID');}
 if(!object(result)||!object(result.fields))throw new ApiError('DeepSeek returned an invalid JSON extraction. OCR details are retained; retry or review manually.',502,'POD_AI_INVALID');
 const fields=validateAiFields(result.fields,text);
 const nonReceipt=result.document_type==='not_receipt'&&typeof result.document_evidence==='string'&&!!norm(result.document_evidence)&&norm(text).includes(norm(result.document_evidence))&&!/delivery\s*receipt|\bD\.?\s*R\.?\b|received\s*by|receiver|waybill/i.test(text);
 return {fields,nonReceipt};
}
export async function enhancePodExtraction(text:string,confidence:number,context:PodContext,interpreter=structure):Promise<Result>{
 const base=extractOcrFields(text,context);let ai={fields:blank(),nonReceipt:false},serviceError:Result['service_error'];
 try{ai=await interpreter(text);}catch(error){const timedOut=error instanceof Error&&['TimeoutError','AbortError'].includes(error.name);serviceError={code:error instanceof ApiError?error.code:timedOut?'POD_AI_TIMEOUT':'POD_AI_FAILED',message:error instanceof ApiError?error.message:timedOut?'DeepSeek timed out. OCR details are retained; retry or review manually.':'DeepSeek did not finish reading the receipt. OCR details are retained; retry or review manually.'};}
 const {fields,detectedDr}=mergePodFields(base,ai.fields,context),hasFields=Object.values(fields).some(Boolean),complete=Object.values(fields).every(Boolean);
 if(ai.nonReceipt&&confidence>=70&&!hasFields&&text.length>=30)return {state:'UNREADABLE',fields:blank(),ocr_text:'',confidence,warnings:[],message:unreadable};
 const state=!hasFields?'UNAVAILABLE':complete&&!serviceError?'READY':'PARTIAL';
 return {state,fields,ocr_text:text.slice(0,16000),confidence,warnings:[],detected_dr:detectedDr,...(serviceError?{service_error:serviceError,code:serviceError.code}:{}),message:state==='UNAVAILABLE'?'Automatic reading is unavailable. Retry or enter the details manually.':state==='PARTIAL'?'Some receipt details were filled automatically. Review the remaining fields.':'Receipt details are ready for your review.'};
}
export async function readPodAutomatically(actor:DeliveryActor,assignmentId:string,stopId:string,bytes:Buffer,mime:string,name:string,onOcr?:(result:Result)=>void):Promise<Result>{
 if(actor.role!=='TRUCKER'||!isValidUuid(stopId))throw new ApiError('Select an assigned delivery stop.',403,'POD_ACCESS_DENIED');
 const assignment=await deliveryAssignment(actor,assignmentId,true);
 const stop=await db.from('trip_stops').select('id,dr_number').eq('id',stopId).eq('trip_id',assignment.trip_id).is('archived_at',null).maybeSingle();
 if(stop.error||!stop.data)throw new ApiError('This receipt stop is unavailable.',403,'POD_ACCESS_DENIED');
 const receiptStop=stop.data;
 const cargo=await db.from('trip_cargo_allocations').select('line:trip_line_items!inner(dr_number,trip_stop_id,customer_model,product:products(model_code))').eq('trip_id',assignment.trip_id).eq('assignment_id',assignmentId).eq('line.trip_stop_id',stopId).limit(501);
 if(cargo.error||(cargo.data?.length??0)>500)throw new ApiError('Assigned receipt numbers could not be confirmed. Retry or review manually.',503,'POD_DR_LOOKUP_FAILED');
 const lines=(cargo.data??[]).map((row:any)=>Array.isArray(row.line)?row.line[0]:row.line);
 const store=await db.from('trip_stops').select('store:customer_stores(name)').eq('id',stopId).eq('trip_id',assignment.trip_id).maybeSingle();
 const storeRow=store.data?.store as any;
 const context:PodContext={drs:[...new Set(lines.map((line:any)=>String(line?.dr_number||receiptStop.dr_number||'').trim()).filter(Boolean))] as string[],stores:store.error?[]:[Array.isArray(storeRow)?storeRow[0]?.name:storeRow?.name].filter((name):name is string=>typeof name==='string'&&!!name),models:[...new Set(lines.map((line:any)=>line?.customer_model||(Array.isArray(line?.product)?line.product[0]:line?.product)?.model_code).filter((model:any)=>typeof model==='string'&&!!model))] as string[]};
 if(!context.drs.length&&receiptStop.dr_number)context.drs.push(receiptStop.dr_number.trim());

 if(assignment.stop_scope!=='ALL'){const scope=await db.from('trip_assignment_stops').select('id').eq('assignment_id',assignmentId).eq('trip_stop_id',stopId).maybeSingle();if(scope.error||!scope.data)throw new ApiError('This stop is not assigned to your truck.',403,'POD_ACCESS_DENIED');}
 validatePodDocument(bytes,mime,name,process.env.POD_PDF_ENABLED==='true');
 const signature=createHash('sha256').update(JSON.stringify([actor.id,assignmentId,stopId,'flash-serial-classification-v3',process.env.POD_AI_ENABLED])).update(bytes).digest('hex'),now=Date.now();
 for(const store of [cache,ocrCache])for(const [key,item]of store)if(item.until<=now)store.delete(key);
 for(const [key,item]of budgets)if(now-item.at>=60000)budgets.delete(key);
 const cached=cache.get(signature);if(cached)return cached.result;
 const flight=pending.get(signature);if(flight){if(onOcr){ocrListeners.get(signature)?.add(onOcr);const early=preliminary.get(signature);if(early)onOcr(early);}return flight;}
 const budget=budgets.get(actor.id)??{at:now,count:0};
 if(active>=2||budget.count>=6||budgets.size>=1000)throw new ApiError('Receipt reading is busy. Retry shortly or review manually.',429,'POD_AI_RATE_LIMIT');
 budget.count++;budgets.set(actor.id,budget);active++;
 ocrListeners.set(signature,new Set(onOcr?[onOcr]:[]));
 const request=(async():Promise<Result>=>{
  let text='',confidence:number|null=null;
  try{
   const pages=mime==='application/pdf'?await renderPodPdf(bytes,{pages:10,pixels:24000000,signal:AbortSignal.timeout(15000)}):[{bytes,mime}];
   const assessed=[];for(const page of pages)assessed.push({...page,quality:await imageQuality(page.bytes,page.mime)});
   let visionFailure:unknown;
   try{
    const vision=await extractPodVision(pages),review=reviewablePodVision(vision,context.drs),fields=review.fields,detectedDr=review.detected_dr;
    if(vision.non_pod_confirmed===true)return {source:'vision',state:'INVALID',non_pod_confirmed:true,document_classification:vision.document_classification,fields:blank(),ocr_text:'',confidence:null,warnings:[]};
    if(vision.unreadable_confirmed===true)return {source:'vision',state:'UNREADABLE',unreadable_confirmed:true,fields:blank(),ocr_text:'',confidence:null,warnings:[]};
    if(!Object.values(fields).some(Boolean)&&!vision.serial_groups?.some(group=>group.serials.length||group.uncertain_serials.length))throw new ApiError('No reliable receipt fields were found in the image.',503,'POD_VISION_NO_FIELDS');
    const complete=!!fields.dr&&!!fields.receiver&&!!fields.date&&vision.scan_complete===true;
    const result:Result={...review,document_classification:vision.document_classification,serial_groups:vision.serial_groups,scan_complete:vision.scan_complete,scan_issues:vision.scan_issues,conflicts:vision.conflicts,source:'vision',state:complete?'READY':'PARTIAL',fields,detected_dr:detectedDr,confidence:null,warnings:[],ocr_text:`AI image extraction (unreviewed, ${POD_VISION_MODEL})\nDR: ${detectedDr}\nReceived by / store: ${vision.fields.receiver}\nDelivery date: ${vision.fields.date}\nDetected product models: ${vision.fields.models}`,message:complete?'Receipt details are ready for your review.':'Some receipt details were filled automatically. Review the remaining fields.'};
    if(cache.size>=100)cache.delete(cache.keys().next().value!);if(vision.scan_complete)cache.set(signature,{until:Date.now()+600000,result});return result;
   }catch(error){visionFailure=error;}
   let extracted=ocrCache.get(signature);
   if(!extracted){
    const results=[];const warnings:string[]=[],signal=AbortSignal.timeout(25000);let badPages=0;
    const reader=await createReceiptOcr(signal);
    try{for(const page of assessed){
     const quality=page.quality,ocr=await reader.recognize(page.bytes);
     const bad=clearlyUnreadable(quality,ocr.text,ocr.confidence);
     if(bad)badPages++;
     const tiny=ocr.words.filter(w=>w.height>0&&w.height<10).length>ocr.words.length*.6;
     const cropped=ocr.words.filter(w=>w.left<2||w.top<2||w.left+w.width>quality.width-2||w.top+w.height>quality.height-2).length>2;
     if(tiny||cropped||quality.dark>.65||quality.sharpness<10||quality.glare>.995&&ocr.confidence<30)warnings.push('Check that the whole receipt is visible and its text is readable before submitting.');
     results.push(ocr);text=results.map(result=>result.text).join('\n\n').slice(0,40000);confidence=Math.round(results.reduce((sum,result)=>sum+result.confidence,0)/results.length);
    }}finally{await reader.close();}
    extracted={until:Date.now()+600000,text:results.map(r=>r.text).join('\n\n').slice(0,40000),confidence:Math.round(results.reduce((n,r)=>n+r.confidence,0)/results.length),warnings:[...new Set(warnings)],bad:badPages===pages.length};
    if(ocrCache.size>=100)ocrCache.delete(ocrCache.keys().next().value!);ocrCache.set(signature,extracted);
   }
   text=extracted.text;confidence=extracted.confidence;
   let result:Result;
   if(extracted.bad)result={state:'UNREADABLE',fields:blank(),ocr_text:'',confidence,warnings:[],message:unreadable};
   else{
    if(text.replace(/[^a-z0-9]/gi,'').length<4)throw new ApiError('OCR found no reliable text. Retry with a clearer photo or review the image manually.',503,'POD_OCR_NO_TEXT');
    const early:Result={state:'PARTIAL',fields:extractOcrFields(text,context),ocr_text:text.slice(0,16000),confidence,warnings:[]};
    preliminary.set(signature,early);for(const listener of ocrListeners.get(signature)??[])listener(early);
    result=await enhancePodExtraction(text,confidence,context,async()=>{throw visionFailure;});result.source='ocr_fallback';
    result.warnings=[...new Set([...extracted.warnings,...result.warnings])];
   }
   if(cache.size>=100)cache.delete(cache.keys().next().value!);if(!result.service_error)cache.set(signature,{until:Date.now()+600000,result});return result;
  }catch(error){if(error instanceof ApiError&&error.code==='POD_IMAGE_INVALID')return {state:'UNREADABLE',fields:blank(),ocr_text:'',confidence:null,warnings:[],message:unreadable};const fields=extractOcrFields(text,context),partial=Object.values(fields).some(Boolean),problem={message:error instanceof ApiError?error.message:'Receipt processing failed. Any readable OCR details are retained; retry or review manually.',code:error instanceof ApiError?error.code:'POD_READING_UNAVAILABLE'};return {state:partial?'PARTIAL':'UNAVAILABLE',fields,ocr_text:text.slice(0,16000),confidence,warnings:[],message:partial?"Some details couldn't be read. Please complete the missing fields.":problem.message,code:problem.code,service_error:problem};}
  finally{active--;pending.delete(signature);ocrListeners.delete(signature);preliminary.delete(signature);}
 })();pending.set(signature,request);return request;
}
