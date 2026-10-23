import { useEffect, useRef } from "react";
import { WORKSPACE_SHEETS } from "../../services/trips-workspace";
import { fetchReportPage,getInitialReportPageOptions } from "../../services/report.service";
import { preloadTransmittalTracker } from "../../services/transmittal-tracker.service";
import { refreshSharedDesign } from "../../services/shared-table-design";
import { refreshSharedWidths } from "../../services/shared-table-widths";

/** Only one inactive snapshot at a time, after the foreground sheet is usable.
 * Never sweep history or enumerate relationship catalogs in a background queue. */
export function useWorkspacePreload(token:string|null,active:string,ready=true){
 const current=useRef({active,ready});current.current={active,ready};
 useEffect(()=>{
  if(!token)return;
  const controller=new AbortController();
  const pause=(ms:number)=>new Promise<void>(resolve=>{
   const done=()=>{clearTimeout(timer);controller.signal.removeEventListener("abort",done);resolve();};
   const timer=setTimeout(done,ms);controller.signal.addEventListener("abort",done,{once:true});
  });
  void(async()=>{
   await pause(2000);
   const jobs=[...WORKSPACE_SHEETS.map(sheet=>({key:sheet.key,run:async()=>{
    const options=getInitialReportPageOptions(sheet.report);
    await fetchReportPage(sheet.report,token,{...options,limit:sheet.key==="trips"?200:50,filters:sheet.key==="trips"?{...options.filters,source_lines:"true"}:options.filters});
    if(controller.signal.aborted)return;
    await refreshSharedDesign(token,sheet.key==="trips"?"trips":`report:${sheet.report}`);
    if(!controller.signal.aborted)await refreshSharedWidths(token,sheet.key==="trips"?"trips":`report:${sheet.report}`);
   }})),{key:"transmittal",run:async()=>{
    await preloadTransmittalTracker(token);
    if(controller.signal.aborted)return;
    await refreshSharedDesign(token,"transmittal-tracker");
    if(!controller.signal.aborted)await refreshSharedWidths(token,"transmittal-tracker");
   }}];
   for(const job of jobs){
    while(!controller.signal.aborted&&!current.current.ready)await pause(250);
    if(controller.signal.aborted)return;
    if(job.key!==current.current.active){try{await job.run();}catch{/* Active sheets own actionable failures. */}}
    await pause(500);
   }
  })();
  return()=>controller.abort();
 },[token]);
}
