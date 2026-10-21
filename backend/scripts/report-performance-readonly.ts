import "dotenv/config";
import {writeFileSync} from "node:fs";
async function main(){
const endpoint=new URL(process.env.SUPABASE_URL!);
if(endpoint.hostname!=="hdmknewarynwpbrhfgai.supabase.co")throw Error("Unexpected Supabase project; stopped.");
const raw=globalThis.fetch;let calls:Array<{table:string;ms:number;status:number}>=[];
globalThis.fetch=async(input,init)=>{
 const request=input instanceof Request?input:null,url=new URL(request?.url??String(input));
 const method=(init?.method??request?.method??"GET").toUpperCase();
 if(!["GET","HEAD"].includes(method)&&!(method==="POST"&&url.pathname.startsWith("/storage/v1/object/sign/")))throw Error("Read-only diagnostic blocked mutation");
 const start=performance.now();try{const result=await raw(input,{...init,signal:AbortSignal.any([...(init?.signal?[init.signal]:[]),AbortSignal.timeout(20000)])});
 calls.push({table:url.pathname.replace(/^\/rest\/v1\//,""),ms:Math.round(performance.now()-start),status:result.status});return result;}catch(error){calls.push({table:url.pathname.replace(/^\/rest\/v1\//,""),ms:Math.round(performance.now()-start),status:0});throw error;}
};
const {supabaseAdmin:db}=await import("../src/config/supabase.js");
const {getReportData}=await import("../src/services/report.service.js");
const {getTracker}=await import("../src/services/transmittal-tracker.service.js");
const results=[];for(const report of ["dispatch-monitoring","dispatch","trip-booking","store-calling","transmittal"]){calls=[];const start=performance.now();try{let result:any;if(report==="transmittal"){const actor=await db.from("profiles").select("id").eq("role","ADMIN").limit(1).maybeSingle();if(!actor.data)throw Error("No read-only admin context available");result=await getTracker({id:actor.data.id,role:"ADMIN"},"",undefined,{page:"1",limit:"50"});}else result=await getReportData(report,{page:"1",limit:"50"});results.push({report,ms:Math.round(performance.now()-start),rows:result.rows.length,total:result.pagination?.total,calls:[...calls]});}catch(error:any){results.push({report,ms:Math.round(performance.now()-start),error:error.code??error.message,calls:[...calls]});}}
if(process.argv.includes("--reports-only")){const output={project:endpoint.hostname.split(".")[0],measuredAt:new Date().toISOString(),results};writeFileSync(process.argv.find(arg=>arg.startsWith("--output="))?.slice(9)??"../docs/report-service-latency-final-readonly.json",JSON.stringify(output,null,2));console.log(JSON.stringify(output));return;}
const plans=[];for(const table of ["v_dispatch_monitoring","v_dispatch_report","v_trip_booking","vw_store_calling_tracker","v_transmittal_tracker_page"]){const start=performance.now();try{const result=await db.from(table).select("*").limit(1).explain({format:"json",analyze:false});plans.push({table,ms:Math.round(performance.now()-start),plan:result.data,error:result.error?.code,message:result.error?.message});}catch{plans.push({table,error:"Plan access unavailable"});}}
const response=await raw(new URL("/rest/v1/",endpoint),{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY!,Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,Accept:"application/openapi+json"},signal:AbortSignal.timeout(20000)});
const schema:any=await response.json();const names=["trips","trip_stops","trip_line_items","store_calls","flex_rows","flex_cells","audit_logs","v_dispatch_monitoring","v_dispatch_report","v_trip_booking","vw_store_calling_tracker","v_transmittal_tracker_page"];
const metadata=Object.fromEntries(names.map(name=>[name,schema.definitions?.[name]??null]));
const counts=[];for(const table of ["trips","trip_stops","trip_truck_assignments","trip_line_items","store_calls","transmittals","flex_rows","offloads","backloads"]){const start=performance.now();const result=await db.from(table).select("id",{count:"exact"}).limit(1);counts.push({table,ms:Math.round(performance.now()-start),count:result.count,error:result.error?.code});}
const key=process.env.SUPABASE_SERVICE_ROLE_KEY!;let credentialRole=key.startsWith("sb_secret_")?"secret key":"opaque";try{credentialRole=JSON.parse(Buffer.from(key.split(".")[1],"base64url").toString()).role;}catch{}
const output={counts,credentialRole,project:endpoint.hostname.split(".")[0],results,plans,metadata};writeFileSync("../docs/report-performance-live-readonly.json",JSON.stringify(output,null,2));console.log(JSON.stringify({project:output.project,counts,credentialRole,results,plans,metadataAvailable:Object.fromEntries(Object.entries(metadata).map(([k,v])=>[k,!!v]))}));

}
void main().catch(error=>{console.error(error.message);process.exitCode=1;});
