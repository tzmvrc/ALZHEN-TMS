import {DELIVERY_STOP_STEPS} from './delivery-workflow';
import type {ConfirmedProgressState} from './operational-progress';
import type {TripEvent,TripRecord} from './trip.service';
import type {OperationsReportData,ReportEvidence,ScopeReport} from './operations-report.service';
import type {DeliveryEvent} from './delivery.service';
import type {assignmentWorkspace} from './trip-workspace-data';
import {deliveryLabel} from './delivery.service';

export type OperationalMilestone={key:string;title:string;type:string;time:string|null;stopId:string|null;location:string;scope:'assignment'|'trip-wide';event?:DeliveryEvent;remarks?:string|null;files:ReportEvidence[];report?:ScopeReport;reportType?:'LOADING'|'UNLOADING'|'BACKLOAD'|'OFFLOAD';reportId?:string;pending?:boolean;activity?:boolean;derived?:boolean;ongoing?:boolean;podStatus?:string;completionApproved?:boolean};
export type OperationalPhase={key:string;title:string;subtitle:string;milestones:OperationalMilestone[]};
const validTime=(v:unknown):string|null=>typeof v==='string'&&Number.isFinite(Date.parse(v))?v:null;
const canonical=(type:string)=>['STORE_ARRIVAL','DELIVERY_ARRIVAL'].includes(type)?'ARRIVED':type;
const text=(v:unknown)=>typeof v==='string'&&v.trim()?v.trim():null;
export function incidentPresentation(m:OperationalMilestone){
 const metadata=(m.event?.delivery_metadata??{}) as Record<string,unknown>,report=(m.report??{}) as unknown as Record<string,unknown>;
 const explicit=text(report.report_type)??text(metadata.report_type)??m.reportType;
 const key=(explicit??m.type).toUpperCase().replace(/[_ ](?:REPORTED|REPORT)$/,'').replaceAll(' ','_');
 const known:Record<string,string>={DEMURRAGE:'Demurrage',OFFLOAD:'Offload',BACKLOAD:'Backload',INCIDENT:'Incident',ACCIDENT:'Accident',BREAKDOWN:'Vehicle breakdown',FAULT_TRIP:'Fault trip',TRAFFIC:'Traffic',DELAY:'Delay'};
 return {label:known[key]??m.title,tone:key==='BACKLOAD'?'backload':key==='OFFLOAD'?'offload':key==='DEMURRAGE'?'demurrage':'incident',reason:text(report.reason)??text(metadata.reason),status:text(report.status)??text(report.checking_status)??text(metadata.report_status)??text(metadata.status),drNumber:text(metadata.dr_number)};
}
/** A title mentioning traffic, incidents or demurrage is never proof that a scoped report exists. */
export function isOperationalReport(m:OperationalMilestone){
 const kind=incidentPresentation(m).tone;
 return ['backload','offload','demurrage'].includes(kind)&&Boolean(m.report||m.reportId);
}
export const isOperationalIncident=(m:OperationalMilestone)=>isOperationalReport(m)||/INCIDENT|ACCIDENT|BREAKDOWN|TRAFFIC|DELAY/.test(m.type)||/traffic|accident|breakdown|road closure|delay/i.test(m.title);
export function milestoneTone(m:OperationalMilestone):'pending'|'blue'|'amber'|'red'|'green'{
 if(m.pending||!m.time)return 'pending';
 if(m.ongoing)return 'blue';
 if(m.type==='STOP_DEPARTURE'&&m.completionApproved===false)return 'amber';
 const title=`${m.type} ${m.title}`;
 if(/accident|breakdown|serious|fault/i.test(title))return 'red';
 if(/traffic|delay|waiting|road closure/i.test(title))return 'amber';
 return m.activity||m.type==='CUSTOM_STATUS'||m.type==='INCIDENT'?'blue':'green';
}
const chronological=(a:OperationalMilestone,b:OperationalMilestone)=>Date.parse(a.time??'')-Date.parse(b.time??'')||(a.type==='IN_TRANSIT'?-1:b.type==='IN_TRANSIT'?1:a.key.localeCompare(b.key));
/** Keep required milestones in sequence and insert custom activity by its saved time. */
export function mergeOperationalActivity(base:OperationalMilestone[],activity:OperationalMilestone[]){
 // Keep required steps in workflow order even when historical timestamps differ.
 const merged=[...base],known=new Set(base.map(m=>m.key));
 for(const m of [...activity].filter(m=>m.time&&!known.has(m.key)).sort(chronological)){
  const next=merged.findIndex(n=>n.time&&Date.parse(n.time)>Date.parse(m.time!));
  if(next>=0)merged.splice(next,0,m);
  else {let last=-1;for(const [i,n]of merged.entries())if(n.time)last=i;merged.splice(last+1,0,m);}
  known.add(m.key);
 }
 return merged;
}
export function operationalPhases({events,assignmentId,trip,data,operations,origin,podStates=[]}:{events:TripEvent[];assignmentId:string;trip:TripRecord;data:ReturnType<typeof assignmentWorkspace>;operations:OperationsReportData|null;origin:string;podStates?:ConfirmedProgressState[]}):OperationalPhase[]{
 const unique=new Map<string,TripEvent>();
 for(const e of events){if(e.trip_id!==String(trip.id))continue;const previous=unique.get(e.id) as (TripEvent&Partial<DeliveryEvent>)|undefined;if(!previous||Number((e as TripEvent&Partial<DeliveryEvent>).delivery_version??0)>=Number(previous.delivery_version??0))unique.set(e.id,e);}
 const rows=[...unique.values()],owned=rows.filter(e=>e.assignment_id===assignmentId||!e.assignment_id&&e.notes?.includes(`[assignment:${assignmentId}]`));
 const reportRows=[...(operations?.backloads??[]),...(operations?.offloads??[]),...(operations?.exception_reports??[])].filter(r=>r.trip_id===String(trip.id));
 const reportFiles=(id:string)=>(operations?.report_evidence??[]).filter(f=>[f.loading_report_id,f.unloading_report_id,f.backload_id,f.offload_id].includes(id));
 const normalize=(e:TripEvent,scope:'assignment'|'trip-wide'='assignment'):OperationalMilestone=>{
  const raw=e as TripEvent&Partial<DeliveryEvent>;
  const event:DeliveryEvent={id:e.id,trip_id:e.trip_id,assignment_id:e.assignment_id??null,trip_stop_id:e.trip_stop_id??null,event_type:e.event_type,event_time:e.event_time,created_at:raw.created_at??'',device_time:raw.device_time??null,recorded_by:e.recorded_by??'',latitude:e.latitude==null?null:Number(e.latitude),longitude:e.longitude==null?null:Number(e.longitude),accuracy_meters:raw.accuracy_meters??null,verification_method:raw.verification_method??'',notes:e.notes??null,delivery_metadata:raw.delivery_metadata??{},delivery_version:raw.delivery_version??0,actor:raw.actor,attachments:raw.attachments??[],demonstration:raw.demonstration||/\[ALZHEN_.*DEMO|SIMULATED|^DEMO_/.test(`${e.notes??''} ${e.event_type}`)};
  const reportId=event.delivery_metadata.report_id,kind=event.delivery_metadata.report_type?.toUpperCase()??event.event_type.match(/^(LOADING|UNLOADING|BACKLOAD|OFFLOAD)_/)?.[1];
  const reportType=kind==='LOADING'||kind==='UNLOADING'||kind==='BACKLOAD'||kind==='OFFLOAD'?kind:undefined;
  return {key:e.id,title:event.delivery_metadata.title||deliveryLabel(e.event_type),type:canonical(e.event_type),time:validTime(e.event_time),stopId:e.trip_stop_id??null,location:data.stops.find(s=>s.id===e.trip_stop_id)?.name??origin,scope,event,remarks:e.notes,files:reportId?reportFiles(reportId):[],report:reportRows.find(r=>r.id===reportId),reportId,reportType};
 };
 const scopedOnly=data.stops.some(s=>s.shared)||rows.some(e=>e.assignment_id&&e.assignment_id!==assignmentId);
 const used=new Set<string>();
 const milestone=(type:string,title:string,stopId:string|null,location:string,fallback?:unknown):OperationalMilestone=>{
  const eligible=owned.concat(rows.filter(e=>!scopedOnly&&!e.assignment_id&&!e.notes?.match(/\[assignment:[0-9a-f-]{36}\]/i)));
  const saved=eligible.filter(e=>canonical(e.event_type)===type&&(e.trip_stop_id??null)===stopId).sort((a,b)=>(type==='POD_SUBMITTED'?1:-1)*(Date.parse(a.event_time)-Date.parse(b.event_time)))[0];
  if(saved){used.add(saved.id);return {...normalize(saved,owned.includes(saved)?'assignment':'trip-wide'),location};}
  const time=scopedOnly?null:validTime(fallback);return {key:`${stopId??'warehouse'}:${type}`,type,title,time,stopId,location,scope:time?'trip-wide':'assignment',files:[],pending:!time};
 };
 const load=operations?.loading[0];
 const loading=[milestone('WAREHOUSE_ARRIVAL','Warehouse arrival',null,origin,load?.warehouse_arrival_at),milestone('LOADING_STARTED','Loading started',null,origin,load?.loading_start_at),milestone('LOADING_FINISHED','Loading finished',null,origin,load?.loading_finished_at),milestone('WAREHOUSE_DEPARTURE','Departed warehouse',null,origin,trip.departure_from_warehouse_at)];
 if(load&&reportFiles(load.id).length)loading.push({key:`loading-report:${load.id}`,title:'Loading report evidence',type:'LOADING_REPORT',time:null,stopId:null,location:origin,scope:'trip-wide',files:reportFiles(load.id),reportType:'LOADING',reportId:load.id});
 const phases:OperationalPhase[]=[{key:'loading',title:'Loading',subtitle:origin,milestones:loading}];
 for(const stop of data.stops){
  const state=podStates.find(s=>s.assignment_id===assignmentId&&s.trip_stop_id===stop.id);
  const steps=[milestone('IN_TRANSIT','On the way',stop.id,stop.name),...DELIVERY_STOP_STEPS.map(step=>{
   const saved=milestone(step.type,step.title,stop.id,stop.name,step.type==='POD_SUBMITTED'?state?.pod_submitted_at:stop[step.field as keyof typeof stop]);
   // A projection is already scoped to this assignment, including legacy receipt records.
   if(step.type==='POD_SUBMITTED'&&!saved.time&&validTime(state?.pod_submitted_at)){saved.time=validTime(state?.pod_submitted_at);saved.scope='assignment';saved.pending=false;}
   return {...saved,title:step.title,...(step.type==='POD_SUBMITTED'?{podStatus:state?.pod_approved?'Approved':saved.time?(state?.pod_status==='REJECTED'?'Rejected - upload replacement':'Uploaded - approval pending'):'Not uploaded'}:{}),...(step.type==='STOP_DEPARTURE'?{completionApproved:state?.pod_approved??false}: {})};
  })];
  // This visual stage is activated by a confirmed departure; it is not a second event.
  const previous=phases.at(-1)!,source=previous.milestones.find(m=>m.type===(previous.key==='loading'?'WAREHOUSE_DEPARTURE':'STOP_DEPARTURE')&&m.time);
  if(!steps[0].time&&source){steps[0]={...steps[0],time:source.time,pending:false,derived:true,ongoing:!steps[1].time,scope:source.scope,event:source.event,remarks:'Activated by saved departure.'};}
  const report=operations?.unloading.find(r=>r.trip_stop_id===stop.id),remarks=operations?.stops.find(s=>s.id===stop.id)?.remarks;
  if(report&&(remarks||reportFiles(report.id).length))steps.push({key:`unloading-report:${report.id}`,title:'Unloading report',type:'UNLOADING_REPORT',time:null,stopId:stop.id,location:stop.name,scope:'trip-wide',remarks,files:reportFiles(report.id),reportType:'UNLOADING',reportId:report.id});
  phases.push({key:stop.id,title:`Delivery stop ${stop.sequence}`,subtitle:stop.name,milestones:steps});
 }
 const reports:OperationalMilestone[]=[],activity:OperationalMilestone[]=[];
 for(const e of rows.filter(e=>!used.has(e.id)&&!['PARTIAL_UNLOAD','ASSIGNMENT_COMPLETED','POD_SUBMITTED'].includes(e.event_type))){
  const shared=!e.assignment_id&&!e.notes?.match(/\[assignment:[0-9a-f-]{36}\]/i);
  if(!shared&&!owned.some(row=>row.id===e.id))continue;
  const m=normalize(e,shared?'trip-wide':'assignment');
  if(isOperationalReport(m))reports.push(m);else activity.push({...m,activity:true});
 }
 for(const [kind,records] of [['BACKLOAD',operations?.backloads??[]],['OFFLOAD',operations?.offloads??[]]] as const){
  for(const report of records){
   if(report.trip_id!==String(trip.id)||rows.some(e=>e.delivery_metadata?.report_id===report.id))continue;
   reports.push({key:`${kind}:${report.id}`,title:kind==='BACKLOAD'?'Backload reported':'Offload reported',type:`${kind}_REPORTED`,time:validTime(report.reported_at??(report as ScopeReport&{created_at?:string}).created_at),stopId:report.trip_stop_id,location:data.stops.find(s=>s.id===report.trip_stop_id)?.name??'Trip-wide report',scope:'trip-wide',remarks:report.comments,files:reportFiles(report.id),report,reportType:kind,reportId:report.id});
  }
 }
 for(const report of operations?.exception_reports??[]){
  if(report.trip_id!==String(trip.id)||rows.some(e=>e.delivery_metadata?.report_id===report.id))continue;
  const m:OperationalMilestone={key:`${report.source}:${report.id}`,title:report.report_type==='DEMURRAGE'?'Demurrage':report.incident_category||'Incident recorded',type:report.report_type,time:validTime(report.reported_at??report.created_at),stopId:report.trip_stop_id,location:data.stops.find(s=>s.id===report.trip_stop_id)?.name??origin,scope:'trip-wide',remarks:report.comments,files:[],report,reportId:report.id,activity:report.report_type!=='DEMURRAGE'};
  (isOperationalReport(m)?reports:activity).push(m);
 }
 const departure=loading.find(m=>m.type==='WAREHOUSE_DEPARTURE')?.time;
 const buckets=new Map<string,OperationalMilestone[]>();
 for(const m of activity){
  const at=Date.parse(m.time??''),delivery=phases.slice(1);
  const anyStopStarted=delivery.some(p=>p.milestones.some(s=>s.time&&Date.parse(s.time)<=at));
  let phase=phases[0];
  if(delivery.length&&((departure&&at>Date.parse(departure))||!departure&&anyStopStarted)){
   phase=delivery.find(p=>p.key===m.stopId)??delivery.find(p=>{const end=p.milestones.find(s=>s.type==='STOP_DEPARTURE'&&s.time);return !end?.time||at<=Date.parse(end.time);})??delivery.at(-1)!;
  }
  buckets.set(phase.key,[...(buckets.get(phase.key)??[]),m]);
 }
 for(const phase of phases)phase.milestones=mergeOperationalActivity(phase.milestones,buckets.get(phase.key)??[]);
 phases.push({key:'incidents',title:'Offload / Backload / Demurrage',subtitle:'Saved operational reports',milestones:[...new Map(reports.map(m=>[m.reportId??m.key,m])).values()].sort((a,b)=>-chronological(a,b))});
 return phases;
}

export function operationalProgress(phase:OperationalPhase){
 const required=phase.milestones.filter(m=>['WAREHOUSE_ARRIVAL','LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE'].includes(m.type)||DELIVERY_STOP_STEPS.some(step=>step.type===m.type));
 const complete=required.length>0&&required.every(m=>!!m.time&&(m.type!=='STOP_DEPARTURE'||m.completionApproved!==false))&&phase.milestones.some(m=>/^(WAREHOUSE_DEPARTURE|STOP_DEPARTURE)$/.test(m.type)&&m.time&&m.scope==='assignment');
 let latest=-1;
 for(const [i,m] of phase.milestones.entries())if(m.time&&(latest<0||Date.parse(m.time)>=Date.parse(phase.milestones[latest].time!)))latest=i;
 return {complete,index:complete?Math.max(0,phase.milestones.length-1):Math.max(0,latest),latest};
}
