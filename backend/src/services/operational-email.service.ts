import {gmailSmtpConfiguration,sendGmailSmtp,classifyGmailSmtpFailure} from './gmail-smtp.service.js';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {supabaseAdmin as db} from '../config/supabase.js';
import {ApiError} from '../utils/api-response.js';
import {isValidUuid} from '../utils/validation.js';
import {createAdaptiveWorker} from '../utils/adaptive-worker.js';
import {loadOperationalEmailContext} from './operational-email-context.js';
import {operationalEmailTemplate,type OperationalEmailContext} from './operational-email-template.js';
import {operationalReportPdf} from './operational-email-pdf.js';
type Actor={id:string;role:string};
type Job={id:string;report_type:string;report_id:string;trip_id:string|null;recipient_id:string|null;recipient_email:string;idempotency_key:string;attempts:number;lease_token:string;first_send_at:string|null;ambiguous:boolean;content:any;attachment_manifest:Manifest[]};
type Manifest={path:string;sha256:string;filename:string;content_type:string;content_id?:string};
const bucket='operational-email-attachments',emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalize=(v:unknown)=>typeof v==='string'?v.trim().toLowerCase():'';
const admin=(actor:Actor)=>{if(actor.role!=='ADMIN'||!isValidUuid(actor.id))throw new ApiError('Admin access is required.',403);};
type EmailProvider='resend'|'gmail';
export function operationalEmailConfiguration(){
 const selected=(process.env.EMAIL_PROVIDER??'resend').trim().toLowerCase();
 if(selected==='gmail')return {provider:'gmail' as const,...gmailSmtpConfiguration(),enabled:true,testing_domain:false};
 if(selected!=='resend')return {provider:'unsupported' as const,configured:false,enabled:false,sender:'',testing_domain:false,configuration_error:'Set EMAIL_PROVIDER to gmail or resend in the backend environment.'};
 const from=process.env.RESEND_FROM_EMAIL??'',enabled=process.env.RESEND_EMAIL_ENABLED==='true';
 return {provider:'resend' as const,configured:Boolean(process.env.RESEND_API_KEY&&from),enabled,sender:from,testing_domain:/@resend\.dev\s*>?$/i.test(from.trim()),configuration_error:!process.env.RESEND_API_KEY||!from?'Set the backend RESEND_API_KEY and RESEND_FROM_EMAIL.':null};
}
function jobProvider(job:Pick<Job,'content'|'first_send_at'>):EmailProvider|null{
 const provider=job.content?.provider;
 if(provider==='gmail'||provider==='resend')return provider;
 return provider?null:job.first_send_at?'resend':null;
}
const retryAt=(attempts:number,minimum=0)=>new Date(Date.now()+Math.max(minimum,Math.min(21600000,30000*2**Math.min(attempts,10)))).toISOString();
const currentKeyHash=()=>createHash('sha256').update(process.env.RESEND_API_KEY??'').digest('hex');
export function verifiedTestingAccount(config:{testing_account_email?:string|null;testing_account_key_hash?:string|null}){return config.testing_account_key_hash===currentKeyHash()?normalize(config.testing_account_email):'';}
export function testingRecipientAllowed(email:string,config:{testing_recipient_email?:string|null;testing_account_email?:string|null;testing_account_key_hash?:string|null},testing:boolean){return !testing||/^delivered(?:\+[a-z0-9_-]+)?@resend\.dev$/i.test(email)||normalize(verifiedTestingAccount(config)||config.testing_recipient_email)===normalize(email);}
export function providerRejection(status:number,data:{message?:unknown;name?:unknown}){
 const raw=typeof data.message==='string'?data.message.slice(0,1600):`Resend rejected this request (HTTP ${status}).`;const message=process.env.RESEND_API_KEY?raw.replaceAll(process.env.RESEND_API_KEY,'[redacted]'):raw;
 const match=status===403?/You can only send testing emails to your own email address \(([^\s()]+@[^\s()]+)\)/i.exec(message):null;
 return {message,name:typeof data.name==='string'?data.name.slice(0,120):null,account:match&&emailPattern.test(match[1])?normalize(match[1]):null};
}
export async function recordProviderRejection(jobId:string,status:number,data:{message?:unknown;name?:unknown}){
 const rejection=providerRejection(status,data);
 if(rejection.account){const r=await db.from('operational_email_settings').update({testing_account_email:rejection.account,testing_account_key_hash:currentKeyHash()}).eq('id',true);if(r.error)throw Error('Provider eligibility could not be retained.');}
 const r=await db.from('operational_email_outbox').update({last_error:rejection.message,provider_error_name:rejection.name,error_code:rejection.account?'TESTING_RECIPIENT_RESTRICTED':`RESEND_${status}`}).eq('id',jobId).eq('state','BLOCKED');if(r.error)throw Error('Provider rejection could not be retained.');
 return rejection;
}
async function settings(){const r=await db.from('operational_email_settings').select('*').eq('id',true).single();if(r.error)throw new ApiError('Operational email settings are unavailable.',503);return r.data;}
export async function readOperationalEmailSettings(actor:Actor){admin(actor);const [config,r,h]=await Promise.all([settings(),db.from('operational_email_recipients').select('*').order('email'),db.from('operational_email_outbox').select('id,report_type,report_id,trip_id,recipient_email,state,attempts,last_error,error_code,provider_message_id,provider_status,created_at,sent_at,next_attempt_at,ambiguous,first_send_at,provider_error_name,provider_checked_at,delivery_observed_at,provider:content->>provider').order('created_at',{ascending:false}).limit(50)]);if(r.error||h.error)throw new ApiError('Email delivery history could not load.',503);const setup=operationalEmailConfiguration();return {settings:{...config,testing_account_key_hash:undefined,testing_account_email:verifiedTestingAccount(config)||null},configuration:setup,recipients:(r.data??[]).map(recipient=>({...recipient,eligible:testingRecipientAllowed(recipient.email,config,setup.testing_domain)})),history:(h.data??[]).map(job=>({...job,provider:job.provider??'resend'}))};}
export async function saveOperationalEmailSettings(actor:Actor,input:any){admin(actor);if(!input||typeof input.enabled!=='boolean'||!Number.isSafeInteger(input.version)||!Array.isArray(input.recipients)||input.recipients.length>50)throw new ApiError('Check the email settings.',400);const testing=normalize(input.testing_recipient_email);if(testing&&(!emailPattern.test(testing)||testing.length>254))throw new ApiError('Enter the Resend account email or leave it blank.',400);const recipients=input.recipients.map((r:any)=>{const email=normalize(r?.email);if(!emailPattern.test(email)||email.length>254||typeof r.enabled!=='boolean'||!Array.isArray(r.report_types)||!r.report_types.length||r.report_types.some((t:unknown)=>!['BACKLOAD','OFFLOAD','DEMURRAGE'].includes(String(t))))throw new ApiError('Enter valid recipients and report types.',400);return {email,enabled:r.enabled,report_types:[...new Set(r.report_types)]};});if(new Set(recipients.map((r:any)=>r.email)).size!==recipients.length)throw new ApiError('Each recipient email may appear only once.',400);const r=await db.rpc('save_operational_email_settings_v1',{p_actor:actor.id,p_version:input.version,p_enabled:input.enabled,p_testing_email:testing||null,p_recipients:recipients});if(r.error)throw new ApiError(r.error.code==='40001'?'Email settings changed. Reload before saving.':'Email settings were not saved.',r.error.code==='40001'?409:422);worker?.wake();return readOperationalEmailSettings(actor);}
export async function queueOperationalTestEmail(actor:Actor,email:unknown,key:unknown){admin(actor);const recipient=normalize(email);if(typeof key!=='string'||!isValidUuid(key)||!emailPattern.test(recipient)||recipient.length>254)throw new ApiError('Enter a valid test recipient.',400);const config=await settings(),setup=operationalEmailConfiguration();if(!setup.configured||!setup.enabled)throw new ApiError('Backend email sending is disabled or not configured.',409);if(!testingRecipientAllowed(recipient,config,setup.testing_domain))throw new ApiError(`The testing sender can send only to ${verifiedTestingAccount(config)||'the actual Resend account email'} or delivered@resend.dev. Verify a custom sender domain to send to other recipients.`,422);const context:OperationalEmailContext={type:'TEST',date:new Date().toLocaleString('en-PH',{timeZone:'Asia/Manila'}),dispatch:'Configuration test',tripReference:'',driver:'',plate:'',company:'ALZHEN Trucking Services',warehouse:'',destination:'',dr:'',reason:'Requested by an authorized administrator. No operational report or milestone was created.',remarks:'',boxes:'',waiting:'',cargo:[]};const content={...operationalEmailTemplate(context),context,provider:setup.provider,from:setup.sender,to:[recipient]};const r=await db.from('operational_email_outbox').upsert({report_type:'TEST',report_id:key,recipient_email:recipient,idempotency_key:`operational/test/${key}/${createHash('sha256').update(recipient).digest('hex').slice(0,32)}`,content},{onConflict:'report_type,report_id,recipient_email',ignoreDuplicates:true}).select('id');if(r.error)throw new ApiError('Test email could not be queued.',503);worker?.wake();return {queued:true,id:r.data?.[0]?.id??null};}
export async function retryOperationalEmail(actor:Actor,id:unknown){
 admin(actor);if(typeof id!=='string'||!isValidUuid(id))throw new ApiError('Invalid email job.',400);
 const r=await db.from('operational_email_outbox').select('id,state,first_send_at,ambiguous,recipient_email,error_code,content,next_attempt_at').eq('id',id).single();if(r.error)throw new ApiError('Email job not found.',404);
 const job=r.data,config=await settings(),setup=operationalEmailConfiguration(),bound=jobProvider(job);
 if(!['FAILED','RETRY','BLOCKED','NEEDS_REVIEW'].includes(job.state))throw new ApiError('This email is already sent or processing.',409);
 if(!setup.configured||!setup.enabled)throw new ApiError(setup.configuration_error||'Backend email sending is disabled.',409);
 if(setup.provider==='gmail'&&bound==='gmail'&&['SMTP_TEMPORARY_LIMIT','SMTP_DAILY_LIMIT'].includes(job.error_code)&&Date.parse(job.next_attempt_at)>Date.now())throw new ApiError('Gmail sending-limit cooldown is still active. Wait for the scheduled retry instead of resending immediately.',429);
 if((bound==='gmail'&&job.ambiguous)||job.error_code==='SMTP_UNCERTAIN')throw new ApiError('SMTP acceptance is uncertain. Resending is held to prevent duplicates. Check Gmail Sent and recipient evidence; an uncertain SMTP job cannot be safely retried from this screen.',409);
 if(job.ambiguous&&bound!==setup.provider)throw new ApiError('Do not switch providers for an uncertain send. Return to its original provider and reconcile its delivery evidence first.',409);
 if(job.ambiguous&&job.first_send_at&&Date.now()-Date.parse(job.first_send_at)>23*3600000)throw new ApiError('Provider confirmation is uncertain and its deduplication window has expired. Check Resend delivery history before requesting any new message.',409);
 if(!testingRecipientAllowed(job.recipient_email,config,setup.testing_domain))throw new ApiError(`This recipient is restricted. Use ${verifiedTestingAccount(config)||'the actual Resend account email'} or delivered@resend.dev, or verify a custom sender domain.`,422);
 if(job.error_code==='RESEND_403'&&setup.testing_domain)throw new ApiError('Resolve the provider sender/permission rejection before retrying. See the original provider message in delivery history.',422);
 const patch:Record<string,unknown>={state:'RETRY',last_error:null,error_code:null,provider_error_name:null,next_attempt_at:new Date().toISOString(),lease_until:null};
 // A confirmed rejected/unattempted job can move providers only on this explicit Admin action.
 if(job.content&&!job.ambiguous&&(bound!==setup.provider||job.content.from!==setup.sender))patch.content={...job.content,provider:setup.provider,from:setup.sender,provider_changes:[...(Array.isArray(job.content.provider_changes)?job.content.provider_changes:[]),{from_provider:bound,to_provider:setup.provider,actor:actor.id,at:new Date().toISOString(),previous_error:job.error_code,previous_first_send_at:job.first_send_at}]};if(patch.content)patch.first_send_at=null;
 const result=await db.from('operational_email_outbox').update(patch).eq('id',id).eq('state',job.state);if(result.error)throw new ApiError('Email retry could not be saved.',503);worker?.wake();return {queued:true};
}
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
async function acknowledge(job:Job,patch:Record<string,unknown>){const r=await db.from('operational_email_outbox').update(patch).eq('id',job.id).eq('lease_token',job.lease_token).eq('state','PROCESSING').select('id').maybeSingle();if(r.error||!r.data)throw Error('Email lease acknowledgement failed.');Object.assign(job,patch);}
async function snapshot(job:Job,filename:string,bytes:Buffer,type:string,contentId?:string){const path=`${job.id}/${sha(bytes)}-${filename}`;const upload=await db.storage.from(bucket).upload(path,bytes,{contentType:type,upsert:false});if(upload.error){const previous=await db.storage.from(bucket).download(path);if(previous.error||!previous.data||sha(Buffer.from(await previous.data.arrayBuffer()))!==sha(bytes))throw Error('Email attachment snapshot failed.');}return {path,sha256:sha(bytes),filename,content_type:type,...(contentId?{content_id:contentId}:{})};}
export async function processOperationalEmail(job:Job,transport:typeof fetch=fetch){
 let providerStarted=false;let activeProvider:EmailProvider|null=jobProvider(job);
 try{
  const config=await settings(),setup=operationalEmailConfiguration();
  if(job.content?.provider&&!activeProvider){await acknowledge(job,{state:'BLOCKED',error_code:'PROVIDER_INVALID',last_error:'The saved email provider is invalid. An Admin must review this job before retrying.',lease_until:null});return;}
  if(activeProvider==='gmail'&&job.ambiguous){await acknowledge(job,{state:'NEEDS_REVIEW',error_code:'SMTP_UNCERTAIN',last_error:'A previous SMTP attempt has no durable acceptance confirmation. Check Gmail Sent and recipient evidence; resending is held to prevent duplicates.',lease_until:null});return;}
  if(activeProvider&&activeProvider!==setup.provider){await acknowledge(job,{state:'BLOCKED',error_code:'PROVIDER_CHANGED',last_error:'This job is bound to a different email provider. An Admin may explicitly retry a confirmed rejected/unattempted job with the selected provider; uncertain sends require reconciliation.',lease_until:null});return;}
  if(!setup.configured||!setup.enabled){await acknowledge(job,{state:'BLOCKED',error_code:'EMAIL_DISABLED',last_error:setup.configuration_error||'Backend email sending is disabled or not configured.',lease_until:null});return;}
  if(job.report_type!=='TEST'){
   const recipient=await db.from('operational_email_recipients').select('email,enabled,report_types').eq('id',job.recipient_id??randomUUID()).maybeSingle();if(recipient.error)throw Error('Recipient configuration unavailable.');
   if(!recipient.data?.enabled||recipient.data.email!==job.recipient_email||!recipient.data.report_types.includes(job.report_type)){await acknowledge(job,{state:'CANCELLED',last_error:'Recipient removed, disabled, or no longer subscribed.',lease_until:null});return;}
   if(!config.enabled){await acknowledge(job,{state:'RETRY',next_attempt_at:new Date(Date.now()+60000).toISOString(),lease_until:null});return;}
  }
  if(!testingRecipientAllowed(job.recipient_email,config,setup.testing_domain)){await acknowledge(job,{state:'BLOCKED',error_code:'TESTING_RECIPIENT_RESTRICTED',last_error:'Testing domain: verify an ALZHEN sender domain for external recipients, or configure the actual Resend account email.',lease_until:null});return;}
  if(activeProvider==='resend'&&job.ambiguous&&job.first_send_at&&Date.now()-Date.parse(job.first_send_at)>23*3600000){await acknowledge(job,{state:'NEEDS_REVIEW',error_code:'AMBIGUOUS_EXPIRED',last_error:'Provider outcome is uncertain beyond its idempotency window. Reconcile in Resend before any new send.',lease_until:null});return;}
  if(!job.content){const context=await loadOperationalEmailContext(job.report_type,job.report_id);await acknowledge(job,{content:{...operationalEmailTemplate(context),context,provider:setup.provider,from:setup.sender,to:[job.recipient_email]}});}
  if(!job.content.provider){if(job.first_send_at){await acknowledge(job,{content:{...job.content,provider:'resend'}});}else{await acknowledge(job,{content:{...job.content,provider:setup.provider,from:setup.sender}});}}
  activeProvider=jobProvider(job);
  if(activeProvider==='gmail'&&job.content.from!==setup.sender){await acknowledge(job,{state:'BLOCKED',error_code:'SMTP_SENDER_CHANGED',last_error:'The Gmail sending account/name changed after this job was prepared. An Admin must explicitly retry this unconfirmed job with the new sender.',lease_until:null});return;}
  if(!job.attachment_manifest?.length){
   const logo=await readFile(existsSync(resolve(__dirname,'../assets/logo.png'))?resolve(__dirname,'../assets/logo.png'):resolve(__dirname,'../../assets/logo.png'));
   const attachments=[await snapshot(job,'alzhen-logo.png',logo,'image/png','alzhen-logo')];
   const pdf=await operationalReportPdf(job.content.context,logo);
   if(pdf.length>8*1024*1024)throw Error('Generated report PDF exceeds the safe attachment limit.');
   attachments.push(await snapshot(job,'operational-report.pdf',pdf,'application/pdf'));
   let bytesUsed=logo.length+pdf.length;
   // Only saved photos of this report event are copied into the private snapshot.
   // Oversized evidence remains accessible through the existing authenticated link.
   if(job.trip_id&&job.content.context?.evidenceEventId){
    const images=await db.from('trip_images').select('id,storage_path,mime_type').eq('trip_id',job.trip_id).eq('delivery_event_id',job.content.context.evidenceEventId).eq('delivery_upload_state','READY').order('id').limit(6);
    if(images.error)throw Error('Saved report evidence is unavailable.');
    for(const [index,image] of (images.data??[]).entries()){
     if(!['image/jpeg','image/png','image/webp'].includes(image.mime_type))continue;
     const download=await db.storage.from('trip-images').download(image.storage_path);
     if(download.error||!download.data)throw Error('Saved report photo is unavailable.');
     if(bytesUsed+download.data.size>9*1024*1024)continue;
     const bytes=Buffer.from(await download.data.arrayBuffer());
     const extension=image.mime_type==='image/png'?'png':image.mime_type==='image/webp'?'webp':'jpg';
     attachments.push(await snapshot(job,`supporting-photo-${index+1}.${extension}`,bytes,image.mime_type));bytesUsed+=bytes.length;
    }
   }
   await acknowledge(job,{attachment_manifest:attachments});
  }
  const attachments=[];let total=0;
  for(const attachment of job.attachment_manifest){const file=await db.storage.from(bucket).download(attachment.path);if(file.error||!file.data)throw Error('Email attachment unavailable.');const bytes=Buffer.from(await file.data.arrayBuffer());if(sha(bytes)!==attachment.sha256)throw Error('Email attachment integrity check failed.');total+=bytes.length;if(total>10*1024*1024)throw Error('Email attachments exceed the safe limit.');attachments.push({filename:attachment.filename,content:bytes.toString('base64'),content_type:attachment.content_type,...(attachment.content_id?{content_id:attachment.content_id}:{})});}
  await acknowledge(job,{first_send_at:job.first_send_at??new Date().toISOString(),ambiguous:true,lease_until:new Date(Date.now()+180000).toISOString()});providerStarted=true;
  const {context:_context,provider:_provider,provider_changes:_changes,...content}=job.content;
  if(activeProvider==='gmail'){
   try{const result=await sendGmailSmtp({idempotencyKey:job.idempotency_key,recipient:job.recipient_email,content,attachments,firstSendAt:job.first_send_at!});await acknowledge(job,{state:'SENT',provider_message_id:result.messageId,provider_status:'SMTP_ACCEPTED',sent_at:new Date().toISOString(),last_error:null,error_code:null,provider_error_name:null,delivery_observed_at:null,ambiguous:false,lease_until:null});}
   catch(error){const failure=classifyGmailSmtpFailure(error);await acknowledge(job,{state:failure.state,error_code:failure.code,provider_error_name:failure.code,last_error:failure.message,ambiguous:failure.ambiguous,...(failure.state==='RETRY'?{next_attempt_at:retryAt(job.attempts,failure.retryDelayMs)}:{}),lease_until:null});}
   return;
  }
  const response=await transport('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':job.idempotency_key},body:JSON.stringify({...content,attachments}),signal:AbortSignal.timeout(20000)});
  const data=await response.json() as {id?:string;name?:string;message?:string};
  if(response.ok&&typeof data.id==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(data.id)){await acknowledge(job,{state:'SENT',provider_message_id:data.id,provider_status:'ACCEPTED',sent_at:new Date().toISOString(),last_error:null,error_code:null,ambiguous:false,lease_until:null});return;}
  if(response.ok)throw Error('Provider acceptance has no recoverable message ID.');
  const rejection=providerRejection(response.status,data);if(rejection.account){const verified=await db.from('operational_email_settings').update({testing_account_email:rejection.account,testing_account_key_hash:currentKeyHash()}).eq('id',true);if(verified.error)throw Error('Provider eligibility save failed.');}
  const retry=response.status===429||response.status>=500||response.status===409&&data.name==='concurrent_idempotent_requests';
  await acknowledge(job,{state:retry?'RETRY':response.status===403?'BLOCKED':'FAILED',error_code:rejection.account?'TESTING_RECIPIENT_RESTRICTED':`RESEND_${response.status}`,provider_error_name:rejection.name,last_error:rejection.message,ambiguous:response.status>=500,next_attempt_at:new Date(Date.now()+Math.min(21600000,30000*2**Math.min(job.attempts,10))).toISOString(),lease_until:null});
 }catch{
  if(activeProvider==='gmail'&&providerStarted){try{await acknowledge(job,{state:'NEEDS_REVIEW',last_error:'SMTP acceptance could not be durably confirmed. Resending is held; check Gmail Sent and recipient evidence.',error_code:'SMTP_UNCERTAIN',ambiguous:true,lease_until:null});}catch{/* The durable ambiguous flag survives an expired lease or failed acknowledgement. */}return;}
  // Never log provider requests, credentials, recipient data, or access tokens.
  try{await acknowledge(job,{state:job.attempts>=12&&!providerStarted?'FAILED':'RETRY',last_error:providerStarted?'Provider confirmation unavailable. Retry retains the same message and provider idempotency key.':'Saved report email preparation is unavailable. Retry is scheduled.',error_code:providerStarted?'PROVIDER_UNCERTAIN':'PREPARATION_FAILED',ambiguous:providerStarted||job.ambiguous,next_attempt_at:new Date(Date.now()+Math.min(21600000,30000*2**Math.min(job.attempts,10))).toISOString(),lease_until:null});}catch{/* Durable lease expires after restart or acknowledgement failure. */}
  console.warn(JSON.stringify({event:'operational_email_deferred',job_id:job.id,attempt:job.attempts}));
 }
}
export async function runOperationalEmailBatch(){const setup=operationalEmailConfiguration();if(!setup.enabled||!setup.configured)return 0;const r=await db.rpc('claim_operational_email_v1');if(r.error||!Array.isArray(r.data))throw Error('Operational email queue unavailable.');for(const job of r.data)await processOperationalEmail(job as Job);if(setup.provider==='resend')await reconcileOperationalEmailDelivery();return r.data.length;}
let worker:ReturnType<typeof createAdaptiveWorker>|undefined;
export function startOperationalEmailWorker(){if(worker||!operationalEmailConfiguration().enabled||!operationalEmailConfiguration().configured)return()=>{};const current=createAdaptiveWorker({name:'operational_email',run:runOperationalEmailBatch});worker=current;return()=>{current.stop();if(worker===current)worker=undefined;};}

