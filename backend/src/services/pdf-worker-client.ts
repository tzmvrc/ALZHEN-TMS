import {request} from "node:http";
import type {PdfRenderer,PdfPage} from "./pod-intake.service.js";

/** Private Unix socket only: no TCP listener, credentials or document URLs. */
export const renderViaPdfWorker=(socketPath:string,decode:(output:Buffer,limits:Parameters<PdfRenderer>[1])=>PdfPage[]):PdfRenderer=>async(bytes,limits)=>{
 if(limits.signal.aborted)throw Error("PDF processing cancelled");
 return new Promise((resolve,reject)=>{
  const req=request({socketPath,path:`/render?pages=${limits.pages}&pixels=${limits.pixels}`,method:"POST",headers:{"Content-Type":"application/pdf","Content-Length":bytes.length},signal:limits.signal},res=>{
   const chunks:Buffer[]=[];let size=0;
   res.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>28*1024*1024)res.destroy(Error("PDF worker output exceeded budget"));else chunks.push(chunk);});
   res.on("error",()=>reject(Error("PDF worker unavailable")));
   res.on("end",()=>{
    if(res.statusCode!==200)return reject(Error("PDF worker rejected the document or is busy"));
    try{resolve(decode(Buffer.concat(chunks),limits));}catch{reject(Error("Invalid PDF worker response"));}
   });
  });
  req.setTimeout(16000,()=>req.destroy(Error("PDF worker timeout")));
  req.on("error",()=>reject(Error("PDF worker unavailable or cancelled")));
  req.end(bytes);
 });
};
