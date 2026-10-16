import assert from "node:assert/strict";
import test from "node:test";
import {clearApiCache} from "../src/services/api.service.ts";
import {fetchMasterData,getCachedMasterData,saveMasterData} from "../src/services/master-data.service.ts";
test("master pages share warmup/navigation cache, isolate users and invalidate after saves",async()=>{
 clearApiCache();const original=globalThis.fetch;let reads=0,writes=0;
 globalThis.fetch=async(_input,init)=>{if(init?.method==="PATCH"){writes++;return new Response(JSON.stringify({success:true,data:{id:"truck",plate_number:"NEW"}}));}reads++;await new Promise(resolve=>setTimeout(resolve,5));return new Response(JSON.stringify({success:true,data:{rows:[{id:"truck",plate_number:reads>1?"NEW":"OLD"}],pagination:{page:1,limit:100,total:1,totalPages:1}}}));};
 try {
  const [a,b]=await Promise.all([fetchMasterData("owner","trucks",""),fetchMasterData("owner","trucks","")]);assert.strictEqual(a,b);assert.equal(reads,1);assert.strictEqual(getCachedMasterData("owner","trucks"),a);assert.equal(getCachedMasterData("other","trucks"),null);
  await saveMasterData("owner","trucks",{plate_number:"NEW"},"truck");assert.equal(writes,1);assert.equal(getCachedMasterData("owner","trucks"),null);
  await fetchMasterData("owner","trucks","");assert.equal(reads,2);
 }finally{globalThis.fetch=original;clearApiCache();}
});
