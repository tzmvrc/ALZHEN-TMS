import {apiGet,apiUpload,type ApiResponse} from "./api.service";
type Pages={pages:Array<{mime_type:string;data:string}>};
export function decodePdfPages(value:Pages){
 if(!Array.isArray(value.pages)||!value.pages.length||value.pages.length>10)throw Error("Invalid PDF raster pages.");
 let total=0;return value.pages.map(page=>{
  if(page.mime_type!=="image/png"||typeof page.data!=="string"||page.data.length>7*1024*1024)throw Error("Invalid PDF raster page.");
  const binary=atob(page.data);total+=binary.length;if(total>20*1024*1024)throw Error("PDF raster budget exceeded.");
  return new Blob([Uint8Array.from(binary,c=>c.charCodeAt(0))],{type:"image/png"});
 });
}
export async function pdfIntakeAvailable(token:string){const r=await apiGet<ApiResponse<{pdf:boolean}>>("/truckers/me/pod-intake-capabilities",token);return r.data?.pdf===true;}
export async function prepareDriverPdf(token:string,trip:string,stop:string,file:File){
 const r=await apiUpload<ApiResponse<Pages>>(`/truckers/me/trips/${encodeURIComponent(trip)}/pod/prepare`,file,file.type,file.name,token,{"X-Trip-Stop-Id":stop});
 if(!r.success||!r.data)throw Error(r.message||"PDF preparation failed.");return decodePdfPages(r.data);
}
export async function savedPdfPages(token:string,trip:string,receipt:string){
 const r=await apiGet<ApiResponse<Pages>>(`/trips/${encodeURIComponent(trip)}/receipts/${encodeURIComponent(receipt)}/pages`,token);
 if(!r.success||!r.data)throw Error(r.message||"PDF pages unavailable.");return decodePdfPages(r.data);
}
