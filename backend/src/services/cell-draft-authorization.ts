import { supabaseAdmin as db } from "../config/supabase.js";
import type { DraftTarget } from "./cell-draft.logic.js";
import type { SocketActor } from "./collaboration-auth.service.js";
import { authorizeTrackerDraft } from "./transmittal-tracker.service.js";
export async function authorizeCellDraft(actor:SocketActor,target:DraftTarget){
 if(target.source==="flex_columns")return authorizeTrackerDraft({id:actor.id,role:actor.role as "ADMIN"|"STAFF"},target.recordId,target.tripId!,target.stopId!,target.table);
 // All standard report editors are management-only in this single-company app.
 // Explicit projection and closed source map prevent arbitrary table reads.
 const {data:raw,error}=await db.from(target.source).select("*").eq("id",target.recordId).maybeSingle();
 if(error||!raw||raw.archived_at)throw Error("Record unavailable");
 if(target.source==="offloads"&&target.reportId&&target.reportId!==target.recordId)throw Error("Wrong report");
 let row=raw;
 if(target.source==="offload_items"){
  if(raw&&target.reportId&&raw.offload_id!==target.reportId)throw Error("Wrong report");
  const parent=await db.from("offloads").select("id,trip_id,trip_stop_id").eq("id",raw?.offload_id??target.reportId).maybeSingle();
  if(parent.error||!parent.data)throw Error("Report unavailable");row=parent.data;
 }
 const trip=target.source==="trips"?row.id:row.trip_id;
 const stop=target.source==="trip_stops"?row.id:row.trip_stop_id;
 if(target.tripId&&trip!==target.tripId||target.stopId&&stop!==target.stopId)throw Error("Wrong physical owner");
 if(trip){const parent=await db.from("trips").select("id,archived_at").eq("id",trip).maybeSingle();if(parent.error||!parent.data||parent.data.archived_at)throw Error("Trip unavailable");}
 if(["offloads","backloads","loading_reports","offload_items"].includes(target.source)){
  const type=({offloads:"OFFLOAD",offload_items:"OFFLOAD",backloads:"BACKLOAD",loading_reports:"LOADING"} as Record<string,string>)[target.source];
  const converted=await db.from("operations_report_conversions").select("id").eq("source_type",type).eq("source_id",target.source==="offload_items"?row.id:target.recordId).limit(1);
  if(converted.error||converted.data?.length)throw Error("Converted report is read-only");
 }
 if(target.table==="transmittal-tracker"){
  if(target.source!=="trip_stops"||target.field!=="dr_number")throw Error("Tracker field not editable");
  await authorizeTrackerDraft({id:actor.id,role:actor.role as "ADMIN"|"STAFF"},null,trip,target.recordId);
 }
}
