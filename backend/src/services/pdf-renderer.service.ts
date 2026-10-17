import {spawn} from "node:child_process";
import {resolve} from "node:path";
import {existsSync} from "node:fs";
import type {PdfPage,PdfRenderer} from "./pod-intake.service.js";
import {renderViaPdfWorker} from "./pdf-worker-client.js";
const source=resolve(__dirname,"pdf-renderer.worker.mjs");
const fallback=resolve(__dirname,"../../src/services/pdf-renderer.worker.mjs");
let active=0;
type RenderLimits=Parameters<PdfRenderer>[1];
function validateLimits(limits:RenderLimits){
 if(!Number.isSafeInteger(limits.pages)||limits.pages<1||limits.pages>10||!Number.isSafeInteger(limits.pixels)||limits.pixels<1||limits.pixels>24000000)throw Error("Invalid PDF render limits");
}
/** Treat child output as untrusted even though the renderer is our own process. */
export function decodePdfRenderResponse(output:Buffer,limits:RenderLimits):PdfPage[]{
 validateLimits(limits);
 if(output.length>28*1024*1024)throw Error("Invalid renderer response");
 const pages:unknown=JSON.parse(output.toString("utf8"));
 if(!Array.isArray(pages)||!pages.length||pages.length>limits.pages)throw Error("Invalid renderer page count");
 let pixels=0,size=0;
 return pages.map(page=>{
  if(!page||page.mime!=="image/png"||!Number.isSafeInteger(page.width)||!Number.isSafeInteger(page.height)||page.width<1||page.height<1||page.width>2200||page.height>2200||typeof page.bytes!=="string"||page.bytes.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(page.bytes))throw Error("Invalid renderer page");
  pixels+=page.width*page.height;
  if(pixels>limits.pixels)throw Error("Renderer pixel budget exceeded");
  const bytes=Buffer.from(page.bytes,"base64");size+=bytes.length;
  if(size>20*1024*1024||bytes.toString("base64")!==page.bytes||bytes.length<24||bytes.subarray(0,8).toString("hex")!=="89504e470d0a1a0a"||bytes.toString("ascii",12,16)!=="IHDR"||bytes.readUInt32BE(16)!==page.width||bytes.readUInt32BE(20)!==page.height)throw Error("Invalid renderer PNG");
  return {bytes,width:page.width,height:page.height,mime:"image/png"};
 });
}
/** Credential-free child with bounded heap/time/stdio/raster output. Use an
 * unprivileged OS/container account in deployment for OS-level isolation. */
export const renderPodPdf:PdfRenderer=async(bytes,limits)=>{
 validateLimits(limits);
 if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>5242880)throw Error("Invalid PDF input size");
 if(process.env.PDF_WORKER_SOCKET&&process.env.PDF_WORKER_PROCESS!=="true")return renderViaPdfWorker(process.env.PDF_WORKER_SOCKET,decodePdfRenderResponse)(bytes,limits);
 if(process.env.NODE_ENV==="production"&&process.env.PDF_WORKER_PROCESS!=="true")throw Error("Production PDF rendering requires the isolated worker socket");
 if(active>=2)throw Error("PDF processing is busy. Retry later.");
 if(limits.signal.aborted)throw Error("PDF processing cancelled");active++;
 try{return await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,["--max-old-space-size=192",existsSync(source)?source:fallback,String(limits.pages),String(limits.pixels)],{
   windowsHide:true,stdio:["pipe","pipe","pipe"],env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP},
  });
  const chunks:Buffer[]=[];let size=0,failed=false;
  // SIGKILL cannot be ignored by a stuck renderer. On Windows Node forcibly terminates it.
  const fail=()=>{failed=true;chunks.length=0;child.kill("SIGKILL");};
  const timer=setTimeout(fail,15000);limits.signal.addEventListener("abort",fail,{once:true});
  if(limits.signal.aborted)fail();
  child.stderr.resume();child.stdin.on("error",()=>{});
  child.stdout.on("data",(data:Buffer)=>{if(failed)return;size+=data.length;if(size>28*1024*1024)fail();else chunks.push(data);});
  child.once("error",()=>{failed=true;});
  child.once("close",code=>{
   clearTimeout(timer);limits.signal.removeEventListener("abort",fail);
   if(failed||code!==0)return reject(Error("PDF validation/render failed"));
   try{resolve(decodePdfRenderResponse(Buffer.concat(chunks),limits));}
   catch{reject(Error("Invalid renderer response"));}
  });child.stdin.end(bytes);
 });}finally{active--;}
};
