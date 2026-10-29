import {apiUpload,ApiError,type ApiResponse} from './api.service';
import type {ReceiptFields} from './receipt-fields.service';
export type AutomaticPodReading={non_pod_confirmed?:boolean;document_classification?:{kind:'pod'|'continuation'|'unrelated'|'uncertain';confidence:number;contains_delivery_content:boolean|null;reason:string};unreadable_confirmed?:boolean;source?:'vision'|'ocr_fallback';scan_complete?:boolean;scan_issues?:string[];conflicts?:{dr:string[];date:string[]};serial_groups?:Array<{model:string|null;heading:string;association_clear:boolean;serials:string[];uncertain_serials:string[];quantity:number|null}>;state:'READY'|'PARTIAL'|'UNREADABLE'|'UNAVAILABLE'|'INVALID';fields:ReceiptFields;ocr_text:string;confidence:number|null;warnings:string[];message?:string;code?:string;detected_dr?:string;service_error?:{code:string;message:string}};
export function podPhotoRejection(result:AutomaticPodReading):'unreadable'|'unrelated'|null{
 if(result.source!=='vision'||result.service_error||result.code||result.ocr_text.trim()||Object.values(result.fields).some(Boolean)||result.serial_groups?.some(group=>group.heading||group.model||group.serials.length||group.uncertain_serials.length||group.quantity!==null))return null;
 if(result.state==='UNREADABLE'&&result.unreadable_confirmed===true)return 'unreadable';
 const classification=result.document_classification;
 if(result.state==='INVALID'&&result.non_pod_confirmed===true&&classification?.kind==='unrelated'&&classification.confidence>=.98&&classification.confidence<=1&&classification.contains_delivery_content===false&&typeof classification.reason==='string'&&classification.reason.trim())return 'unrelated';
 return null;
}
export const shouldRemovePodPhoto=(result:AutomaticPodReading)=>podPhotoRejection(result)!==null;
export async function readPodPhoto(token:string,assignment:string,stop:string,file:File,signal?:AbortSignal,onOcr?:(result:AutomaticPodReading)=>void){
 try{
 const response=await apiUpload<ApiResponse<AutomaticPodReading>>(`/delivery/assignments/${encodeURIComponent(assignment)}/pod/read`,file,file.type,file.name,token,{'X-Trip-Stop-Id':stop,...(onOcr?{Accept:'application/x-ndjson'}:{})},105000,signal,onOcr?data=>onOcr(data as AutomaticPodReading):undefined);
 if(!response.success||!response.data)throw Error(response.message||'Receipt reading is unavailable. Retry or review manually.');
 return response.data;
 }catch(error){
  if(error instanceof ApiError&&['POD_DOCUMENT_INVALID','POD_IMAGE_INVALID'].includes(error.code??''))return {state:'UNREADABLE' as const,fields:{dr:'',receiver:'',date:'',models:''},ocr_text:'',confidence:null,warnings:[],message:"We couldn't read this receipt clearly. Please take another photo."};
  if(error instanceof ApiError&&error.status===401)throw Error('Your session expired. Sign in again to read the receipt.');
  if(error instanceof ApiError&&error.status===403)throw Error('This receipt is not available to your account or truck assignment.');
  if(error instanceof ApiError&&error.status===408)throw Error('Receipt reading timed out. Partial details are preserved; retry or review manually.');
  throw error;
 }
}
