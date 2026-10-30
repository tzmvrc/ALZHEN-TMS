import {createHash} from 'node:crypto';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';

const emailPattern=/^[^\s<>"(),;:@]+@[^\s<>"(),;:@]+\.[^\s<>"(),;:@]+$/;
function smtpSettings(){
 const user=(process.env.SMTP_USER??'').trim();
 const name=(process.env.SMTP_FROM_NAME??'ALZHEN TMS').trim();
 const password=(process.env.SMTP_APP_PASSWORD??'').replace(/\s/g,'');
 const host=(process.env.SMTP_HOST??'smtp.gmail.com').trim().toLowerCase();
 const port=Number(process.env.SMTP_PORT??465);
 const secure=(process.env.SMTP_SECURE??'true').trim().toLowerCase()==='true';
 const validTransport=host==='smtp.gmail.com'&&port===465&&secure;
 const validIdentity=emailPattern.test(user)&&!/[\r\n]/.test(name);
 return {user,name,password,host,port,secure,validTransport,validIdentity};
}

/** Safe Admin-facing metadata only. Credentials never leave this module. */
export function gmailSmtpConfiguration(){
 const config=smtpSettings();
 const sender=config.validIdentity?`"${config.name.replace(/\\/g,'\\\\').replace(/"/g,'\\"')}" <${config.user}>`:'';
 return {configured:config.validTransport&&config.validIdentity&&Boolean(config.password),sender,
  configuration_error:!config.validTransport?'Gmail requires SMTP_HOST=smtp.gmail.com, SMTP_PORT=465 and SMTP_SECURE=true.':!config.validIdentity?'Set a valid SMTP_USER address and a single-line SMTP_FROM_NAME.':!config.password?'Set SMTP_APP_PASSWORD to a Google App Password in the backend environment.':null};
}

export type SmtpAttachment={filename:string;content:string;content_type:string;content_id?:string};
type Message={idempotencyKey:string;recipient:string;content:{from:string;subject:string;html:string;text:string};attachments:SmtpAttachment[];firstSendAt:string};

/** The caller owns the durable lease and writes ambiguous=true before entering here. */
export async function sendGmailSmtp(message:Message){
 const config=smtpSettings(),publicConfig=gmailSmtpConfiguration();
 if(!publicConfig.configured||message.content.from!==publicConfig.sender){throw Object.assign(new Error('SMTP configuration needs attention.'),{code:'SMTP_CONFIGURATION'});}
 // Lazy import keeps the existing Resend-only startup independent of SMTP setup.
 const {default:nodemailer}=await import('nodemailer');
 const options:SMTPTransport.Options={host:config.host,port:config.port,secure:true,
  auth:{user:config.user,pass:config.password},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true,servername:'smtp.gmail.com'},
  connectionTimeout:15000,greetingTimeout:10000,dnsTimeout:10000,socketTimeout:20000,
  logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true};
 const transport=nodemailer.createTransport(options);
 const domain=config.user.slice(config.user.lastIndexOf('@')+1).toLowerCase();
 // Stable identity aids investigation/threading; SMTP does NOT guarantee deduplication.
 const messageId=`<alzhen.${createHash('sha256').update(message.idempotencyKey).digest('hex')}@${domain}>`;
 let deadline:ReturnType<typeof setTimeout>|undefined;
 try{
  const timeout=new Promise<never>((_resolve,reject)=>{deadline=setTimeout(()=>{reject(Object.assign(new Error('SMTP confirmation timed out.'),{code:'SMTP_UNCERTAIN'}));try{transport.close();}catch{/* The durable uncertain flag prevents resending. */}},60000);deadline.unref();});
  const result=await Promise.race([transport.sendMail({
   from:{name:config.name,address:config.user},to:[{address:message.recipient,name:''}],
   envelope:{from:config.user,to:[message.recipient]},subject:message.content.subject,
   html:message.content.html,text:message.content.text,messageId,date:new Date(message.firstSendAt),
   disableFileAccess:true,disableUrlAccess:true,
   attachments:message.attachments.map(a=>({filename:a.filename,content:Buffer.from(a.content,'base64'),contentType:a.content_type,...(a.content_id?{cid:a.content_id,contentDisposition:'inline' as const}:{contentDisposition:'attachment' as const})})),
  }),timeout]);
  const accepted=result.accepted.some((recipient:unknown)=>{
   const address=typeof recipient==='string'?recipient:recipient&&typeof recipient==='object'&&'address' in recipient?String(recipient.address):'';
   return address.toLowerCase()===message.recipient.toLowerCase();
  });
  if(!accepted)throw Object.assign(new Error('SMTP acceptance is uncertain.'),{code:'SMTP_UNCERTAIN'});
  return {messageId:result.messageId||messageId};
 }finally{if(deadline)clearTimeout(deadline);try{transport.close();}catch{/* Never log SMTP protocol/authentication errors. */}}
}

