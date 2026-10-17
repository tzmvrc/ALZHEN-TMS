import {useEffect,useState} from "react";
import {activeTracking,trackingAvailable} from "../../services/tracking-api.service";
import {subscribeCollaborationEvents} from "../../services/collaboration.service";
import {invalidateApiCache} from "../../services/api.service";
import type {TrackedAssignment} from "./TrackedTruckLayer";
export function useTrackedAssignments(token:string|null,tripId?:string|null){
 const [snapshot,setSnapshot]=useState<{token:string;tripId?:string|null;rows:TrackedAssignment[]}|null>(null);
 useEffect(()=>{
  if(!token)return;let current=true,busy=false,enabled=false,queued=false;
  const refresh=async()=>{
   if(!current||busy||!enabled)return;busy=true;
   try{
    let after:string|null=null;const rows:TrackedAssignment[]=[];
    do{const page=await activeTracking(token,after);rows.push(...page.rows);after=page.next;}while(after&&rows.length<500&&current);
    if(current)setSnapshot({token,tripId,rows:tripId?rows.filter(r=>r.tripId===tripId):rows});
   }catch{/* Keep valid markers on transient network errors. */}finally{busy=false;if(queued&&current){queued=false;void refresh();}}
  };
  void trackingAvailable(token).then(value=>{enabled=value;void refresh();}).catch(()=>{});
  const timer=setInterval(()=>void refresh(),15000);
  const topics=["trips","trip_stops","trip_truck_assignments","drivers","trucks","customer_stores"];
  const unsubscribe=subscribeCollaborationEvents(e=>{if(e.kind==="tracking"||e.kind==="connected"||(e.kind==="commit"&&topics.includes(e.commit.source))||(e.kind==="signal"&&topics.includes(e.topic))){invalidateApiCache("/tracking/active");if(busy)queued=true;else void refresh();}});
  return()=>{current=false;clearInterval(timer);unsubscribe();};
 },[token,tripId]);
 return snapshot?.token===token&&snapshot?.tripId===tripId?snapshot.rows:[];
}
