import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {request} from "node:http";
import {createPdfWorkerServer} from "../src/services/pdf-worker-server.js";
import {renderViaPdfWorker} from "../src/services/pdf-worker-client.js";
import {decodePdfRenderResponse,renderPodPdf} from "../src/services/pdf-renderer.service.js";
import {productionHttpConfig} from "../src/config/http.js";
import {syntheticPdf} from "./fixtures/synthetic-pdf.js";

test("production HTTP config requires exact HTTPS origins and bounded proxy trust",()=>{
 assert.throws(()=>productionHttpConfig({NODE_ENV:"production"}),/CORS/);
 for(const origin of ["*","http://tms.example.com","https://tms.example.com/path",","])assert.throws(()=>productionHttpConfig({NODE_ENV:"production",CORS_ORIGINS:origin}),/CORS/);
 assert.throws(()=>productionHttpConfig({TRUST_PROXY_HOPS:"99"}),/TRUST_PROXY/);
 const config=productionHttpConfig({NODE_ENV:"production",CORS_ORIGINS:"https://tms.example.com",TRUST_PROXY_HOPS:"1"});
 assert.equal(config.trustProxy,1);
 const origin=config.cors.origin;if(typeof origin!=="function")throw Error("Expected origin checker");
 origin("https://tms.example.com",(_e,allowed)=>assert.equal(allowed,true));
 origin("https://unrelated.example.com",(_e,allowed)=>assert.equal(allowed,false));
 const development=productionHttpConfig({}).cors.origin;
 if(typeof development!=="function")throw Error("Expected development origin checker");
 development("http://localhost:5199",(_e,allowed)=>assert.equal(allowed,true));
});

test("private socket worker bounds requests, supports OCR, refuses concurrency and sanitizes failures",async()=>{
 const socket=process.platform==="win32"?`\\\\.\\pipe\\alzhen-pdf-${randomUUID()}`:`/tmp/alzhen-pdf-${randomUUID()}.sock`;
 const png=Buffer.alloc(24);Buffer.from("89504e470d0a1a0a","hex").copy(png);png.write("IHDR",12);png.writeUInt32BE(10,16);png.writeUInt32BE(10,20);
 let release:()=>void=()=>{};let entered:()=>void=()=>{};let slow=false,calls=0;
 const server=createPdfWorkerServer(async()=>{calls++;if(slow){entered();await new Promise<void>(resolve=>{release=resolve;});}return [{bytes:png,width:10,height:10,mime:"image/png"}];},async()=>"SYNTHETIC OCR ONLY");
 await new Promise<void>(resolve=>server.listen(socket,resolve));
 const call=(path:string,bytes=syntheticPdf(),mime="application/pdf")=>new Promise<{status:number;body:string}>((resolve,reject)=>{
  const req=request({socketPath:socket,path,method:path==="/health"?"GET":"POST",headers:{"Content-Type":mime}},res=>{const parts:Buffer[]=[];res.on("data",p=>parts.push(p));res.on("end",()=>resolve({status:res.statusCode!,body:Buffer.concat(parts).toString()}));});req.on("error",reject);req.end(bytes);
 });
 try{
  assert.equal((await call("/health")).status,200);
  assert.equal((await call("/render?pages=11&pixels=100")).status,400);
  assert.equal((await call("/render?pages=1&pixels=100",Buffer.from("not pdf"))).status,400);assert.equal(calls,0);
  const render=renderViaPdfWorker(socket,decodePdfRenderResponse);
  assert.equal((await render(syntheticPdf(),{pages:1,pixels:100,signal:AbortSignal.timeout(3000)}))[0].width,10);
  assert.equal(JSON.parse((await call("/ocr?pages=1&pixels=100")).body).text,"SYNTHETIC OCR ONLY");
  slow=true;const started=new Promise<void>(resolve=>{entered=resolve;});
  const pending=call("/render?pages=1&pixels=100");await started;
  assert.equal((await call("/render?pages=1&pixels=100")).status,503);release();assert.equal((await pending).status,200);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 await assert.rejects(renderViaPdfWorker(socket,decodePdfRenderResponse)(syntheticPdf(),{pages:1,pixels:100,signal:AbortSignal.timeout(1000)}),/unavailable/);
});

test("production backend refuses rendering in its credential-bearing process without a socket",async()=>{
 const old={node:process.env.NODE_ENV,socket:process.env.PDF_WORKER_SOCKET,worker:process.env.PDF_WORKER_PROCESS};
 process.env.NODE_ENV="production";delete process.env.PDF_WORKER_SOCKET;delete process.env.PDF_WORKER_PROCESS;
 try{await assert.rejects(renderPodPdf(syntheticPdf(),{pages:10,pixels:24000000,signal:AbortSignal.timeout(1000)}),/isolated worker/);}
 finally{for(const [key,value] of Object.entries({NODE_ENV:old.node,PDF_WORKER_SOCKET:old.socket,PDF_WORKER_PROCESS:old.worker})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
