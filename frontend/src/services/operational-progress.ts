import {DELIVERY_STOP_STEPS} from './delivery-workflow';
import type {TripEvent,TripAssignmentRecord,TripChildRecord} from './trip.service';
import type {Convoy} from './trip-workspace-data';
export type PodCompletion={assignment_id:string|null;trip_stop_id:string|null;approved:boolean};
/** Equal units per applicable warehouse/stop milestone. Transit/custom events add no units. */
export function confirmedOperationalProgress(assignments:TripAssignmentRecord[],stops:TripChildRecord[],events:TripEvent[],responsibilities:Convoy['responsibilities']=[],_pods:PodCompletion[]=[],selected?:string){
 const results=assignments.filter(a=>!a.unassigned_at&&(!selected||a.id===selected)).map(a=>{
  const own=new Set(events.filter(e=>e.assignment_id===a.id&&Number.isFinite(Date.parse(e.event_time))).map(e=>`${e.event_type}:${e.trip_stop_id??''}`)),has=(type:string,stop:string|null=null)=>own.has(`${type}:${stop??''}`);
  const required=stops.filter(s=>!s.archived_at&&(a.stop_scope==='ALL'||responsibilities.some(r=>r.assignment_id===a.id&&r.trip_stop_id===s.id)));
  if(!required.length&&!own.size)return {done:0,total:0};
  let done=['WAREHOUSE_ARRIVAL','LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE'].filter(t=>has(t)).length,total=4;
  for(const stop of required){total+=DELIVERY_STOP_STEPS.length;for(const step of DELIVERY_STOP_STEPS)if(has(step.type,String(stop.id)))done++;}
  return {done,total};
 });
 const pendingStops=selected?0:stops.filter(s=>!s.archived_at&&!assignments.some(a=>!a.unassigned_at&&(a.stop_scope==='ALL'||responsibilities.some(r=>r.assignment_id===a.id&&r.trip_stop_id===s.id)))).length;
 const done=results.reduce((n,r)=>n+r.done,0),total=results.reduce((n,r)=>n+r.total,0)+pendingStops*DELIVERY_STOP_STEPS.length;
 return {done,total,percent:total?Math.floor(done/total*100):0};
}

/** One authoritative state projection is shared by Workspace and Visual View. */
export type ConfirmedProgressState={assignment_id:string;trip_stop_id:string;warehouse_arrival_at?:string|null;loading_start_at?:string|null;loading_finished_at?:string|null;warehouse_departure_time?:string|null;arrival_time?:string|null;start_unloading_time?:string|null;finish_unloading_time?:string|null;departure_time?:string|null;pod_submitted_at?:string|null;pod_status?:string|null;pod_approved:boolean;assignment_completed?:boolean};
export function confirmedStateProgress(states:ConfirmedProgressState[],unassignedStops=0){
 const byAssignment=new Map<string,Map<string,ConfirmedProgressState>>();for(const state of states){const stops=byAssignment.get(state.assignment_id)??new Map();stops.set(state.trip_stop_id,state);byAssignment.set(state.assignment_id,stops);}
 let done=0,total=unassignedStops*DELIVERY_STOP_STEPS.length;const saved=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
 for(const stops of byAssignment.values()){const rows=[...stops.values()];total+=4+rows.length*DELIVERY_STOP_STEPS.length;for(const key of ['warehouse_arrival_at','loading_start_at','loading_finished_at','warehouse_departure_time'] as const)if(rows.some(s=>saved(s[key])))done++;for(const s of rows)for(const step of DELIVERY_STOP_STEPS)if(saved(s[step.field]))done++;}
 return {done,total,percent:total?Math.floor(done/total*100):0};
}
