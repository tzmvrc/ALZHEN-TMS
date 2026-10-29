import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePodVision,podVisionRequest,extractPodVision,reviewablePodVision} from '../src/services/pod-vision.service.js';
import {matchPodModels,podModelCatalog} from '../../frontend/src/services/pod-model-matching.js';
import {composeSaved,snapshotOf} from '../../frontend/src/services/receipt-fields.service.js';
const field=(value:unknown,uncertain=false)=>({value,uncertain});
test('vision uses actual image content with a dedicated Flash model',()=>{
 const body=podVisionRequest([{bytes:Buffer.from('isolated-image'),mime:'image/png'}]);assert.equal(body.model,'deepseek-flash');assert.ok(JSON.stringify(body.messages).includes('never substitute order'));assert.deepEqual(body.thinking,{type:'disabled'});assert.equal(body.response_format.type,'json_object');const image=body.messages[0].content[1] as {image_url:{url:string}};assert.ok(image.image_url.url.startsWith('data:image/png;base64,'));assert.equal(Buffer.from(image.image_url.url.split(',')[1],'base64').toString(),'isolated-image');
});
test('vision preserves leading zero strings, normalizes dates and returns multiple models',()=>{
 assert.deepEqual(parsePodVision({readability:'readable',fields:{dr:field('0000123456'),receiver:field('Sample Store'),date:field('October 20, 2026'),models:field(['TEST-100','TEST-200','TEST-100'])}}).fields,{dr:'0000123456',receiver:'Sample Store',date:'2026-10-20',models:'TEST-100, TEST-200'});
});
test('uncertain, malformed and missing fields remain blank, including optional models',()=>{
 const result=parsePodVision({fields:{dr:field(123456),receiver:field('Invented',true),date:field('2026-02-31')}});assert.deepEqual(result.fields,{dr:'',receiver:'',date:'',models:''});assert.equal(parsePodVision({fields:{dr:field('00001')}}).fields.dr,'00001');
});
test('model matching accepts formatting and one unique visual confusion, rejects weak/ambiguous candidates',()=>{
 assert.deepEqual(matchPodModels(['test 100','ABCIOOO','UNKNOWN-999','TEST-101'],['TEST-100','ABCI000']).matched,['TEST-100']);
 assert.deepEqual(matchPodModels(['ABC123O'],['ABC1230']),{matched:['ABC1230'],unmatched:[]});
 assert.deepEqual(matchPodModels(['ABC123O'],['ABC1230','ABC123O']).matched,['ABC123O']);
 assert.deepEqual(matchPodModels(['TEST100'],['TEST-100','TEST 100']).matched,[]);
 assert.deepEqual(matchPodModels(['ABC123I'],['ABC1231','ABC123L']).matched,[]);
 assert.deepEqual(matchPodModels(['???'],['***']).matched,[]);
 assert.deepEqual(matchPodModels(['TEST101'],['TEST-100']),{matched:[],unmatched:['TEST101']});
});
test('multiple and empty model selections round-trip through historical receipt text format',()=>{
 for(const models of ['TEST-100, TEST-200','TEST-100','']){const fields={dr:'0000123456',receiver:'Sample Store',date:'2026-10-20',models};assert.deepEqual(snapshotOf(composeSaved({fields,raw:'AI image extraction (unreviewed)'}),fields.dr).fields,fields);}
});
test('vision requests deduplicate, keep V4 Pro configuration intact and allow retry after timeout',async t=>{
 const old={key:process.env.DEEPSEEK_API_KEY,enabled:process.env.POD_AI_ENABLED};process.env.DEEPSEEK_API_KEY='fixture-vision-key';process.env.POD_AI_ENABLED='true';const originalModel=process.env.DEEPSEEK_MODEL;let calls=0,fail=false;
 const mocked=t.mock.method(globalThis,'fetch',async(url:unknown,options?:RequestInit)=>{if(String(url).endsWith('/models'))return new Response(JSON.stringify({data:[{id:'deepseek-flash'}]}));calls++;const body=JSON.parse(String(options?.body));assert.equal(body.model,'deepseek-flash');if(fail)throw new DOMException('Synthetic timeout','TimeoutError');await new Promise(resolve=>setTimeout(resolve,15));return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({scan_complete:true,readability:'readable',fields:{dr:field('00001')}})}}]}));});
 try{const pages=[{mime:'image/png',bytes:Buffer.from('fixture-a')}];await Promise.all([extractPodVision(pages),extractPodVision(pages)]);await extractPodVision(pages);assert.equal(calls,1);fail=true;const retry=[{mime:'image/png',bytes:Buffer.from('fixture-b')}];await assert.rejects(extractPodVision(retry),{name:'TimeoutError'});fail=false;assert.equal((await extractPodVision(retry)).fields.dr,'00001');assert.equal(calls,3);assert.equal(process.env.DEEPSEEK_MODEL,originalModel);}
 finally{mocked.mock.restore();if(old.key===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=old.key;if(old.enabled===undefined)delete process.env.POD_AI_ENABLED;else process.env.POD_AI_ENABLED=old.enabled;}
});

test('confident DR survives scoped API normalization even when master data differs',()=>{
 for(const dr of ['0000123456','DR-001A']){const parsed=parsePodVision({fields:{dr:field(dr),date:field('July 10, 2026')}});const response=JSON.parse(JSON.stringify({success:true,data:reviewablePodVision(parsed,['DIFFERENT-ASSIGNED-DR'])}));assert.equal(response.data.fields.dr,dr);assert.equal(response.data.dr_matches_assignment,false);assert.equal(reviewablePodVision(parsed,[dr]).dr_matches_assignment,true);}
});
test('catalog matches known aliases and aggregates assigned whole quantities without changing cargo',()=>{
 const cargo=[{quantity:2,line:{customer_model:'Refrigerator description',product:{model_code:'TRF-118PH',sku:'REF-001'}}},{quantity:3,line:{customer_model:'Other name',product:{model_code:'TRF-118PH'}}},{line:{customer_model:'TAC-25CSD/KEI2-OD'}}];const original=JSON.stringify(cargo),catalog=podModelCatalog(cargo);
 assert.deepEqual(catalog.quantities,{'TRF-118PH':'5','TAC-25CSD/KEI2-OD':'1'});assert.deepEqual(matchPodModels(['TRF 118 PH','REF-001'],catalog.options,catalog.aliases).matched,['TRF-118PH']);assert.deepEqual(matchPodModels(['TM-6022 74LED'],catalog.options,catalog.aliases).matched,[]);assert.equal(JSON.stringify(cargo),original);
});
test('POD quantity metadata round-trips including zero and survives receipt corrections',()=>{
 const snapshot={fields:{dr:'00001',receiver:'Store',date:'2026-07-10',models:'TEST-100, TEST-200'},raw:'Receipt text',modelQuantities:{'TEST-100':0,'TEST-200':7}};
 const restored=snapshotOf(composeSaved(snapshot),snapshot.fields.dr);assert.deepEqual(restored,snapshot);restored.fields.receiver='Corrected Store';assert.deepEqual(snapshotOf(composeSaved(restored),'00001').modelQuantities,snapshot.modelQuantities);
 assert.equal(snapshotOf(composeSaved({fields:snapshot.fields,raw:snapshot.raw}),'00001').modelQuantities,undefined);
});
