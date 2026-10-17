import test from "node:test";
import assert from "node:assert/strict";
import {renderPodPdf,decodePdfRenderResponse} from "../src/services/pdf-renderer.service.js";
import {preparePodIntake} from "../src/services/pod-intake.service.js";
// Tiny valid PDF generated entirely from synthetic objects, never client documents.
import {syntheticPdf} from "./fixtures/synthetic-pdf.js";
test("real isolated PDF renderer validates and rasterizes synthetic multipage documents with strict budgets",async()=>{
 const bytes=syntheticPdf(),result=await preparePodIntake(bytes,"application/pdf","synthetic.pdf",{pdfEnabled:true,bucketPrivate:true,allowedMimeTypes:["application/pdf"],maxBytes:5242880},renderPodPdf);
 assert.equal(result.original,bytes);assert.equal(result.ocrPages.length,2);assert.equal(result.ocrPages[0].subarray(0,8).toString("hex"),"89504e470d0a1a0a");
 await assert.rejects(renderPodPdf(syntheticPdf(11),{pages:10,pixels:24000000,signal:AbortSignal.timeout(15000)}));
 await assert.rejects(renderPodPdf(Buffer.from("%PDF-1.7\nnot valid objects\n%%EOF"),{pages:10,pixels:24000000,signal:AbortSignal.timeout(15000)}));
 const controller=new AbortController();controller.abort();await assert.rejects(renderPodPdf(bytes,{pages:10,pixels:24000000,signal:controller.signal}),/cancelled/);
});

test("renderer enforces caller page and pixel budgets and rejects bad inputs before spawning",async()=>{
 const limits={pages:10,pixels:24000000,signal:AbortSignal.timeout(15000)};
 await assert.rejects(renderPodPdf(Buffer.alloc(0),limits),/input size/);
 await assert.rejects(renderPodPdf(Buffer.alloc(5242881),limits),/input size/);
 await assert.rejects(renderPodPdf(syntheticPdf(),{...limits,pages:11}),/limits/);
 await assert.rejects(renderPodPdf(syntheticPdf(),{...limits,pixels:0}),/limits/);
 await assert.rejects(renderPodPdf(syntheticPdf(2),{...limits,pages:1}),/render failed/);
 await assert.rejects(renderPodPdf(syntheticPdf(1),{...limits,pixels:1}),/render failed/);
});

test("child protocol rejects malformed raster responses, dimensions, MIME and pixel overflow",()=>{
 const limits={pages:2,pixels:100,signal:new AbortController().signal};
 const png=Buffer.alloc(24);Buffer.from("89504e470d0a1a0a","hex").copy(png);png.write("IHDR",12);png.writeUInt32BE(10,16);png.writeUInt32BE(10,20);
 const page={bytes:png.toString("base64"),width:10,height:10,mime:"image/png"};
 const decode=(value:unknown)=>decodePdfRenderResponse(Buffer.from(JSON.stringify(value)),limits);
 assert.equal(decode([page])[0].bytes.length,24);
 for(const value of [null,{},[],[page,page,page],[page,page],[{...page,width:9}],[{...page,height:NaN}],[{...page,mime:"text/html"}],[{...page,bytes:"!!!!"}],[{...page,bytes:Buffer.from("not png").toString("base64")}]])assert.throws(()=>decode(value));
 assert.throws(()=>decodePdfRenderResponse(Buffer.from("not json"),limits));
});

test("cancelling an in-flight child terminates it and releases the renderer slot",async()=>{
 const controller=new AbortController();
 const pending=renderPodPdf(syntheticPdf(2),{pages:10,pixels:24000000,signal:controller.signal});
 controller.abort();await assert.rejects(pending,/render failed/);
 const pages=await renderPodPdf(syntheticPdf(1),{pages:10,pixels:24000000,signal:AbortSignal.timeout(15000)});
 assert.equal(pages.length,1);
});
