import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {supabaseAdmin as db} from '../config/supabase.js';
import {createAdaptiveWorker} from '../utils/adaptive-worker.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const escape=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function securitySmtpConfiguration(){return {configured:Boolean(process.env.SMTP_HOST&&process.env.SMTP_USER&&(process.env.SMTP_PASSWORD||process.env.SMTP_APP_PASSWORD)&&(process.env.SMTP_FROM||process.env.SMTP_USER)),enabled:process.env.SECURITY_LOGIN_EMAIL_ENABLED!=='false'};}
export function loginSecurityTemplate(name:string,at:string,m:any){
 const time=new Date(at).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'long',timeStyle:'short'}),details=[['Date and time',time+' (Philippine Time)'],['Device',`${m.operating_system??'Unknown'} ${m.device_category??''}`],['Browser',m.browser_name??'Unknown'],['Approximate location',m.location||'Location unavailable'],['Session','New device session'],['IP address',m.ip||'Unavailable']];
 const text=`Hello ${name},\nWe noticed a successful sign-in from a device we haven't recognized before.\n${details.map(([k,v])=>k+': '+v).join('\n')}\nThese details are approximate and may differ when using mobile networks or VPNs.\nIf this was you, no action is required. Otherwise contact your IT Administrator immediately and secure your account.`;
 return {subject:'Security Alert \u2014 New Device Sign-In to Your ALZHEN Account',text,html:`<!doctype html><html><body style="margin:0;background:#edf2f7;font-family:Arial,sans-serif;color:#0b2341"><table role="presentation" width="100%" cellpadding="16"><tr><td align="center"><table role="presentation" width="100%" style="max-width:600px;background:white;border-radius:16px" cellpadding="24"><tr><td style="background:#0b2341;color:white"><img src="cid:alzhen-logo" width="60" alt="ALZHEN company logo"><h2>ALZHEN TRUCKING SERVICES</h2></td></tr><tr><td><h1 style="font-size:24px">New sign-in detected</h1><p>Hello ${escape(name)},</p><p>We noticed a successful sign-in to your ALZHEN TMS account from a device we haven't recognized before.</p><h3>Sign-in details</h3><table role="presentation" width="100%" cellpadding="9">${details.map(([k,v])=>`<tr><td style="background:#f1f5f9">${escape(k)}</td><td>${escape(v)}</td></tr>`).join('')}</table><p style="font-size:12px;color:#64748b">These details are approximate and may differ when using mobile networks or VPNs.</p><h3>Was this you?</h3><p>If you recognize this sign-in, no action is required. If you don't recognize this activity, please contact your IT Administrator immediately.</p></td></tr><tr><td style="background:#f1f5f9;font-size:12px">ALZHEN TRUCKING SERVICES<br>Account Security Notification</td></tr></table></td></tr></table></body></html>`};
}
export async function queueLoginSecurity(profile:string,session:string,email:string,metadata:any){
 if(!metadata.device_identifier)return;
 const r=await db.rpc('queue_login_security_v1',{p_profile:profile,p_device:hash(metadata.device_identifier),p_session:hash(session),p_recipient:email,p_metadata:{browser_name:metadata.browser_name,operating_system:metadata.operating_system,device_category:metadata.device_category,ip:metadata.ip??null,location:'Location unavailable'}});
 if(r.error)throw Error('Security notification could not be queued');worker?.wake();
}
export async function runLoginSecurityBatch(){
 if(!securitySmtpConfiguration().configured||!securitySmtpConfiguration().enabled)return 0;
 const claim=await db.rpc('claim_login_security_v1');if(claim.error)throw Error('Security queue unavailable');
 for(const job of claim.data??[]){let transport:any,started=false;try{
  const account=await db.auth.admin.getUserById(job.profile_id);if(account.error||!account.data.user?.email)throw Error('Registered account email unavailable');job.recipient=account.data.user.email;
  const recipientSaved=await db.from('login_security_notifications').update({recipient:job.recipient}).eq('id',job.id);if(recipientSaved.error)throw Error('Recipient confirmation unavailable');
  if(/\.(example|invalid|test)$/i.test(job.recipient)) {await db.from('login_security_notifications').update({state:'FAILED',error_code:'TEST_ADDRESS',lease_until:null}).eq('id',job.id);continue;}
  const profile=await db.from('profiles').select('first_name').eq('id',job.profile_id).single();
  let metadata=job.metadata;
  // An optional, explicitly configured trusted HTTPS provider. Never accept a URL from the client.
  const provider=process.env.LOGIN_GEOLOCATION_URL;
  if(provider&&metadata.ip){try{const u=new URL(provider);if(u.protocol==='https:'){u.searchParams.set('ip',metadata.ip);const r=await fetch(u,{signal:AbortSignal.timeout(3000),headers:process.env.LOGIN_GEOLOCATION_TOKEN?{Authorization:`Bearer ${process.env.LOGIN_GEOLOCATION_TOKEN}`}:{}});const g=await r.json() as any;if(r.ok&&typeof g.city==='string'&&typeof g.country==='string')metadata={...metadata,location:`${g.city.slice(0,100)}, ${g.country.slice(0,100)}`};}}catch{/* Location remains unavailable. */}}
  const content=loginSecurityTemplate(profile.data?.first_name||'there',job.login_at,metadata),logo=await readFile(existsSync(resolve(__dirname,'../assets/logo.png'))?resolve(__dirname,'../assets/logo.png'):resolve(__dirname,'../../assets/logo.png'));
  const {default:nodemailer}=await import('nodemailer');transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||465),secure:process.env.SMTP_SECURE!=='false',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD||process.env.SMTP_APP_PASSWORD},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true});
  await transport.verify();started=true;
  const result=await transport.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to:job.recipient,...content,date:new Date(job.login_at),messageId:`<security.${job.id}@alzhen.local>`,attachments:[{filename:'logo.png',content:logo,cid:'alzhen-logo'}]});
  if(!result.accepted?.some((v:any)=>String(v.address||v).toLowerCase()===job.recipient.toLowerCase()))throw Error('SMTP unconfirmed');
  const saved=await db.from('login_security_notifications').update({state:'SENT',sent_at:new Date().toISOString(),lease_until:null,metadata,error_code:null}).eq('id',job.id);if(saved.error)throw Error('Confirmation unavailable');
  await db.from('device_sessions').update({approximate_location:metadata.location||'Location unavailable'}).eq('profile_id',job.profile_id).eq('session_hash',job.session_hash);
 }catch{await db.from('login_security_notifications').update({state:started?'NEEDS_REVIEW':job.attempts>=5?'FAILED':'RETRY',error_code:started?'SMTP_UNCONFIRMED':'SMTP_UNAVAILABLE',lease_until:null,next_attempt_at:new Date(Date.now()+60000*2**job.attempts).toISOString()}).eq('id',job.id);console.warn(JSON.stringify({event:'login_security_email_deferred',id:job.id,uncertain:started}));}finally{transport?.close();}}
 return claim.data?.length??0;
}
let worker:ReturnType<typeof createAdaptiveWorker>|undefined;
export function startLoginSecurityWorker(){if(worker)return()=>{};worker=createAdaptiveWorker({name:'login_security',run:runLoginSecurityBatch});return()=>{worker?.stop();worker=undefined;};}
