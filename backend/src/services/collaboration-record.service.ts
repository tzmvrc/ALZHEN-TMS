import { supabaseAdmin } from "../config/supabase.js";
import { SOURCE_FIELDS } from "./collaboration.logic.js";
import { ApiError } from "../utils/api-response.js";
import { isValidUuid } from "../utils/validation.js";
export async function readCollaborationRecord(source:string,id:string){
 if(!Object.hasOwn(SOURCE_FIELDS,source)||!isValidUuid(id))throw new ApiError("Invalid physical record.",400,"INVALID_COLLABORATION_RECORD");
 const {data,error}=await supabaseAdmin.from(source).select("*").eq("id",id).maybeSingle();
 if(error)throw new ApiError("Unable to read the saved record.",503,"COLLABORATION_READ_FAILED");
 if(!data)throw new ApiError("The record no longer exists.",404,"COLLABORATION_RECORD_NOT_FOUND");
 return Object.fromEntries(["id","trip_id","trip_stop_id","collaboration_version","updated_at",...SOURCE_FIELDS[source]].filter(key=>Object.hasOwn(data,key)).map(key=>[key,data[key]]));
}
