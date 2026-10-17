import {createHash} from "node:crypto";
import {imageMime} from "../models/clientwebsite.validation.js";
import {ApiError} from "../utils/api-response.js";

/** Intake preparation only. PDF remains disabled until bucket/renderer approval. */
export function validatePodDocument(bytes:Buffer,contentType:string,fileName:string,allowPdf=false){
 if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>5*1024*1024)throw new ApiError("Choose a POD document up to 5 MB.",400,"POD_DOCUMENT_INVALID");
 if(!fileName.trim()||fileName.length>255||/[\0\r\n]/.test(fileName))throw new ApiError("Invalid POD document filename.",400,"POD_DOCUMENT_INVALID");
 const detected=imageMime(bytes);
 if(contentType==="application/pdf"){
  if(!allowPdf)throw new ApiError("PDF intake awaits approved Storage configuration and PDF rendering support. Use a receipt image for now.",409,"POD_PDF_DISABLED");
  const text=bytes.toString("latin1");
  if(!/^%PDF-(?:1\.[0-7]|2\.0)\b/.test(text)||!/%%EOF\s*$/.test(text.slice(-2048))||/\/(?:Encrypt|JavaScript|JS|Launch|OpenAction)\b/.test(text))throw new ApiError("Choose an unencrypted PDF without active content. The PDF renderer must also validate it before OCR.",400,"POD_DOCUMENT_INVALID");
 }else if(!detected||detected!==contentType)throw new ApiError("POD file content does not match its image type.",400,"POD_DOCUMENT_INVALID");
 return {mime_type:contentType,file_name:fileName.trim(),file_sha256:createHash("sha256").update(bytes).digest("hex"),size:bytes.length};
}
