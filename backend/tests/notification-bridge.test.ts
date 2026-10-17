import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {io,type Socket} from "socket.io-client";
process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";process.env.SUPABASE_ANON_KEY="isolated-test";
test("notification bridge signals only authenticated recipient rooms and deduplicates metadata without leaking contents",async()=>{
 const {supabaseAdmin}=await import("../src/config/supabase.js");const {attachCollaborationServer}=await import("../src/services/collaboration-server.js");
 const original=supabaseAdmin.channel,originalFrom=supabaseAdmin.from,remove=supabaseAdmin.removeChannel;
 const handlers=new Map<string,(value:unknown)=>void>();
 const channel={on:(_kind:string,filter:{table:string},fn:(value:unknown)=>void)=>{handlers.set(filter.table,fn);return channel;},subscribe:(fn:(status:string)=>void)=>{fn("SUBSCRIBED");return channel;},unsubscribe:async()=>{}};
 supabaseAdmin.channel=(()=>channel) as typeof original;supabaseAdmin.removeChannel=(async()=>"ok") as typeof remove;
 supabaseAdmin.from=(()=>({select:()=>({limit:async()=>({data:[],error:null})})})) as typeof originalFrom;
 const http=createServer();let service:Awaited<ReturnType<typeof attachCollaborationServer>>|undefined;const clients:Socket[]=[];
 try{
  service=await attachCollaborationServer(http,{authenticate:async(token)=>({id:String(token),role:token==="recipient"?"TRUCKER":"STAFF",name:"Fixture",expiresAt:Date.now()+60000}),canTrip:async()=>false});
  await new Promise<void>(resolve=>http.listen(0,"127.0.0.1",resolve));const port=(http.address() as {port:number}).port;
  let unrelated=0,received=0;const payloads:unknown[]=[];
  for(const id of ["recipient","other"]){const socket=io(`http://127.0.0.1:${port}`,{transports:["websocket"],auth:{token:id},reconnection:false,autoConnect:false});clients.push(socket);socket.on("notification:changed",payload=>{if(id==="recipient"){received++;payloads.push(payload);}else unrelated++;});await new Promise<void>((resolve,reject)=>{socket.once("connect",resolve);socket.once("connect_error",reject);socket.connect();});}
  const notice={id:"fixture-notice",recipient_profile_id:"recipient",created_at:"fixture-time",message:"PRIVATE POD",metadata:{storage_path:"PRIVATE"}};
  handlers.get("admin_notifications")!({new:notice});handlers.get("admin_notifications")!({new:notice});
  await new Promise(resolve=>setTimeout(resolve,100));assert.equal(received,1);assert.equal(unrelated,0);assert.deepEqual(payloads,[{id:"fixture-notice",revision:"fixture-time"}]);
  clients[0].disconnect();handlers.get("admin_notifications")!({new:{...notice,id:"second"}});await new Promise(resolve=>setTimeout(resolve,50));assert.equal(unrelated,0);
 }finally{clients.forEach(socket=>socket.disconnect());if(service)await service.close();supabaseAdmin.channel=original;supabaseAdmin.from=originalFrom;supabaseAdmin.removeChannel=remove;}
});
