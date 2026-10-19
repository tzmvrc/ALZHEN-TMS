import test from "node:test";
import assert from "node:assert/strict";
import {clearApiCache,invalidateApiCache} from "../src/services/api.service";
import {fetchUsersDirectory,getCachedUsersDirectory,filterDirectoryTruckers} from "../src/services/user-management.service";
import {fetchTruckerDetail,getCachedTruckerDetail,truckerDetailFromSummary,type TruckerListItem} from "../src/services/trucker.service";
const row:TruckerListItem={id:"driver",profile_id:"profile",first_name:"Test",last_name:"Driver",full_name:"Test Driver",contact_number:"123",email:"fixture@example.invalid",status:"ACTIVE",profile_picture_path:null,assigned_truck_id:"truck",plate_number:"FIX-1",active_trip_id:"trip",active_trip_number:"DSP-1",current_trip_status:"IN_PROGRESS",delivery_status:"Pending",loading_date:"2026-10-19"};

test("Users directory shares source requests, caches every page and isolates roles, account switches and logout",async()=>{
 const original=globalThis.fetch;clearApiCache();const requests:string[]=[];let name="Original";
 globalThis.fetch=async(input,init)=>{const url=new URL(String(input)),token=new Headers(init?.headers).get("Authorization");requests.push(`${token}:${url.pathname}${url.search}`);await new Promise(resolve=>setTimeout(resolve,5));
  const data=url.pathname.endsWith("/users")?[{id:"admin",role:"ADMIN",first_name:name}]:{rows:[{...row,id:`driver-${url.searchParams.get("page")}`,full_name:name}],pagination:{page:Number(url.searchParams.get("page")),totalPages:2}};
  return new Response(JSON.stringify({success:true,data}),{headers:{"Content-Type":"application/json"}});
 };
 try{
  const directories=await Promise.all(Array.from({length:10},()=>fetchUsersDirectory("admin-token","ADMIN")));
  assert.equal(requests.length,3);assert.equal(directories[0].truckers.length,2);assert.equal(getCachedUsersDirectory("admin-token","ADMIN")?.truckers.length,2);
  await fetchUsersDirectory("admin-token","ADMIN");assert.equal(requests.length,3);
  name="Updated";invalidateApiCache("/users");invalidateApiCache("/truckers");assert.equal(getCachedUsersDirectory("admin-token","ADMIN"),null);
  assert.equal((await fetchUsersDirectory("admin-token","ADMIN")).truckers[0].full_name,"Updated");assert.equal(requests.length,6);
  await fetchUsersDirectory("staff-token","STAFF");assert.equal(requests.filter(request=>request.startsWith("Bearer staff-token:")&&request.endsWith("/users")).length,0);assert.equal(getCachedUsersDirectory("staff-token","STAFF")?.users.length,0);
  assert.equal(getCachedUsersDirectory("other-token","ADMIN"),null);assert.equal(getCachedUsersDirectory("admin-token","TRUCKER"),null);await assert.rejects(fetchUsersDirectory("trucker-token","TRUCKER"));
  clearApiCache();assert.equal(getCachedUsersDirectory("admin-token","ADMIN"),null);
 }finally{globalThis.fetch=original;clearApiCache();}
});

test("Trucker details seed from summary, fetch only enrichment once and preserve exact assignment identities",async()=>{
 const original=globalThis.fetch;clearApiCache();let requests=0;
 const seed=truckerDetailFromSummary(row);assert.equal(seed.full_name,row.full_name);assert.equal(seed.truck?.plate_number,"FIX-1");assert.equal(seed.active_trip?.id,"trip");
 globalThis.fetch=async(input)=>{requests++;assert.match(String(input),/\/truckers\/driver$/);return new Response(JSON.stringify({success:true,data:{...seed,truck:{...seed.truck,make:"Fixture Make"}}}),{headers:{"Content-Type":"application/json"}});};
 try{
  const [detail]=await Promise.all([fetchTruckerDetail("token","driver"),fetchTruckerDetail("token","driver")]);await fetchTruckerDetail("token","driver");assert.equal(requests,1);assert.equal(getCachedTruckerDetail("token","driver")?.truck?.make,"Fixture Make");
  assert.equal(truckerDetailFromSummary({...row,contact_number:"new"},detail).truck?.make,"Fixture Make");assert.equal(truckerDetailFromSummary({...row,assigned_truck_id:"different"},detail).truck?.make,null);
  assert.equal(getCachedTruckerDetail("other","driver"),null);clearApiCache();assert.equal(getCachedTruckerDetail("token","driver"),null);
  assert.equal(filterDirectoryTruckers([row],"test","ACTIVE","assigned").length,1);assert.equal(filterDirectoryTruckers([row],"","INACTIVE","all").length,0);assert.equal(filterDirectoryTruckers([row],"","all","unassigned").length,0);
 }finally{globalThis.fetch=original;clearApiCache();}
});
