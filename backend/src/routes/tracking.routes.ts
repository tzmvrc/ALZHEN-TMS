import {Router,type Request,type Response} from "express";
import {authMiddleware} from "../middleware/auth.middleware.js";
import {requireRole} from "../middleware/role.middleware.js";
import {ApiError,sendError,sendSuccess} from "../utils/api-response.js";
import {isValidUuid} from "../utils/validation.js";
import {trackingEnabled,requireTracking,liveTracking,trackingFeed,trackingEvents,trackingMetrics} from "../services/tracking-runtime.service.js";
import {supabaseAdmin} from "../config/supabase.js";
import {assertTrackingTestScope,trackingTestScope} from "../services/tracking-test-scope.js";
import {parseRoadTripIds,parseRoadContextAssignment,readRoadRouting} from "../services/road-routing-read.service.js";
import {generatePlannedRoute} from "../services/planned-route-runtime.service.js";
import {readFieldMilestones} from "../services/field-milestones.service.js";
import {submissionAssignment} from "../services/field-milestones.logic.js";
const router=Router();
router.use(authMiddleware);
// Bounded, management-only activity read. Never returns private Storage paths.
router.get("/roads/updates",requireRole("ADMIN","STAFF"),async(req,res)=>{
 try{
  const ids=parseRoadTripIds(req.query.trip_ids);
  const {data,error}=await supabaseAdmin.from("driver_trip_updates")
   .select("id,trip_id,driver_id,status,delivery_status,pod_image_path,pod_image_url,notes,updated_at")
   .in("trip_id",ids).order("updated_at",{ascending:false}).order("id").limit(101);
  if(error)throw new ApiError("Driver submissions could not be loaded.",503,"DRIVER_UPDATES_UNAVAILABLE");
  // Legacy driver_id has no FK in the existing schema; resolve names explicitly.
  const driverIds=[...new Set((data??[]).slice(0,100).map(row=>row.driver_id).filter(Boolean))];
  const drivers=driverIds.length?await supabaseAdmin.from("drivers").select("id,first_name,last_name").in("id",driverIds):{data:[],error:null};
  if(drivers.error)throw new ApiError("Driver identities could not be loaded.",503,"DRIVER_UPDATES_UNAVAILABLE");
  const assignments=await supabaseAdmin.from("trip_truck_assignments").select("id,trip_id,driver_id,assigned_at,unassigned_at").in("trip_id",ids).order("id").limit(501);
  const scopeUnavailable=!!assignments.error||(assignments.data?.length??0)>500;
  const rows=(data??[]).slice(0,100).map(({pod_image_path,pod_image_url,...row})=>({...row,assignment_id:scopeUnavailable?null:submissionAssignment(row,assignments.data??[]),receiptSubmitted:!!(pod_image_path||pod_image_url),driver:drivers.data?.find(driver=>driver.id===row.driver_id)??null}));
  const milestones=await readFieldMilestones(ids);
  return sendSuccess(res,200,"Saved driver submissions and operational milestones",{rows,limited:(data?.length??0)>100,...milestones,unavailableSources:[...milestones.unavailableSources,...(scopeUnavailable?["assignment history"]:[])]});
 }catch(error){return fail(res,error);}
});
router.post("/roads/:id/planned",requireRole("ADMIN","STAFF"),async(req,res)=>{
 try{if(!isValidUuid(String(req.params.id)))throw new ApiError("Invalid physical assignment ID.",400,"PLANNED_INVALID");const result=await generatePlannedRoute({id:req.user!.id,role:req.user!.role!},String(req.params.id));if(result&&typeof result==="object"&&"state" in result&&result.state==="UPDATED")trackingEvents.emit("changed",{assignmentId:String(req.params.id)});return sendSuccess(res,200,"Planned route result",result);}catch(error){return fail(res,error);}
});
router.get("/roads",requireRole("ADMIN","STAFF"),async(req,res)=>{
 try{return sendSuccess(res,200,"Read-only road routing",{rows:await readRoadRouting({id:req.user!.id,role:req.user!.role!},parseRoadTripIds(req.query.trip_ids),parseRoadContextAssignment(req.query.context_assignment))});}catch(error){return fail(res,error);}
});
router.get("/capabilities",requireRole("ADMIN","STAFF","TRUCKER"),(req,res)=>{
 try{const scope=trackingTestScope();return sendSuccess(res,200,"Tracking availability",{enabled:trackingEnabled()&&(!scope||req.user!.role!=="TRUCKER"||scope.profileId===req.user!.id)});}catch(error){return fail(res,error);}
});
function fail(res:Response,error:unknown){return sendError(res,error instanceof ApiError?error.statusCode:503,error instanceof ApiError?error.message:"Tracking is unavailable.",error instanceof ApiError?error.code:"TRACKING_UNAVAILABLE");}
const actor=(req:Request)=>({profileId:req.user!.id,role:req.user!.role!});
const id=(req:Request)=>String(req.params.id);
router.get("/metrics",requireRole("ADMIN","STAFF"),(_req,res)=>{try{requireTracking();return sendSuccess(res,200,"Routing process metrics",trackingMetrics());}catch(error){return fail(res,error);}});
router.get("/assignments",requireRole("TRUCKER"),async(req,res)=>{
 try{requireTracking();assertTrackingTestScope(req.user!.id);const scope=trackingTestScope();let query=supabaseAdmin.from("trip_truck_assignments").select("id,trip_id,trucks(plate_number),drivers!inner(profile_id),trips!inner(status,archived_at)")
  .eq("drivers.profile_id",req.user!.id).is("unassigned_at",null).is("trips.archived_at",null).not("trips.status","in","(COMPLETED,CANCELLED)").order("id").limit(51);
  if(scope)query=query.eq("id",scope.assignmentId);const {data,error}=await query;
  if(error||!data||data.length>50)throw new ApiError("Unable to load a bounded assignment list.",503,"TRACKING_UNAVAILABLE");
  return sendSuccess(res,200,"Your active assignments",data.map(a=>({id:a.id,trip_id:a.trip_id,plate_number:(Array.isArray(a.trucks)?a.trucks[0]:a.trucks)?.plate_number??null})));
 }catch(error){return fail(res,error);}
});
router.get("/active",requireRole("ADMIN","STAFF"),async(req,res)=>{
 try{const after=req.query.after===undefined?null:String(req.query.after);if(after&&!isValidUuid(after))throw new ApiError("Invalid tracking cursor.",400,"TRACKING_INVALID");return sendSuccess(res,200,"Active locations",await trackingFeed(req.user!.id,after));}
 catch(error){return fail(res,error);}
});
router.post("/assignments/:id/start",requireRole("TRUCKER"),async(req,res)=>{
 try{requireTracking();assertTrackingTestScope(req.user!.id,id(req));return sendSuccess(res,200,"Location sharing enabled",await liveTracking.begin(actor(req),id(req),req.body?.consent));}catch(error){return fail(res,error);}
});
router.post("/assignments/:id/fixes",requireRole("TRUCKER"),async(req,res)=>{
 try{requireTracking();assertTrackingTestScope(req.user!.id,id(req));const result=await liveTracking.capture(actor(req),id(req),req.body??{});trackingEvents.emit("changed",{assignmentId:id(req)});return sendSuccess(res,200,"Location persisted",result);}catch(error){return fail(res,error);}
});
router.post("/assignments/:id/stop",requireRole("TRUCKER"),async(req,res)=>{
 try{requireTracking();const result=await liveTracking.stop(actor(req),id(req),req.body?.session_id);trackingEvents.emit("changed",{assignmentId:id(req)});return sendSuccess(res,200,"Location sharing stopped",result);}catch(error){return fail(res,error);}
});
export default router;
