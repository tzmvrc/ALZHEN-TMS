import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {supabaseAdmin as db} from '../src/config/supabase.js';
import {operationalEmailTemplate,type OperationalEmailContext} from '../src/services/operational-email-template.js';
import {operationalReportPdf} from '../src/services/operational-email-pdf.js';
import {processOperationalEmail,testingRecipientAllowed,providerRejection} from '../src/services/operational-email.service.js';
const context:OperationalEmailContext={type:'BACKLOAD',date:'27 Oct 2026, 8:00 pm',dispatch:'FIXTURE-EMAIL',tripReference:'TRIP-FIXTURE',driver:'Test Driver',plate:'FIX-123',company:'Fixture Trucking',warehouse:'Warehouse',destination:'Affected store',dr:'12345',reason:'Store unable to accept delivery <script>',remarks:'Test remarks',boxes:'10',waiting:'',cargo:[{ship_to:'Store A',customer_name:'Customer A',dr_number:'12345',sap_so_number:'SO1',customer_po_number:'PO1',internal_po_number:'I1',customer_model:'MODEL1',quantity:10,total_cbm:2.5}]};
test('HTML/plain text and formal branded PDF preserve linked report values',async()=>{
 const email=operationalEmailTemplate(context);assert.match(email.html,/cid:alzhen-logo/);assert.match(email.html,/Customer Model/);assert.match(email.html,/&lt;script&gt;/);assert.ok(!email.html.includes('<script>'));assert.match(email.text,/Qty: 10/);assert.match(email.text,/Total CBM: 2.5/);
 const bytes=await operationalReportPdf(context,await readFile(new URL('../assets/logo.png',import.meta.url)));assert.equal(bytes.subarray(0,8).toString(),'%PDF-1.4');assert.ok(bytes.length>10000&&bytes.length<8*1024*1024);
 const {renderPodPdf}=await import('../src/services/pdf-renderer.service.js');const pages=await renderPodPdf(bytes,{pages:2,pixels:6000000,signal:AbortSignal.timeout(20000)});assert.ok(pages.length>=1);assert.ok(pages[0].width>1000);
});
test('provider retries retain frozen attachments, sender, payload and idempotency; restricted and disabled recipients never send',async()=>{
 const originalFrom=db.from,originalStorage=db.storage.from,env={key:process.env.RESEND_API_KEY,from:process.env.RESEND_FROM_EMAIL,enabled:process.env.RESEND_EMAIL_ENABLED};
 let row:any;const objects=new Map<string,Buffer>(),calls:any[]=[];const settings={enabled:true,testing_recipient_email:null};let recipient={email:'delivered@resend.dev',enabled:true,report_types:['BACKLOAD']};
 (db as any).from=(table:string)=>{let patch:any;const chain:any={select:()=>chain,eq:()=>chain,update:(p:any)=>{patch=p;return chain;},single:async()=>({data:settings,error:null}),maybeSingle:async()=>{if(table==='operational_email_recipients')return {data:recipient,error:null};if(patch)Object.assign(row,patch);return {data:{id:row.id},error:null};}};return chain;};
 (db.storage as any).from=()=>({upload:async(path:string,bytes:Buffer)=>{objects.set(path,bytes);return {error:null};},download:async(path:string)=>({data:objects.has(path)?new Blob([new Uint8Array(objects.get(path)!)]):null,error:null})});
 process.env.RESEND_API_KEY='isolated-test-secret';process.env.RESEND_FROM_EMAIL='ALZHEN TMS <onboarding@resend.dev>';process.env.RESEND_EMAIL_ENABLED='true';
 const job=()=>({id:randomUUID(),report_type:'BACKLOAD',report_id:randomUUID(),trip_id:randomUUID(),recipient_id:randomUUID(),recipient_email:'delivered@resend.dev',idempotency_key:'stable-fixture-key',attempts:1,lease_token:randomUUID(),first_send_at:null,ambiguous:false,content:{...operationalEmailTemplate(context),context,from:process.env.RESEND_FROM_EMAIL,to:['delivered@resend.dev']},attachment_manifest:[]});
 try{
  row=job();const transport:typeof fetch=async(_url,init)=>{calls.push({headers:init?.headers,body:init?.body});if(calls.length===1)throw Error('Ambiguous timeout');return new Response(JSON.stringify({id:'0199b042-8b54-7000-9000-000000000001'}),{status:200});};
  await processOperationalEmail(row,transport);assert.equal(row.state,'RETRY');assert.equal(row.ambiguous,true);const firstBody=calls[0].body;row.state='PROCESSING';row.attempts++;await processOperationalEmail(row,transport);assert.equal(row.state,'SENT');assert.equal(calls[1].body,firstBody);assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);assert.ok(row.provider_message_id);assert.equal(row.ambiguous,false);
  const parsed=JSON.parse(firstBody);assert.equal(parsed.attachments.length,2);assert.ok(parsed.attachments.some((a:any)=>a.filename.endsWith('.pdf')));assert.ok(!JSON.stringify(row.content).includes('isolated-test-secret'));assert.ok(!JSON.stringify(row.attachment_manifest).includes('base64'));
  row={...job(),recipient_email:'external@example.org'};recipient={...recipient,email:row.recipient_email};await processOperationalEmail(row,transport);assert.equal(row.state,'BLOCKED');assert.equal(calls.length,2);
  row=job();recipient={...recipient,email:row.recipient_email,enabled:false};await processOperationalEmail(row,transport);assert.equal(row.state,'CANCELLED');assert.equal(calls.length,2);
  row={...job(),ambiguous:true,first_send_at:new Date(Date.now()-25*3600000).toISOString()};recipient={...recipient,enabled:true};await processOperationalEmail(row,transport);assert.equal(row.state,'NEEDS_REVIEW');assert.equal(calls.length,2);
  assert.equal(testingRecipientAllowed('external@example.org',settings,true),false);assert.equal(testingRecipientAllowed('delivered@resend.dev',settings,true),true);assert.equal(testingRecipientAllowed('owner@example.org',{testing_recipient_email:'owner@example.org'},true),true);
 }finally{(db as any).from=originalFrom;(db.storage as any).from=originalStorage;for(const [key,value]of Object.entries({RESEND_API_KEY:env.key,RESEND_FROM_EMAIL:env.from,RESEND_EMAIL_ENABLED:env.enabled})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});

test('provider response identifies the actual testing account and overrides an incorrectly declared account',async()=>{
 const {createHash}=await import('node:crypto');const {providerRejection,testingRecipientAllowed}=await import('../src/services/operational-email.service.js');
 const rejection=providerRejection(403,{name:'validation_error',message:'You can only send testing emails to your own email address (owner@example.org). To send emails to other recipients, please verify a domain.'});
 assert.equal(rejection.account,'owner@example.org');assert.equal(rejection.name,'validation_error');assert.match(rejection.message,/only send testing/);
 const config={testing_recipient_email:'wrong@example.org',testing_account_email:rejection.account,testing_account_key_hash:createHash('sha256').update(process.env.RESEND_API_KEY??'').digest('hex')};
 assert.equal(testingRecipientAllowed('wrong@example.org',config,true),false);assert.equal(testingRecipientAllowed('owner@example.org',config,true),true);assert.equal(testingRecipientAllowed('delivered@resend.dev',config,true),true);assert.equal(providerRejection(403,{message:'API key is invalid'}).account,null);
});
