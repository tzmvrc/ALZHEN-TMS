import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {createServer} from "node:http";
import {podUploadBody} from "../src/middleware/pod-upload.middleware.js";
test("receipt raw parser returns clear 413 before upload handling for bodies over 5 MiB",async()=>{
 const app=express();let calls=0;app.post("/fixture",podUploadBody,(_req,res)=>{calls++;res.json({ok:true});});
 const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();if(!address||typeof address==="string")throw Error("port");
 try{
  const response=await fetch(`http://127.0.0.1:${address.port}/fixture`,{method:"POST",headers:{"Content-Type":"application/pdf"},body:Buffer.alloc(5242881)});
  assert.equal(response.status,413);assert.match((await response.json()).message,/5 MB/);assert.equal(calls,0);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
