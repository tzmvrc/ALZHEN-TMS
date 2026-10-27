// Loopback-only transport fixture. All database credentials are replaced before imports.
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
process.env.SUPABASE_URL='http://127.0.0.1:54321';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test';process.env.SUPABASE_ANON_KEY='isolated-test';
async function main(){
 const {attachCollaborationServer}=await import('../../src/services/collaboration-server.js');
 const {collaborationEvents}=await import('../../src/services/collaboration-events.js');
 const server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');const url=new URL(req.url??'/','http://127.0.0.1:5210');if(req.method==='POST'&&url.pathname==='/signal'){collaborationEvents.emit('commit',{source:url.searchParams.get('source')??'trip_events',tripId:url.searchParams.get('trip'),recordId:randomUUID(),eventId:randomUUID(),version:null,actorId:null,operation:'UPDATE',fields:[]});}res.end('{"ok":true}');});
 const service=await attachCollaborationServer(server,{bridge:false,authenticate:async()=>({id:'fixture-admin',role:'ADMIN',name:'Fixture Admin',expiresAt:Date.now()+3600000}),canTrip:async()=>true,authorizeCell:async()=>{}});
 server.listen(5210,'127.0.0.1',()=>console.log('Operational grid fixture ready:5210'));process.once('SIGTERM',()=>void service.close());
}
void main();
