import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {extractOcrFields,validateAiFields,clearlyUnreadable,receiptDate,podExtractionRequest,relevantReceiptText} from '../src/services/pod-extraction.logic.js';
import {enhancePodExtraction} from '../src/services/pod-auto-read.service.js';
import {createReceiptOcr} from '../src/services/pod-ocr.service.js';
import {ApiError} from '../src/utils/api-response.js';
const context={drs:['FIXTURE-100'],stores:['Fixture Store'],models:['TEST-100','TEST-200']};
const text='DELIVERY RECEIPT\nDR No: FIXTURE-100\nReceived by: Fixture Store\nDelivery Date: 2026-10-01\nModels: TEST-100, TEST-200';
const noAi=async()=>{throw new ApiError('DeepSeek is temporarily unavailable.',503,'POD_AI_UNAVAILABLE');};
test('OCR preserves all readable fields when AI fails',async()=>{
 const result=await enhancePodExtraction(text,94,context,noAi);
 assert.deepEqual(result.fields,{dr:'FIXTURE-100',receiver:'Fixture Store',date:'2026-10-01',models:'TEST-100, TEST-200'});
 assert.equal(result.state,'PARTIAL');assert.equal(result.service_error?.code,'POD_AI_UNAVAILABLE');assert.equal(result.ocr_text,text);
});
test('DR-only receipt is partial, not unreadable, and does not invent trip data',async()=>{
 const result=await enhancePodExtraction('DR No: FIXTURE-100',83,context,async()=>({fields:{dr:'',receiver:'',models:'',date:''},nonReceipt:false}));
 assert.equal(result.state,'PARTIAL');assert.deepEqual(result.fields,{dr:'FIXTURE-100',receiver:'',date:'',models:''});
});
test('sparse AI fields and malformed optional fields do not invalidate a valid DR',()=>{
 const fields=validateAiFields({dr:{value:'FIXTURE-100',evidence:'DR No: FIXTURE-100',uncertain:false},receiver:37,date:{value:'2026-10-28'},models:{value:'TEST-100, INVENTED-999',evidence:'Models: TEST-100, TEST-200'}},text);
 assert.deepEqual(fields,{dr:'FIXTURE-100',receiver:'',date:'',models:'TEST-100'});
});
test('unsupported model returns safe OCR details, with precise error and working explicit retry',async()=>{
 const failed=await enhancePodExtraction('DR No: FIXTURE-100',90,context,async()=>{throw new ApiError('Configured model not available.',503,'POD_AI_MODEL_UNSUPPORTED');});
 assert.equal(failed.state,'PARTIAL');assert.equal(failed.fields.dr,'FIXTURE-100');assert.equal(failed.code,'POD_AI_MODEL_UNSUPPORTED');
 const retried=await enhancePodExtraction(text,90,context,async()=>({fields:{dr:'FIXTURE-100',receiver:'Fixture Store',date:'2026-10-01',models:'TEST-100'},nonReceipt:false}));
 assert.equal(retried.state,'READY');assert.equal(retried.service_error,undefined);
});
test('database values never substitute for absent receipt evidence and ambiguous dates stay blank',()=>{
 assert.deepEqual(extractOcrFields('A short readable note',context),{dr:'',receiver:'',date:'',models:''});
 assert.equal(receiptDate('03/04/2026'),'');assert.equal(receiptDate('2026-02-31'),'');
 assert.equal(extractOcrFields('DR No: OTHER-100',context).dr,'');
});
test('quality rejection needs corroborating evidence, not just a missing field or white paper',()=>{
 const paper={width:1200,height:600,sharpness:100,dark:.01,glare:.96};
 assert.equal(clearlyUnreadable(paper,'DR No: FIXTURE-100',20),false);
 assert.equal(clearlyUnreadable({...paper,sharpness:0,dark:1,glare:0},'',0),true);
 assert.equal(clearlyUnreadable({...paper,sharpness:.1},'Useful receipt text',90),false);
});
test('OCR initialization failure and timeout are distinct from unreadability',async()=>{
 await assert.rejects(createReceiptOcr(new AbortController().signal,(async()=>{throw Error('Fixture language-data failure');}) as any),(error:ApiError)=>error.code==='POD_OCR_INIT_FAILED');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25);
 try{await assert.rejects(createReceiptOcr(controller.signal,(()=>new Promise(()=>{})) as any),(error:ApiError)=>error.code==='POD_OCR_INIT_TIMEOUT');}finally{clearTimeout(timer);}
});
test('real Tesseract reads a controlled full receipt and blank-image OCR remains distinguishable',async()=>{
 const canvas=createCanvas(1200,600),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1200,600);ctx.fillStyle='black';ctx.font='34px Arial';text.split('\n').forEach((line,i)=>ctx.fillText(line,60,90+i*75));
 const reader=await createReceiptOcr(AbortSignal.timeout(20000));
 try{
  const result=await reader.recognize(canvas.toBuffer('image/png'));assert.ok(result.text.includes('FIXTURE-100'));assert.ok(result.confidence>70);
  assert.equal(extractOcrFields(result.text,context).dr,'FIXTURE-100');
  ctx.fillStyle='black';ctx.fillRect(0,0,1200,600);const blank=await reader.recognize(canvas.toBuffer('image/png'));assert.ok(blank.text.length<4);
 }finally{await reader.close();}
});

