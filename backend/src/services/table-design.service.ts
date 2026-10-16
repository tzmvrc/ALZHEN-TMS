import {supabaseAdmin} from "../config/supabase.js";
import {ApiError} from "../utils/api-response.js";
import {validateLayoutRequest} from "./table-layout.service.js";
import {mergeDesign,validateDesignPatch} from "./table-design.logic.js";
type Actor={profileId:string;role:string};
const fields="table_key,column_key,width_px,revision,updated_at,updated_by,design";
function dbError(error:{code?:string}|null){if(error)throw new ApiError(error.code==="42703"?"Shared design migration is awaiting approval/application. Widths remain available.":"Shared design could not be saved or loaded.",503,"SHARED_DESIGN_UNAVAILABLE");}
export async function getSharedDesign(actor:Actor,table:string){
 validateLayoutRequest(actor,table);
 const {data,error}=await supabaseAdmin.from("shared_table_column_widths").select(fields).eq("table_key",table).order("column_key").limit(500);dbError(error);return data??[];
}
export async function saveSharedDesign(actor:Actor,table:string,column:string,input:Record<string,unknown>){
 validateLayoutRequest(actor,table,column);
 if(["__proto__","constructor","prototype"].includes(column))throw new ApiError("Invalid column identifier.",400);
 if(Object.keys(input).some(k=>!["patch","expected_revision","initial_width_px"].includes(k))||!Number.isInteger(input.expected_revision)||Number(input.expected_revision)<0||Number(input.expected_revision)>=2147483647||!Number.isInteger(input.initial_width_px)||Number(input.initial_width_px)<60||Number(input.initial_width_px)>1600)throw new ApiError("Invalid design revision or initial width.",400);
 const patch=validateDesignPatch(input.patch);
 const existing=await supabaseAdmin.from("shared_table_column_widths").select(fields).eq("table_key",table).eq("column_key",column).maybeSingle();dbError(existing.error);
 if((existing.data?.revision??0)!==input.expected_revision)throw new ApiError("Another user changed this column. Your design draft is retained; reload and retry.",409,"LAYOUT_CONFLICT");
 const values={design:mergeDesign(existing.data?.design??{},patch),revision:Number(input.expected_revision)+1,updated_at:new Date().toISOString(),updated_by:actor.profileId};
 const result=existing.data?await supabaseAdmin.from("shared_table_column_widths").update(values).eq("table_key",table).eq("column_key",column).eq("revision",input.expected_revision).select(fields).maybeSingle():await supabaseAdmin.from("shared_table_column_widths").insert({...values,table_key:table,column_key:column,width_px:input.initial_width_px}).select(fields).maybeSingle();
 if(result.error?.code==="23505"||(!result.error&&!result.data))throw new ApiError("Another user changed this column. Your design draft is retained; reload and retry.",409,"LAYOUT_CONFLICT");dbError(result.error);return result.data;
}
