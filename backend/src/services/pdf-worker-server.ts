import {createServer,type IncomingMessage} from "node:http";
import {spawn} from "node:child_process";
import type {PdfRenderer,PdfPage} from "./pod-intake.service.js";

/** Optional server-side OCR, using installed offline English language data. */
export async function recognizePdfPages(pages:PdfPage[],signal:AbortSignal):Promise<string>{
 let total=0;const texts:string[]=[];
 for(const page of pages){
  if(signal.aborted)throw Error("OCR cancelled");
  const text=await new Promise<string>((resolve,reject)=>{
   const child=spawn("tesseract",["stdin","stdout","-l","eng","--psm","3"],{stdio:["pipe","pipe","pipe"],windowsHide:true,env:{PATH:process.env.PATH,OMP_THREAD_LIMIT:"1",TMPDIR:"/tmp"}});
   const chunks:Buffer[]=[];let size=0,failed=false;
   const kill=()=>{failed=true;chunks.length=0;child.kill("SIGKILL");};
   const timer=setTimeout(kill,20000);signal.addEventListener("abort",kill,{once:true});if(signal.aborted)kill();
   child.stdin.on("error",()=>{});child.stderr.resume();child.once("error",()=>{failed=true;});
   child.stdout.on("data",(chunk:Buffer)=>{if(failed)return;size+=chunk.length;if(size>65536)kill();else chunks.push(chunk);});
   child.once("close",code=>{clearTimeout(timer);signal.removeEventListener("abort",kill);if(failed||code!==0)reject(Error("OCR failed"));else resolve(Buffer.concat(chunks).toString("utf8"));});
   child.stdin.end(page.bytes);
  });
  total+=Buffer.byteLength(text);if(total>131072)throw Error("OCR text budget exceeded");texts.push(text);
 }
 return texts.join("\n\n");
}

export function createPdfWorkerServer(render:PdfRenderer,ocr=recognizePdfPages){
 let busy=false;
 const server=createServer(async(req,res)=>{
  if(req.method==="GET"&&req.url==="/health"){res.writeHead(200,{"Content-Type":"application/json"});res.end('{"status":"ok"}');return;}
  const url=new URL(req.url??"/","http://worker");
  if(req.method!=="POST"||!["/render","/ocr"].includes(url.pathname)){res.writeHead(404);res.end();return;}
  if(busy){res.writeHead(503);res.end("PDF worker busy");req.resume();return;}
  const pages=Number(url.searchParams.get("pages")),pixels=Number(url.searchParams.get("pixels"));
  if(Number(req.headers["content-length"])>5242880){res.writeHead(413);res.end("PDF size limit exceeded");req.resume();return;}
  if(req.headers["content-type"]!=="application/pdf"||!Number.isSafeInteger(pages)||pages<1||pages>10||!Number.isSafeInteger(pixels)||pixels<1||pixels>24000000){res.writeHead(400);res.end("Invalid PDF request");req.resume();return;}
  busy=true;const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),url.pathname==="/ocr"?45000:15000);
  const cancel=()=>controller.abort();req.once("aborted",cancel);res.once("close",cancel);
  try{
   const bytes=await readBody(req,controller.signal);if(controller.signal.aborted)throw Error("Cancelled");
   const rendered=await render(bytes,{pages,pixels,signal:controller.signal});
   const result=url.pathname==="/ocr"?{text:await ocr(rendered,controller.signal),pages:rendered.length}:rendered.map(p=>({...p,bytes:p.bytes.toString("base64")}));
   if(controller.signal.aborted)throw Error("Cancelled");
   res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(result));
  }catch{if(!res.destroyed){res.writeHead(400);res.end("PDF processing failed");}}
  finally{clearTimeout(timer);req.off("aborted",cancel);res.off("close",cancel);busy=false;}
 });
 server.requestTimeout=10000;server.headersTimeout=5000;server.keepAliveTimeout=1000;
 return server;
}
async function readBody(req:IncomingMessage,signal:AbortSignal){
 const chunks:Buffer[]=[];let size=0;
 const abort=()=>req.destroy();signal.addEventListener("abort",abort,{once:true});
 try{if(signal.aborted)throw Error("Cancelled");for await(const chunk of req){size+=chunk.length;if(size>5242880)throw Error("PDF size");chunks.push(chunk);}}
 finally{signal.removeEventListener("abort",abort);}
 const bytes=Buffer.concat(chunks);if(!bytes.length||!bytes.subarray(0,8).toString("ascii").startsWith("%PDF-"))throw Error("Invalid PDF");return bytes;
}
