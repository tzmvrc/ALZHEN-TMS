import "dotenv/config";
import {supabaseAdmin} from "../src/config/supabase.js";
import {readTripConvoy} from "../src/services/trip-convoy.service.js";
import {isValidUuid} from "../src/utils/validation.js";
import {recordDeletionCapabilities} from "../src/services/record-deletion.service.js";
async function main(){
 if(new URL(process.env.SUPABASE_URL!).hostname!=="hdmknewarynwpbrhfgai.supabase.co")throw Error("Unexpected project");
 const trip=process.argv[2];if(!isValidUuid(trip))throw Error("Provide an explicitly identified trip UUID for read-only inspection");
 const original=globalThis.fetch;
 globalThis.fetch=(input,init)=>{const method=init?.method??(input instanceof Request?input.method:"GET");if(!["GET","HEAD"].includes(method))throw Error("Read-only diagnostic blocked mutation");return original(input,init);};
 const admin=await supabaseAdmin.from("profiles").select("id").eq("role","ADMIN").limit(1).maybeSingle();if(admin.error||!admin.data)throw Error("No authorized read context");
 const start=performance.now(),result=await readTripConvoy({id:admin.data.id,role:"ADMIN"},trip);
 const capabilities=await recordDeletionCapabilities({id:admin.data.id,role:"ADMIN"});
 console.log(JSON.stringify({readOnly:true,ms:Math.round(performance.now()-start),assignments:result.assignments.length,stops:result.stops.length,cargo:result.cargo.length,allocations:result.allocations.length,responsibilities:result.responsibilities.length,totals:result.totals,capabilities}));
}
void main().catch(error=>{console.error(error.message);process.exitCode=1;});
