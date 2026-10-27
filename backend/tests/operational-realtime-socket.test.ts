import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {io,type Socket} from 'socket.io-client';

test('private database signals notify only the affected device owner and authorized trip subscribers',async()=>{
 process.env.SUPABASE_URL='http://127.0.0.1:54321';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated';process.env.SUPABASE_ANON_KEY='isolated';
 const {supabaseAdmin}=await import('../src/config/supabase.js');
 const {attachCollaborationServer}=await import('../src/services/collaboration-server.js');
 const callbacks=new Map<string,(payload:any)=>void>();let status:(value:string)=>void=()=>{};
 const original={channel:supabaseAdmin.channel,removeChannel:supabaseAdmin.removeChannel,from:supabaseAdmin.from};
 const channel={on(_kind:string,filter:any,callback:any){callbacks.set(filter.table,callback);return this;},subscribe(callback:any){status=callback;return this;}};
 supabaseAdmin.channel=(()=>channel) as any;supabaseAdmin.removeChannel=(async()=>{}) as any;
 supabaseAdmin.from=(()=>({select:()=>({limit:()=>({retry:async()=>({data:[],error:null})})})})) as any;
 const trip='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
 const http=createServer(),clients:Socket[]=[];
 const service=await attachCollaborationServer(http,{authenticate:async token=>({id:String(token),role:token==='admin'?'ADMIN':'TRUCKER',name:'Fixture',expiresAt:Date.now()+60000}),canTrip:async(actor,id)=>actor.id==='driver'&&id===trip});
 await new Promise<void>(resolve=>http.listen(0,'127.0.0.1',resolve));
 const wait=(s:Socket,name:string)=>new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Missing '+name)),2000);s.once(name,value=>{clearTimeout(timer);resolve(value);});});
 try{
  for(const name of ['admin','driver','other']){const s=io(`http://127.0.0.1:${(http.address() as any).port}`,{transports:['websocket'],autoConnect:false,reconnection:false,auth:{token:name,appSession:'fixture'}});clients.push(s);const ready=wait(s,'connect');s.connect();await ready;}
  const [admin,driver,unrelated]=clients;assert.equal((await driver.emitWithAck('room:join',{kind:'trip',key:trip})).ok,true);
  const bridge=wait(driver,'bridge:status');status('SUBSCRIBED');assert.equal((await bridge).healthy,true);
  let leaked=0;admin.on('security:changed',()=>leaked++);unrelated.on('security:changed',()=>leaked++);
  const security=wait(driver,'security:changed');callbacks.get('device_security_signals')!({new:{profile_id:'driver',revision:'revoke-one',secret:'must-not-be-forwarded'}});assert.deepEqual(await security,{revision:'revoke-one'});
  let notices=0;driver.on('trucker:changed',()=>notices++);
  const managed=wait(admin,'table:invalidated'),assigned=wait(driver,'trucker:changed');
  const payload={new:{trip_id:trip,source:'backloads',record_id:other,revision:'report-one',reason:'private contents'}};
  callbacks.get('trip_operational_signals')!(payload);callbacks.get('trip_operational_signals')!(payload);
  assert.deepEqual(await assigned,{kind:'trip'});const commit=await managed;assert.equal(commit.source,'backloads');assert.equal(commit.tripId,trip);assert.ok(!('reason' in commit));
  callbacks.get('trip_operational_signals')!({new:{...payload.new,trip_id:other,revision:'unrelated-trip'}});
  await new Promise(resolve=>setTimeout(resolve,50));assert.equal(notices,1);assert.equal(leaked,0);
 }finally{clients.forEach(s=>s.disconnect());await service.close();Object.assign(supabaseAdmin,original);}
});
