import { supabaseAdmin,supabaseAuth } from "../config/supabase.js";
import { assertActiveTruckerSession,assertAdminStaffSession } from "./app-session.service.js";
export type SocketActor={id:string;role:string;name:string;expiresAt:number};
export async function authenticateCollaboration(token:unknown,sessionId:unknown):Promise<SocketActor>{
 if(typeof token!=="string"||token.length>10000||typeof sessionId!=="string"||sessionId.length>128)throw Error("Authentication required");
 const {data,error}=await supabaseAuth.auth.getUser(token);
 if(error||!data.user)throw Error("Invalid or expired authentication");
 const profile=await supabaseAdmin.from("profiles").select("id,role,first_name,last_name").eq("id",data.user.id).maybeSingle();
 if(profile.error||!profile.data||!["ADMIN","STAFF","TRUCKER"].includes(profile.data.role))throw Error("Account unavailable");
 const role=profile.data.role;
 // Expiry is used only after Supabase has validated the JWT signature/issuer.
 const expiry=JSON.parse(Buffer.from(token.split(".")[1]??"","base64url").toString()).exp;
 if(!Number.isFinite(expiry)||expiry*1000<=Date.now())throw Error("Authentication expired");
 let expiresAt=expiry*1000;
 if(role==="TRUCKER")await assertActiveTruckerSession(data.user.id,sessionId);
 else expiresAt=Math.min(expiresAt,Date.parse((await assertAdminStaffSession(data.user.id,role,sessionId)).expiresAt));
 return {id:data.user.id,role,name:[profile.data.first_name,profile.data.last_name].filter(Boolean).join(" ").slice(0,100)||"Team member",expiresAt};
}
export async function canJoinTrip(actor:SocketActor,tripId:string){
 const trip=await supabaseAdmin.from("trips").select("id").eq("id",tripId).maybeSingle();
 if(trip.error||!trip.data)return false;
 if(actor.role!=="TRUCKER")return true;
 const driver=await supabaseAdmin.from("drivers").select("id").eq("profile_id",actor.id).maybeSingle();
 if(driver.error||!driver.data)return false;
 const assignment=await supabaseAdmin.from("trip_truck_assignments").select("id").eq("trip_id",tripId).eq("driver_id",driver.data.id).is("unassigned_at",null).limit(1);
 return !assignment.error&&Boolean(assignment.data?.length);
}