export type SmtpFailure={state:'RETRY'|'BLOCKED'|'FAILED'|'NEEDS_REVIEW';code:string;message:string;ambiguous:boolean;retryDelayMs?:number};
/** Do not persist/log raw SMTP errors: they can contain authentication exchanges. */
export function classifyGmailSmtpFailure(error:unknown):SmtpFailure{
 const e=error as {code?:string;responseCode?:number;response?:string;timeoutType?:string};
 const responseCode=Number(e?.responseCode),response=typeof e?.response==='string'?e.response:'';
 if(['SMTP_CONFIGURATION','MODULE_NOT_FOUND','ERR_MODULE_NOT_FOUND','ECONFIG','ENOAUTH'].includes(e?.code??''))return {state:'BLOCKED',code:'SMTP_CONFIGURATION',message:'Gmail SMTP is not configured or Nodemailer is not installed. Install backend dependencies and check the backend SMTP environment.',ambiguous:false};
 // Explicit SMTP rejection means the server did not accept this message.
 if(responseCode>=400&&responseCode<500||responseCode===503)return {state:'RETRY',code:'SMTP_TEMPORARY_LIMIT',message:'Gmail temporarily refused this attempt or imposed a sending limit. A delayed retry is scheduled.',ambiguous:false,retryDelayMs:15*60000};
 if(/\b5\.4\.5\b|daily.*(?:limit|quota)|quota.*exceeded/i.test(response)&&responseCode>=500&&responseCode<600)return {state:'RETRY',code:'SMTP_DAILY_LIMIT',message:'Gmail reported a daily sending limit. Retry is deferred for at least 24 hours.',ambiguous:false,retryDelayMs:24*3600000};
 if(e?.code==='EAUTH')return {state:'BLOCKED',code:'SMTP_AUTHENTICATION',message:'Gmail authentication failed. Check SMTP_USER and the Google App Password, two-step verification, and account policy. Fix the backend configuration before retrying.',ambiguous:false};
 if(responseCode>=500&&responseCode<600)return {state:'FAILED',code:'SMTP_REJECTED',message:`Gmail rejected this attempt (SMTP ${responseCode}). Check the recipient and Google account restrictions before retrying.`,ambiguous:false};
 if(['EDNS','ECONNREFUSED','ETLS','EREQUIRETLS'].includes(e?.code??'')||['CONNECT_TIMEOUT','GREETING_TIMEOUT','UPGRADE_TIMEOUT'].includes(e?.timeoutType??''))return {state:'RETRY',code:'SMTP_CONNECTION',message:'The secure Gmail SMTP connection could not be established. A delayed retry is scheduled.',ambiguous:false};
 // A broken socket/timeout during DATA might follow successful server acceptance.
 // Message-ID is not a provider idempotency key; never automatically resend it.
 return {state:'NEEDS_REVIEW',code:'SMTP_UNCERTAIN',message:'Gmail SMTP acceptance could not be confirmed. Automatic and manual resending are held to prevent duplicates. Check Gmail Sent and recipient evidence before any separate follow-up.',ambiguous:true};
}
