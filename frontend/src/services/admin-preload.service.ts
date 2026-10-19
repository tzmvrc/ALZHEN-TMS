import {fetchDropdownOptions} from "./dropdown-option.service";
import {searchRelationshipOptions} from "./lookup.service";
import {REPORTS,fetchReportPage,getInitialReportPageOptions,type ReportKey} from "./report.service";
import {fetchTrips} from "./trip.service";
import {runBackgroundPreload} from "./background-preload";
import {preloadOperationsOverview} from "./operations-report.service";
import {preloadTransmittalTracker} from "./transmittal-tracker.service";
import {fetchUsersDirectory} from "./user-management.service";
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
 const page=(key:ReportKey)=>fetchReportPage(key,token,getInitialReportPageOptions(key));
 const references=[()=>fetchDropdownOptions(token),...(["trip-types","warehouses","trucking-companies"] as const).map(kind=>()=>searchRelationshipOptions(token,kind,""))];
 const tasks:Array<()=>Promise<unknown>>=feature==="users"?[()=>fetchUsersDirectory(token,role)]:feature==="reports"?[
  ()=>page(initialReport),...references,
  ...(Object.keys(REPORTS) as ReportKey[]).filter(key=>key!==initialReport).map(key=>()=>page(key)),
  ()=>preloadOperationsOverview(token),()=>preloadTransmittalTracker(token),
 ]:feature==="trips"?[
  ()=>fetchReportPage("dispatch-monitoring",token,{...getInitialReportPageOptions("dispatch-monitoring"),filters:{active_transactions:"true",archive_scope:"active"}}),...references,
 ]:[
  ()=>fetchTrips(token,{limit:100,archiveScope:"active"}),
  ()=>fetchTrips(token,{limit:1,status:"IN_PROGRESS",archiveScope:"active"}),
  ()=>fetchTrips(token,{limit:1,status:"COMPLETED",archiveScope:"active"}),
 ];
 const promise=runBackgroundPreload(tasks,2,()=>generation===current&&session===identity&&activeFeature===feature).then(()=>{if(generation===current&&session===identity)warmed.set(feature,Date.now());}).finally(()=>{if(running?.generation===current)running=null;});
 running={feature,generation:current,promise};await promise;
}
