import {validatePodDocument} from "./pod-document.logic.js";
import {ApiError} from "../utils/api-response.js";

export type PdfPage={bytes:Buffer;width:number;height:number;mime:"image/png"};
/** Renderer must parse/validate the PDF and enforce page/pixel/memory/time limits
 * in a bounded child. Deployment must also provide OS isolation before activation. */
export type PdfRenderer=(bytes:Buffer,limits:{pages:number;pixels:number;signal:AbortSignal})=>Promise<PdfPage[]>;
export type PodIntakePolicy={pdfEnabled:boolean;bucketPrivate:boolean;allowedMimeTypes:string[];maxBytes:number};

/** Prepared admission/render stage for the EXISTING private receipt uploader.
 * It never writes Storage, changes bucket settings or updates operational data. */
export async function preparePodIntake(bytes:Buffer,mime:string,name:string,policy:PodIntakePolicy,renderer?:PdfRenderer){
 if(!policy.bucketPrivate)throw new ApiError("POD originals require private Storage.",503,"POD_STORAGE_INVALID");
 const pdf=mime==="application/pdf";
 if(pdf&&(!policy.pdfEnabled||!policy.allowedMimeTypes.includes(mime)||!renderer))throw new ApiError("PDF intake is not activated. Use JPEG, PNG or WebP until private Storage and PDF rendering are approved.",409,"POD_PDF_DISABLED");
 if(!policy.allowedMimeTypes.includes(mime))throw new ApiError("This document type is not supported by receipt Storage.",400,"POD_DOCUMENT_INVALID");
 if(bytes.length>Math.min(policy.maxBytes,5*1024*1024))throw new ApiError("Choose a POD document up to 5 MB.",400,"POD_DOCUMENT_INVALID");
 const metadata=validatePodDocument(bytes,mime,name,pdf);
 if(!pdf)return {original:bytes,metadata,ocrPages:[bytes]};
 try{
  const pages=await renderer!(bytes,{pages:10,pixels:24000000,signal:AbortSignal.timeout(15000)});
  if(!pages.length||pages.length>10)throw new Error("Invalid page count");
  let pixels=0,size=0;
  for(const page of pages){
   if(!Number.isSafeInteger(page.width)||!Number.isSafeInteger(page.height)||page.width<1||page.height<1)throw new Error("Invalid raster dimensions");
   pixels+=page.width*page.height;size+=page.bytes.length;
   if(pixels>24000000||size>20*1024*1024)throw new Error("Raster budget exceeded");
   validatePodDocument(page.bytes,page.mime,"pod-page.png");
  }
  return {original:bytes,metadata,ocrPages:pages.map(page=>page.bytes)};
 }catch{throw new ApiError("PDF could not be safely rendered. Use a clear receipt image instead.",400,"POD_PDF_RENDER_FAILED");}
}
