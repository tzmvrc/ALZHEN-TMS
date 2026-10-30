import type {ReportRow} from "./report.service";
export const MILESTONES=[
 ["warehouse_arrival_at","Arrived at pick-up"],["loading_start_at","Loading started"],["loading_finished_at","Loading finished"],
 ["warehouse_departure_time","Departed pick-up"],["arrival_time","Arrived at destination"],["start_unloading_time","Unloading started"],
 ["finish_unloading_time","Unloading finished"],["departure_time","Departed destination"],
] as const;
export function monitoringValue(value:unknown):string{
 if(value===null||value===undefined||typeof value==="object")return "";
 const text=String(value).trim();
 return /^(?:#(?:REF!|ERROR!|DIV\/0!|VALUE!|N\/A|NAME\?|NUM!|NULL!)|n\/a|null|undefined|—)$/i.test(text)?"":text;
}
export function monitoringField(row:ReportRow,...keys:string[]){for(const key of keys){const value=monitoringValue(row[key]);if(value)return value;}return "";}
export function monitoringValues(rows:readonly ReportRow[],...keys:string[]){return [...new Set(rows.map(row=>monitoringField(row,...keys)).filter(Boolean))];}
export type MonitoringStop={id:string;destination:string;status:string;records:ReportRow[]};
export type MonitoringBucket="ongoing"|"delivered"|"attention"|"unrecorded";
export type MonitoringAssignment={key:string;tripId:string;assignmentId:string;dispatch:string;loadingDate:string;plate:string;driver:string;pickup:string;destinations:string[];stops:MonitoringStop[];records:ReportRow[];progress:string;bucket:MonitoringBucket;latest:{label:string;time:string;destination:string;scope:"trip"|"stop"}|null;remarks:string};
const delivered=(status:string)=>/^(delivered|completed)$/i.test(status);
/** Only exact saved IDs define relationships. Timestamps never imply delivery completion. */
export function monitoringAssignments(rows:readonly ReportRow[]):MonitoringAssignment[]{
 const groups=new Map<string,ReportRow[]>();
 for(const row of rows){const trip=monitoringField(row,"trip_id","_trip_id");if(!trip)continue;const assignment=monitoringField(row,"assignment_id","_assignment_id"),dispatch=monitoringField(row,"dispatch_number");const key=JSON.stringify([trip,assignment||"unassigned",dispatch]);const group=groups.get(key)??[];group.push(row);groups.set(key,group);}
 return [...groups].map(([key,records])=>{
  const first=records[0],tripId=monitoringField(first,"trip_id","_trip_id"),assignmentId=monitoringField(first,"assignment_id","_assignment_id");
  const byStop=new Map<string,ReportRow[]>();
  for(const row of records){const id=monitoringField(row,"trip_stop_id","_trip_stop_id");if(!id)continue;const group=byStop.get(id)??[];group.push(row);byStop.set(id,group);}
  const stops=[...byStop].map(([id,records])=>{const statuses=monitoringValues(records,"delivery_status");return {id,records,destination:monitoringValues(records,"store_name","ship_to","transfer_to_location").join(" / "),status:statuses.length===1?statuses[0]:statuses.length?"Mixed recorded statuses":""};});
  const complete=stops.filter(stop=>delivered(stop.status)).length,unknown=stops.filter(stop=>!stop.status||stop.status==="Mixed recorded statuses").length;
  const attention=stops.some(stop=>/backload|offload|failed|cancel|exception/i.test(stop.status));
  const statuses=[...new Set(stops.map(stop=>stop.status).filter(Boolean))];
  const bucket:MonitoringBucket=attention?"attention":!stops.length||unknown===stops.length?"unrecorded":complete===stops.length?"delivered":"ongoing";
  const progress=!stops.length||unknown===stops.length?"—":`${complete} of ${stops.length} stops delivered${unknown?` · ${unknown} unrecorded`:""}${statuses.length===1&&!delivered(statuses[0])?` · ${statuses[0].replaceAll("_"," ")}`:""}`;
  let latest:MonitoringAssignment["latest"]=null;
  for(const row of records)for(const [field,label] of MILESTONES){const time=monitoringField(row,field);if(!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(time)||!Number.isFinite(Date.parse(time)))continue;if(!latest||Date.parse(time)>Date.parse(latest.time))latest={label,time,scope:["arrival_time","start_unloading_time","finish_unloading_time","departure_time"].includes(field)?"stop":"trip",destination:["arrival_time","start_unloading_time","finish_unloading_time","departure_time"].includes(field)?monitoringField(row,"store_name"):""};}
  return {key,tripId,assignmentId,dispatch:monitoringField(first,"dispatch_number"),loadingDate:monitoringValues(records,"loading_date").join(" / "),plate:monitoringValues(records,"plate_number").join(" / "),driver:monitoringValues(records,"driver_name").join(" / "),pickup:monitoringValues(records,"warehouse_name","ship_from","pick_up_location").join(" / "),destinations:[...new Set(stops.map(stop=>stop.destination).filter(Boolean))],stops,records,progress,bucket,latest,remarks:monitoringValues(records,"remarks").join(" · ")};
 });
}
