import "dotenv/config";
import {writeFileSync} from "node:fs";
async function main(){
 const host=new URL(process.env.SUPABASE_URL!);if(host.hostname!=="hdmknewarynwpbrhfgai.supabase.co")throw Error("Unexpected project");
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY!;const views=["v_dispatch_monitoring","v_dispatch_report","v_trip_booking","vw_store_calling_tracker","v_store_calling","v_transmittal_tracker_page"];
 const results:unknown[]=[];let index=0;
 await Promise.all([0,1].map(async()=>{while(index<views.length){const view=views[index++],url=new URL(`/rest/v1/${view}`,host);url.searchParams.set("select","*");url.searchParams.set("limit","50");const start=performance.now();let result;try{const response=await fetch(url,{headers:{apikey:key,Authorization:`Bearer ${key}`,Prefer:"count=exact"},signal:AbortSignal.timeout(10000)});const data=await response.json();result={view,status:response.status,ms:Math.round(performance.now()-start),rows:Array.isArray(data)?data.length:null,total:response.headers.get("content-range")?.split("/")[1]??null,error:response.ok?undefined:data.code};}catch{result={view,ms:Math.round(performance.now()-start),error:"Read timed out or could not connect"};}results.push(result);console.log(JSON.stringify(result));}}));
 writeFileSync("../docs/report-view-latency-final-readonly.json",JSON.stringify({project:host.hostname.split(".")[0],measuredAt:new Date().toISOString(),databaseEngineTiming:false,results},null,2));
}
void main().catch(error=>{console.error(error.message);process.exitCode=1;});
