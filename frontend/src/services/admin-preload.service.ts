import type { ReportKey } from "./report.service";
import { runBackgroundPreload } from "./background-preload";
// Resource modules are loaded only after a feature is actually requested.
export type AdminFeature="home"|"trips"|"reports"|"users";
let generation=0,session="",activeFeature:AdminFeature|undefined;
const warmed=new Map<AdminFeature,number>();
let running:{feature:AdminFeature;generation:number;promise:Promise<void>}|null=null;
export function cancelAdminPreload(){generation++;session="";activeFeature=undefined;warmed.clear();running=null;}
/** Login establishes isolation only. Mounted tabs warm their own bounded data. */
export async function preloadAdminPageData(token:string,role:string,feature?:AdminFeature,initialReport:ReportKey="combined"){
 if(!token||!["ADMIN","STAFF"].includes(role)){cancelAdminPreload();return;}
 const identity=`${role}:${token}`;
 if(identity!==session){cancelAdminPreload();session=identity;}
 if(!feature){if(activeFeature){generation++;activeFeature=undefined;running=null;}return;}
 if(feature!==activeFeature){generation++;activeFeature=feature;}
 if(running?.feature===feature&&running.generation===generation)return running.promise;
 if(Date.now()-(warmed.get(feature)??0)<30000)return;
 const current=++generation;
 const page=async(key:ReportKey)=>{const {fetchReportPage,getInitialReportPageOptions}=await import("./report.service");return fetchReportPage(key,token,getInitialReportPageOptions(key));};
 const fetchDropdownOptions=async(token:string)=>(await import("./dropdown-option.service")).fetchDropdownOptions(token);
 const searchRelationshipOptions=async(token:string,kind:"trip-types"|"warehouses"|"trucking-companies",query:string)=>(await import("./lookup.service")).searchRelationshipOptions(token,kind,query);
 const fetchTrips=async(token:string,options:Parameters<typeof import("./trip.service").fetchTrips>[1])=>(await import("./trip.service")).fetchTrips(token,options);
 const fetchUsersDirectory=async(token:string,role:string)=>(await import("./user-workspace.service")).loadUserSheet(token,role==="ADMIN"?"staff":"truckers");
 const references=[()=>fetchDropdownOptions(token),...(["trip-types","warehouses","trucking-companies"] as const).map(kind=>()=>searchRelationshipOptions(token,kind,""))];
 // Report workspaces already schedule their own bounded, cancelable warmups.
 // Keep this queue to useful reference data rather than competing page sweeps.
 const tasks:Array<()=>Promise<unknown>>=feature==="users"?[()=>fetchUsersDirectory(token,role)]:feature==="reports"?[()=>page(initialReport),...references]:feature==="trips"?references:[
  ()=>fetchTrips(token,{limit:100,archiveScope:"active"}),
  ()=>fetchTrips(token,{limit:1,status:"IN_PROGRESS",archiveScope:"active"}),
  ()=>fetchTrips(token,{limit:1,status:"COMPLETED",archiveScope:"active"}),
 ];
 const promise=runBackgroundPreload(tasks,2,()=>generation===current&&session===identity&&activeFeature===feature).then(()=>{if(generation===current&&session===identity)warmed.set(feature,Date.now());}).finally(()=>{if(running?.generation===current)running=null;});
 running={feature,generation:current,promise};await promise;
}
