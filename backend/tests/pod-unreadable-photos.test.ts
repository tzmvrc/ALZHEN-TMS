import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {supabaseAdmin as db} from '../src/config/supabase.js';
import {parsePodVision,mergeVisionExtractions,extractPodVision,podVisionRequest} from '../src/services/pod-vision.service.js';
import {readPodAutomatically} from '../src/services/pod-auto-read.service.js';
import {shouldRemovePodPhoto,type AutomaticPodReading} from '../../frontend/src/services/pod-auto-read.service.js';

const empty={dr:'',receiver:'',date:'',models:''};
const fields=Object.fromEntries(Object.keys(empty).map(key=>[key,{value:null,uncertain:false}]));
const unusable={readability:'unreadable',completely_unreadable:true,readability_confidence:.99,fields,serial_groups:[],scan_complete:false};
const removal:AutomaticPodReading={state:'UNREADABLE',source:'vision',unreadable_confirmed:true,fields:empty,ocr_text:'',confidence:null,warnings:[]};

test('only an explicit high-confidence, content-free vision assessment permits removal',()=>{
 assert.equal(parsePodVision(unusable).unreadable_confirmed,true);
 for(const delta of [{completely_unreadable:undefined},{completely_unreadable:'true'},{readability_confidence:.94},{readability_confidence:99},{readability_confidence:NaN},{readability:'partial'},{readability:'readable'},{fields:{...fields,dr:{value:'DR-100',uncertain:false}}},{fields:{...fields,receiver:{value:'Possibly Store',uncertain:true}}},{fields:{...fields,models:{value:['Readable code'],uncertain:true}}},{serial_groups:[{heading:'Readable heading',serials:[]}]},{serial_groups:[{serials:[123456]}]},{serial_groups:[{uncertain_serials:['AB?23']}]},{serial_groups:[{quantity:0}]}])assert.equal(parsePodVision({...unusable,...delta}).unreadable_confirmed,false,JSON.stringify(delta));
 assert.match(JSON.stringify(podVisionRequest([{bytes:Buffer.from('fixture'),mime:'image/png'}])),/readability_confidence/);
});

test('client never removes partial content, legacy unreadability, OCR fallback or service failures',()=>{
 assert.equal(shouldRemovePodPhoto(removal),true);
 for(const delta of [{unreadable_confirmed:undefined},{source:'ocr_fallback'},{state:'PARTIAL'},{state:'UNAVAILABLE'},{service_error:{code:'POD_AI_TIMEOUT',message:'Timed out'}},{code:'POD_IMAGE_INVALID'},{fields:{...empty,dr:'DR-100'}},{ocr_text:'Some readable text'},{serial_groups:[{model:null,heading:'',association_clear:false,serials:[],uncertain_serials:['A?'],quantity:null}]}])assert.equal(shouldRemovePodPhoto({...removal,...delta} as AutomaticPodReading),false);
});

test('multi-page documents require every page to be confidently unusable',()=>{
 const bad=parsePodVision(unusable),partial=parsePodVision({...unusable,readability:'partial',fields:{...fields,dr:{value:'DR-100'}}});
 assert.equal(mergeVisionExtractions([bad,bad]).unreadable_confirmed,true);
 assert.equal(mergeVisionExtractions([bad,partial]).unreadable_confirmed,false);
 assert.equal(mergeVisionExtractions([bad,{...bad,unreadable_confirmed:false}]).unreadable_confirmed,false);
 assert.equal(mergeVisionExtractions([]).unreadable_confirmed,false);
});

test('successful Flash assessment reaches intake without OCR; a failed sibling page never authorizes removal',async t=>{
 const old={key:process.env.DEEPSEEK_API_KEY,enabled:process.env.POD_AI_ENABLED};
 process.env.DEEPSEEK_API_KEY='isolated-unreadable-photos';process.env.POD_AI_ENABLED='true';
 const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,actor={id:id(1),role:'TRUCKER'};
 let fail=false,calls=0;
 t.mock.method(db,'from',((table:string)=>{const q:any={};for(const key of ['select','eq','is','limit','maybeSingle'])q[key]=()=>q;q.then=(resolve:any,reject:any)=>Promise.resolve({error:null,data:table==='trip_truck_assignments'?{id:id(2),trip_id:id(3),stop_scope:'ALL',driver:{profile_id:actor.id},trip:{status:'IN_PROGRESS'}}:table==='trip_stops'?{id:id(4),dr_number:'DR-100',store:{name:'Fixture Store'}}:[{line:{dr_number:'DR-100',customer_model:'TEST-100'}}]}).then(resolve,reject);return q;}) as any);
 t.mock.method(globalThis,'fetch',async(url:unknown)=>{if(String(url).endsWith('/models'))return new Response(JSON.stringify({data:[{id:'deepseek-flash'}]}));assert.equal(String(url),'https://api.deepseek.com/chat/completions');calls++;if(fail&&calls%2===1)throw new DOMException('Synthetic timeout','TimeoutError');return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(unusable)}}]}));});
 try{
  const canvas=createCanvas(200,200),ctx=canvas.getContext('2d');ctx.fillStyle='black';ctx.fillRect(0,0,200,200);const bytes=canvas.toBuffer('image/png');
  const result=await readPodAutomatically(actor,id(2),id(4),bytes,'image/png','black.png');
  assert.equal(shouldRemovePodPhoto(result),true);assert.equal(calls,1);assert.deepEqual(result.fields,empty);assert.equal(result.message,undefined);
  fail=true;const mixed=await extractPodVision([{bytes:Buffer.from('page-one'),mime:'image/png'},{bytes:Buffer.from('page-two'),mime:'image/png'}]);
  assert.equal(mixed.unreadable_confirmed,false);assert.equal(mixed.scan_complete,false);
 }finally{if(old.key===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=old.key;if(old.enabled===undefined)delete process.env.POD_AI_ENABLED;else process.env.POD_AI_ENABLED=old.enabled;}
});