test('DeepSeek request disables reasoning and bounds irrelevant OCR',()=>{
 const body=podExtractionRequest('deepseek-v4-pro',text+'\n'+'irrelevant boilerplate\n'.repeat(4000));
 assert.equal(body.model,'deepseek-v4-pro');assert.deepEqual(body.thinking,{type:'disabled'});assert.equal(body.max_tokens,800);assert.equal(body.response_format.type,'json_object');assert.ok(body.messages[1].content.length<=8000);assert.ok(body.messages[1].content.includes('FIXTURE-100'));assert.ok(relevantReceiptText(text).includes('TEST-200'));
});
test('provider timeout preserves OCR fields and compact review message',async()=>{
 const result=await enhancePodExtraction(text,94,context,async()=>{throw new DOMException('Fixture timeout','TimeoutError');});
 assert.equal(result.service_error?.code,'POD_AI_TIMEOUT');assert.deepEqual(result.fields,{dr:'FIXTURE-100',receiver:'Fixture Store',date:'2026-10-01',models:'TEST-100, TEST-200'});assert.equal(result.state,'PARTIAL');assert.equal(result.message,'Some receipt details were filled automatically. Review the remaining fields.');
 const empty=await enhancePodExtraction('Readable general text',80,context,noAi);assert.equal(empty.state,'UNAVAILABLE');assert.equal(empty.message,'Automatic reading is unavailable. Retry or enter the details manually.');
});

test('identical OCR requests share one AI call and reuse successful structured results',async t=>{
 const old={key:process.env.DEEPSEEK_API_KEY,model:process.env.DEEPSEEK_MODEL,enabled:process.env.POD_AI_ENABLED};
 process.env.DEEPSEEK_API_KEY='isolated-test-key';process.env.DEEPSEEK_MODEL='deepseek-v4-pro';process.env.POD_AI_ENABLED='true';let calls=0;
 const mock=t.mock.method(globalThis,'fetch',async(url:unknown,options?:RequestInit)=>{
  if(String(url).endsWith('/models'))return new Response(JSON.stringify({data:[{id:'deepseek-v4-pro'}]}));
  calls++;const body=JSON.parse(String(options?.body));assert.deepEqual(body.thinking,{type:'disabled'});assert.equal(body.max_tokens,800);
  await new Promise(resolve=>setTimeout(resolve,10));return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({fields:{dr:{value:'FIXTURE-100',evidence:'DR No: FIXTURE-100'}}})}}]}));
 });
 try{const results=await Promise.all([enhancePodExtraction(text,90,context),enhancePodExtraction(text,90,context)]);assert.ok(results.every(result=>result.fields.dr==='FIXTURE-100'));await enhancePodExtraction(text,90,context);assert.equal(calls,1);}
 finally{mock.mock.restore();for(const [key,value]of Object.entries({DEEPSEEK_API_KEY:old.key,DEEPSEEK_MODEL:old.model,POD_AI_ENABLED:old.enabled})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