export function wakeOperationalEmailWorker(){worker?.wake();}

/** Read provider evidence only. Accepted messages are never resubmitted to learn delivery status. */
export async function reconcileOperationalEmailDelivery(transport:typeof fetch=fetch){
 if(!process.env.RESEND_API_KEY)return;
 const cutoff=new Date(Date.now()-60000).toISOString();
 const r=await db.from('operational_email_outbox').select('id,provider_message_id,provider_status,delivery_observed_at,provider:content->>provider').eq('state','SENT').in('provider_status',['ACCEPTED','sent','queued','delivery_delayed','scheduled']).gt('sent_at',new Date(Date.now()-7*86400000).toISOString()).or(`provider_checked_at.is.null,provider_checked_at.lt.${cutoff}`).order('provider_checked_at',{ascending:true,nullsFirst:true}).limit(2);
 if(r.error)throw Error('Provider status reconciliation unavailable.');
 for(const job of r.data??[]){
  if(!job.provider_message_id||job.provider==='gmail')continue;
  // Reserve a short reconciliation slot to avoid concurrent workers duplicating provider reads.
  const claim=await db.from('operational_email_outbox').update({provider_checked_at:new Date().toISOString()}).eq('id',job.id).or(`provider_checked_at.is.null,provider_checked_at.lt.${cutoff}`).select('id').maybeSingle();if(claim.error||!claim.data)continue;
  try{const response=await transport(`https://api.resend.com/emails/${encodeURIComponent(job.provider_message_id)}`,{headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`},signal:AbortSignal.timeout(10000)});if(!response.ok)continue;const data=await response.json() as {last_event?:string};const status=data.last_event;if(!status||!['sent','delivered','delivery_delayed','bounced','complained','opened','clicked','scheduled','queued','failed','suppressed','canceled'].includes(status))continue;
   const delivered=['delivered','opened','clicked'].includes(status);await db.from('operational_email_outbox').update({provider_status:status,...(delivered&&!job.delivery_observed_at?{delivery_observed_at:new Date().toISOString()}:{} )}).eq('id',job.id).eq('state','SENT');
  }catch{/* Keep accepted state. A provider-read outage must never resend the email. */}
  await new Promise(resolve=>setTimeout(resolve,550));
 }
}
