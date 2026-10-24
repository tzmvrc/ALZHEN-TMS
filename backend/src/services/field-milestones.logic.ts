type Row=Record<string,unknown>;
export type FieldMilestone={id:string;trip_id:string;trip_stop_id:string|null;event_type:string;event_time:string};
/** Legacy submissions lack an assignment FK. Bind only a unique matching historical interval. */
export function submissionAssignment(row:{trip_id:string;driver_id:string;updated_at:string},assignments:Row[]):string|null{
  const time=Date.parse(row.updated_at);
  if(!Number.isFinite(time))return null;
  const candidates=assignments.filter(a=>a.trip_id===row.trip_id&&a.driver_id===row.driver_id&&typeof a.assigned_at==="string"&&Date.parse(a.assigned_at)<=time&&(!a.unassigned_at||typeof a.unassigned_at==="string"&&time<Date.parse(a.unassigned_at)));
  return candidates.length===1&&typeof candidates[0].id==="string"?candidates[0].id:null;
}
export const fieldSources=[
  {table:"loading_reports",select:"id,trip_id,warehouse_arrival_at,loading_start_at,loading_finished_at",times:{warehouse_arrival_at:"WAREHOUSE_ARRIVAL",loading_start_at:"LOADING_STARTED",loading_finished_at:"LOADING_FINISHED"}},
  {table:"trip_stops",select:"id,trip_id,arrival_time,start_unloading_time,finish_unloading_time,departure_time",times:{arrival_time:"DELIVERY_ARRIVAL",start_unloading_time:"UNLOADING_STARTED",finish_unloading_time:"UNLOADING_FINISHED",departure_time:"STOP_DEPARTURE"}},
  {table:"backloads",select:"id,trip_id,trip_stop_id,submitted_at,created_at",times:{}},
  {table:"offloads",select:"id,trip_id,trip_stop_id,reported_at,submitted_at,created_at",times:{}},
  {table:"incidents",select:"id,trip_id,trip_stop_id,created_at",times:{}},
] as const;

/** Preserve actual saved timestamps; never substitute "now" for an unavailable event time. */
export function fieldMilestones(table:string,rows:Row[]):FieldMilestone[]{
  const source=fieldSources.find(source=>source.table===table);
  if(!source)return [];
  return rows.flatMap(row=>{
    if(typeof row.id!=="string"||typeof row.trip_id!=="string")return [];
    const id=row.id,tripId=row.trip_id,stopId=table==="trip_stops"?id:typeof row.trip_stop_id==="string"?row.trip_stop_id:null;
    const times:Record<string,unknown>=Object.keys(source.times).length?Object.fromEntries(Object.entries(source.times).map(([field,event])=>[event,row[field]])):{[table==="backloads"?"BACKLOAD_REPORTED":table==="offloads"?"OFFLOAD_REPORTED":"INCIDENT_REPORTED"]:row.reported_at??row.submitted_at??row.created_at};
    return Object.entries(times).flatMap(([event_type,time])=>typeof time==="string"&&Number.isFinite(Date.parse(time))?[{id:`${table}:${id}:${event_type}`,trip_id:tripId,trip_stop_id:stopId,event_type,event_time:time}]:[]);
  });
}

