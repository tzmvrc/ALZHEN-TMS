import test from "node:test";
import assert from "node:assert/strict";
import {validateDesignPatch,mergeDesign} from "../src/services/table-design.logic.js";
test("shared design accepts only bounded appearance settings, never business values or CSS URLs",()=>{
 const patch={pin:"right",hidden:false,position:2,color:"#abcdef",cells:{"stop:fixture":{bold:true,fontSize:16,fontFamily:"Arial",color:null}}};assert.deepEqual(validateDesignPatch(patch),patch);
 for(const invalid of [{color:"url(secret)"},{format:{fontSize:100}},{format:{fontFamily:"url(x)"}},{cells:{row:{quantity:3}}},{pin:"top"},{hidden:"yes"},{cells:{"row\u0000field":{bold:true}}},{position:-1},{grant:"all"}])assert.throws(()=>validateDesignPatch(invalid));
 assert.deepEqual(mergeDesign({hidden:true,cells:{a:{bold:true},b:{color:"#abcdef"}}},{cells:{a:null}}),{hidden:true,cells:{b:{color:"#abcdef"}}});
});
test("design writes reuse width storage, preserve width, enforce role and exact revision",async()=>{
 process.env.SUPABASE_URL="http://127.0.0.1:54321";process.env.SUPABASE_SERVICE_ROLE_KEY="isolated-test";process.env.SUPABASE_ANON_KEY="isolated-test";
 const {supabaseAdmin}=await import("../src/config/supabase.js"),{saveSharedDesign}=await import("../src/services/table-design.service.js");const original=supabaseAdmin.from;let writes=0,patch:Record<string,unknown>={},conflict=false;
 const filters:Record<string,unknown>={};
 (supabaseAdmin as any).from=(table:string)=>{assert.equal(table,"shared_table_column_widths");let updating=false;const chain:any={select:()=>chain,eq:(k:string,v:unknown)=>{filters[k]=v;return chain;},update:(v:Record<string,unknown>)=>{patch=v;writes++;updating=true;return chain;},maybeSingle:async()=>({error:null,data:updating?(conflict?null:{column_key:"route",...patch}):{revision:3,width_px:480,design:{color:"#abcdef"}}})};return chain;};
 const actor={profileId:"fixture",role:"STAFF"},input={expected_revision:3,initial_width_px:180,patch:{hidden:true}};
 try{
  await assert.rejects(saveSharedDesign({...actor,role:"TRUCKER"},"trips","route",input),/Only ADMIN/);assert.equal(writes,0);
  await assert.rejects(saveSharedDesign(actor,"trips","__proto__",input),/Invalid column/);assert.equal(writes,0);
  await saveSharedDesign(actor,"trips","route",input);assert.equal(writes,1);assert.equal(Object.hasOwn(patch,"width_px"),false);assert.deepEqual(patch.design,{color:"#abcdef",hidden:true});assert.deepEqual(filters,{table_key:"trips",column_key:"route",revision:3});
  await assert.rejects(saveSharedDesign(actor,"trips","route",{...input,expected_revision:2}),/Another user/);assert.equal(writes,1);
  conflict=true;await assert.rejects(saveSharedDesign(actor,"trips","route",input),/Another user/);
 }finally{supabaseAdmin.from=original;}
});
