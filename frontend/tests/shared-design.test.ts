import test from "node:test";
import assert from "node:assert/strict";
import {designChanges,designLayout,clearSharedDesign,saveSharedDesign,refreshSharedDesign,readSharedDesign,retrySharedDesign} from "../src/services/shared-table-design.ts";
import {apiCacheGeneration,cacheApiSnapshot,getCachedApiResponse,clearApiCache} from "../src/services/api.service.ts";
test("design overlays preserve actual column keys and diff only changed settings",()=>{
 const local={order:["dispatch","route"],hidden:[],colors:{},pins:{}};
 assert.deepEqual(designChanges(local,{...local,hidden:["route"]}),{route:{hidden:true}});
 const next=designLayout(local,local.order,{route:{position:0,pin:"right",hidden:true,color:"#abcdef"},dispatch:{position:1}},true);
 assert.deepEqual(next.order,["route","dispatch"]);assert.deepEqual(next.hidden,["route"]);assert.deepEqual(next.pins,{route:"right"});
 assert.equal(designLayout(local,local.order,{},false),local);
});
test("shared design confirms saves, retains failed drafts, retries and isolates logout/session responses",async()=>{
 const original=globalThis.fetch;let row={column_key:"route",revision:1,width_px:480,design:{color:"#abcdef"}},fail=false,writes=0;
 globalThis.fetch=async(_input,init)=>{if(init?.method==="PATCH"){writes++;if(fail)return new Response(JSON.stringify({success:false,message:"fixture conflict"}),{status:409});const body=JSON.parse(String(init.body));assert.equal(body.expected_revision,row.revision);row={...row,revision:row.revision+1,design:{...row.design,...body.patch}};return new Response(JSON.stringify({success:true,data:row}));}return new Response(JSON.stringify({success:true,data:[row]}));};
 try{clearSharedDesign();await refreshSharedDesign("a","trips");assert.equal(readSharedDesign("b","trips").loaded,false);await saveSharedDesign("a","trips","route",{hidden:true},480);assert.equal(readSharedDesign("a","trips").error,"");assert.equal(readSharedDesign("a","trips").columns.route.hidden,true);
 fail=true;await saveSharedDesign("a","trips","route",{pin:"left"},480);assert.match(readSharedDesign("a","trips").error,/unsaved/);assert.equal(writes,4,"initial save plus three bounded conflict attempts");assert.equal(readSharedDesign("a","trips").columns.route.pin,"left");fail=false;await retrySharedDesign("a","trips");assert.equal(readSharedDesign("a","trips").error,"");assert.equal(writes,5,"retry confirms the retained patch exactly once");clearSharedDesign();assert.equal(readSharedDesign("a","trips").loaded,false);
 }finally{globalThis.fetch=original;clearSharedDesign();}
});
test("composed screen snapshots share token isolation, retention and logout generation guard",()=>{
 clearApiCache();const generation=apiCacheGeneration();cacheApiSnapshot("/trips/fixture/screen-snapshot","a",{value:1},generation);
 assert.deepEqual(getCachedApiResponse("/trips/fixture/screen-snapshot","a"),{value:1});assert.equal(getCachedApiResponse("/trips/fixture/screen-snapshot","b"),null);
 clearApiCache();cacheApiSnapshot("/trips/fixture/screen-snapshot","a",{value:"late"},generation);assert.equal(getCachedApiResponse("/trips/fixture/screen-snapshot","a"),null);
});
