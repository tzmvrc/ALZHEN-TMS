// Avoid a second watcher competing with an already healthy local ALZHEN API.
const {get}=require("node:http");
const {spawn}=require("node:child_process");
const {resolve}=require("node:path");
require("dotenv").config({path:resolve(__dirname,"../.env"),quiet:true});
const port=Number(process.env.PORT??5000);
if(!Number.isInteger(port)||port<1||port>65535){console.error("PORT must be an integer from 1 to 65535.");process.exit(1);}
function start(){
 const child=spawn(process.execPath,[require.resolve("tsx/cli"),"watch","src/server.ts"],{cwd:resolve(__dirname,".."),env:process.env,stdio:"inherit",windowsHide:true});
 child.once("error",()=>{console.error("Unable to start the backend watcher.");process.exitCode=1;});
 child.once("exit",code=>{process.exitCode=code??1;});
 for(const signal of ["SIGINT","SIGTERM"])process.once(signal,()=>{child.kill(signal);});
}
let settled=false;
const request=get({hostname:"localhost",port,path:"/api/health",timeout:1500},response=>{
 let body="";response.on("data",chunk=>{body+=chunk;if(body.length>4096)request.destroy();});
 response.on("end",()=>{if(settled)return;settled=true;let health;try{health=JSON.parse(body);}catch{}
  if(response.statusCode===200&&health?.status==="ok"&&health?.service==="alzhen-tms-backend")console.log(`ALZHEN backend is already running at http://localhost:${port}; reusing it without starting a duplicate watcher.`);
  else {console.error(`Port ${port} belongs to another service. Stop that service deliberately or configure PORT and the frontend API URL together.`);process.exitCode=1;}
 });
});
request.once("timeout",()=>request.destroy());
request.once("error",error=>{if(settled)return;settled=true;if(error.code==="ECONNREFUSED")start();else{console.error(`Unable to verify port ${port}. Check the existing listener before restarting.`);process.exitCode=1;}});
