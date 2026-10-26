// Read-only diagnostic. No inserts, fixtures, imports or schema changes.
import dotenv from "dotenv";
dotenv.config({quiet:true});
async function main(){
 if(process.argv.includes("--health")){
  for(const path of ["/auth/v1/health","/rest/v1/trips?select=id&limit=1"]){
   const start=performance.now();
   try{
    const key=process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const result=await fetch(new URL(path,process.env.SUPABASE_URL),{headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(10000)});
    await result.body?.cancel();console.log(JSON.stringify({readOnly:true,resource:path.split("?")[0],status:result.status,ms:Math.round(performance.now()-start)}));
   }catch(error){console.log(JSON.stringify({readOnly:true,resource:path.split("?")[0],ms:Math.round(performance.now()-start),error:error instanceof Error?error.name:"NetworkError"}));}
  }
  return;
 }
 if(process.argv.includes("--base")){
  const {supabaseAdmin}=await import("../src/config/supabase.js");
  const start=performance.now();
  const result=await supabaseAdmin.from("trips").select("id").limit(1).abortSignal(AbortSignal.timeout(10000));
  console.log(JSON.stringify({readOnly:true,baseRead:true,ms:Math.round(performance.now()-start),error:result.error,count:result.data?.length}));
  return;
 }
 if(process.argv.includes("--formulas")){
  const {supabaseAdmin}=await import("../src/config/supabase.js");
  const result=await supabaseAdmin.from("spreadsheet_cell_formulas").select("*").eq("table_key","report:dispatch-monitoring").order("id").range(0,499);
  console.log(JSON.stringify({readOnly:true,error:result.error,count:result.data?.length}));
  if(result.error)process.exitCode=1;
  return;
 }
 const {getReportData}=await import("../src/services/report.service.js");
 const start=performance.now();
 try {
  const requestedLimit=process.argv.find(arg=>arg.startsWith("--limit="))?.split("=")[1]??"200";
  const result=await getReportData("dispatch-monitoring",{page:"1",limit:requestedLimit,sort_by:"loading_date",sort_order:"desc",source_lines:"true"});
  console.log(JSON.stringify({readOnly:true,ms:Math.round(performance.now()-start),rows:result.rows.length,pagination:result.pagination}));
  if(process.argv.includes("--formula-rows")){
   const {physicalRowIdentity}=await import("../../packages/spreadsheet-formula/index.js");
   const ids=result.rows.map(physicalRowIdentity).filter((id):id is string=>Boolean(id));
   const {readSpreadsheetFormulas}=await import("../src/services/spreadsheet-formula.service.js");
   const snapshot=await readSpreadsheetFormulas({profileId:"00000000-0000-4000-8000-000000000001",role:"ADMIN"},{table_key:"trips",rows:ids});
   console.log(JSON.stringify({readOnly:true,formulaReadSucceeded:true,formulas:snapshot.formulas.length,sources:snapshot.sources.length}));
  }
 }catch(error){console.error(JSON.stringify({readOnly:true,ms:Math.round(performance.now()-start),error:error instanceof Error?error.message:String(error)}));process.exitCode=1;}
}
void main();
