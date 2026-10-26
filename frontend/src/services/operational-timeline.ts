import type {TripEvent,TripRecord} from './trip.service';
import type {OperationsReportData,ReportEvidence,ScopeReport} from './operations-report.service';
import type {DeliveryEvent} from './delivery.service';
import type {assignmentWorkspace} from './trip-workspace-data';
import {deliveryLabel} from './delivery.service';

export type OperationalMilestone={key:string;title:string;type:string;time:string|null;stopId:string|null;location:string;scope:'assignment'|'trip-wide';event?:DeliveryEvent;remarks?:string|null;files:ReportEvidence[];report?:ScopeReport;reportType?:'LOADING'|'UNLOADING'|'BACKLOAD'|'OFFLOAD';reportId?:string;pending?:boolean};
export type OperationalPhase={key:string;title:string;subtitle:string;milestones:OperationalMilestone[]};
const validTime=(value:unknown):string|null=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:null;
const canonical=(type:string)=>['STORE_ARRIVAL','DELIVERY_ARRIVAL'].includes(type)?'ARRIVED':type;
const savedText=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():null;
/** Categorize only saved type/title fields, never remarks, trip status or guessed causes. */
export function incidentPresentation(m:OperationalMilestone){
 const metadata=(m.event?.delivery_metadata??{}) as Record<string,unknown>;
 const report=(m.report??{}) as unknown as Record<string,unknown>;
 const explicit=savedText(report.report_type)??savedText(metadata.report_type)??m.reportType;
 const key=(explicit??m.type).toUpperCase().replace(/[_ ](?:REPORTED|REPORT)$/,'').replaceAll(' ','_');
 const known:Record<string,string>={DEMURRAGE:'Demurrage',OFFLOAD:'Offload',BACKLOAD:'Backload',INCIDENT:'Incident',ACCIDENT:'Accident',BREAKDOWN:'Vehicle breakdown',FAULT_TRIP:'Fault trip',TRAFFIC:'Traffic',DELAY:'Delay'};
 const label=known[key]??(explicit?explicit.replaceAll('_',' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()):m.title);
 return {label,tone:key==='BACKLOAD'?'backload':key==='OFFLOAD'?'offload':key==='DEMURRAGE'?'demurrage':'incident',reason:savedText(report.reason)??savedText(metadata.reason),status:savedText(report.status)??savedText(metadata.report_status)??savedText(metadata.status),drNumber:savedText(metadata.dr_number)};
}
export const isOperationalIncident=(m:OperationalMilestone)=>/INCIDENT|BACKLOAD|OFFLOAD|DEMURRAGE|FAULT|ACCIDENT|BREAKDOWN|TRAFFIC|DELAY/.test(`${m.type} ${m.reportType??''} ${m.event?.delivery_metadata.report_type??''}`.toUpperCase())||/traffic|accident|breakdown|road closure|demurrage|fault trip|delay/i.test(m.title);

export function operationalPhases({events,assignmentId,trip,data,operations,origin}:{events:TripEvent[];assignmentId:string;trip:TripRecord;data:ReturnType<typeof assignmentWorkspace>;operations:OperationsReportData|null;origin:string}):OperationalPhase[]{
 const owned=events.filter(e=>e.assignment_id===assignmentId||!e.assignment_id&&e.notes?.includes(`[assignment:${assignmentId}]`));
 const normalize=(e:TripEvent,location:string):OperationalMilestone=>{
  const raw=e as TripEvent&Partial<DeliveryEvent>;
  const event:DeliveryEvent={id:e.id,trip_id:e.trip_id,assignment_id:e.assignment_id??null,trip_stop_id:e.trip_stop_id??null,event_type:e.event_type,event_time:e.event_time,created_at:raw.created_at??'',device_time:raw.device_time??null,recorded_by:e.recorded_by??'',latitude:e.latitude==null?null:Number(e.latitude),longitude:e.longitude==null?null:Number(e.longitude),accuracy_meters:raw.accuracy_meters??null,verification_method:raw.verification_method??'',notes:e.notes??null,delivery_metadata:raw.delivery_metadata??{},delivery_version:raw.delivery_version??0,actor:raw.actor,attachments:raw.attachments??[],demonstration:raw.demonstration||/\[ALZHEN_.*DEMO|SIMULATED|^DEMO_/.test(`${e.notes??''} ${e.event_type}`)};
  const reportId=event.delivery_metadata.report_id,kind=event.delivery_metadata.report_type?.toUpperCase()??event.event_type.match(/^(LOADING|UNLOADING|BACKLOAD|OFFLOAD)_/)?.[1];
  const reportType=kind==='LOADING'||kind==='UNLOADING'||kind==='BACKLOAD'||kind==='OFFLOAD'?kind:undefined;
  const files=reportId?(operations?.report_evidence??[]).filter(file=>[file.loading_report_id,file.unloading_report_id,file.backload_id,file.offload_id].includes(reportId)):[];
  const report=reportId?[...(operations?.backloads??[]),...(operations?.offloads??[])].find(row=>row.id===reportId):undefined;
  return {key:e.id,title:event.delivery_metadata.title||deliveryLabel(e.event_type),type:canonical(e.event_type),time:validTime(e.event_time),stopId:e.trip_stop_id??null,location,scope:'assignment',event,remarks:e.notes,files,report,reportId,reportType};
 };
 const used=new Set<string>();
 const milestone=(type:string,title:string,stopId:string|null,location:string,fallback?:unknown):OperationalMilestone=>{
  const saved=owned.filter(e=>canonical(e.event_type)===type&&(e.trip_stop_id??null)===stopId).sort((a,b)=>Date.parse(b.event_time)-Date.parse(a.event_time))[0];
  if(saved){used.add(saved.id);return normalize(saved,location);}
  const time=validTime(fallback);
  return {key:`${stopId??'warehouse'}:${type}`,type,title,time,stopId,location,scope:time?'trip-wide':'assignment',files:[],pending:!time};
 };
 const reportFiles=(id:string)=>(operations?.report_evidence??[]).filter(file=>[file.loading_report_id,file.unloading_report_id,file.backload_id,file.offload_id].includes(id));
 const load=operations?.loading[0];
 const loading=[milestone('WAREHOUSE_ARRIVAL','Warehouse arrival',null,origin,load?.warehouse_arrival_at),milestone('LOADING_STARTED','Loading started',null,origin,load?.loading_start_at),milestone('LOADING_FINISHED','Loading finished',null,origin,load?.loading_finished_at),milestone('WAREHOUSE_DEPARTURE','Departed warehouse',null,origin,trip.departure_from_warehouse_at)];
 if(load&&reportFiles(load.id).length)loading.push({key:`loading-report:${load.id}`,title:'Loading report evidence',type:'LOADING_REPORT',time:null,stopId:null,location:origin,scope:'trip-wide',files:reportFiles(load.id),reportType:'LOADING',reportId:load.id});
 const phases:OperationalPhase[]=[{key:'loading',title:'Loading',subtitle:origin,milestones:loading}];
 for(const stop of data.stops){
  const location=stop.name,stopId=stop.id;
  const steps=[milestone('IN_TRANSIT','On the way',stopId,location),milestone('ARRIVED','Destination arrival',stopId,location,stop.arrival_time),milestone('UNLOADING_STARTED','Unloading started',stopId,location,stop.start_unloading_time)];
  for(const event of owned.filter(e=>e.trip_stop_id===stopId&&e.event_type==='PARTIAL_UNLOAD').sort((a,b)=>Date.parse(a.event_time)-Date.parse(b.event_time))){used.add(event.id);steps.push(normalize(event,location));}
  steps.push(milestone('UNLOADING_FINISHED','Unloading finished',stopId,location,stop.finish_unloading_time),milestone('STOP_DEPARTURE','Departed destination',stopId,location,stop.departure_time));
  const report=operations?.unloading.find(r=>r.trip_stop_id===stopId);
  const remarks=operations?.stops.find(s=>s.id===stopId)?.remarks;
  if(report&&(remarks||reportFiles(report.id).length))steps.push({key:`unloading-report:${report.id}`,title:'Unloading report',type:'UNLOADING_REPORT',time:null,stopId,location,scope:'trip-wide',remarks,files:reportFiles(report.id),reportType:'UNLOADING',reportId:report.id});
  phases.push({key:stopId,title:`Delivery stop ${stop.sequence}`,subtitle:location,milestones:steps});
 }
 const additional=owned.filter(e=>!used.has(e.id)).map(e=>normalize(e,data.stops.find(s=>s.id===e.trip_stop_id)?.name??origin));
 const isIncident=isOperationalIncident;
 const reports:OperationalMilestone[]=additional.filter(isIncident);
 for(const event of events.filter(e=>!e.assignment_id&&!e.notes?.match(/\[assignment:[0-9a-f-]{36}\]/i))){
  const item=normalize(event,data.stops.find(s=>s.id===event.trip_stop_id)?.name??origin);
  if(isIncident(item))reports.push({...item,scope:'trip-wide'});
 }
 for(const [kind,records] of [['BACKLOAD',operations?.backloads??[]],['OFFLOAD',operations?.offloads??[]]] as const){
  for(const report of records){
   if(events.some(e=>(e as TripEvent&Partial<DeliveryEvent>).delivery_metadata?.report_id===report.id))continue;
   // No assignment is inferred for historical shared reports.
   reports.push({key:`${kind}:${report.id}`,title:kind==='BACKLOAD'?'Backload reported':'Offload reported',type:`${kind}_REPORTED`,time:validTime(report.reported_at??(report as ScopeReport&{created_at?:string}).created_at),stopId:report.trip_stop_id,location:data.stops.find(s=>s.id===report.trip_stop_id)?.name??'Trip-wide report',scope:'trip-wide',remarks:report.comments,files:reportFiles(report.id),report,reportType:kind,reportId:report.id});
  }
 }
 for(const report of operations?.exception_reports??[]){
  if(events.some(e=>e.delivery_metadata?.report_id===report.id))continue;
  const stop=data.stops.find(s=>s.id===report.trip_stop_id);
  // Legacy exception tables contain no assignment FK; never attribute them to a guessed truck.
  reports.push({key:`${report.source}:${report.id}`,title:report.report_type==='DEMURRAGE'?'Demurrage':'Incident',type:report.report_type,time:validTime(report.reported_at??report.created_at),stopId:report.trip_stop_id,location:stop?.name??'None',scope:'trip-wide',remarks:report.comments,files:[],report});
 }
 const other=additional.filter(item=>!isIncident(item));
 if(other.length)phases.push({key:'additional',title:'Additional activity',subtitle:'Saved updates for this assignment',milestones:other.sort((a,b)=>Date.parse(a.time??'')-Date.parse(b.time??''))});
 phases.push({key:'incidents',title:'Incident Reports',subtitle:'Saved exceptions and supporting reports',milestones:[...new Map(reports.map(item=>[item.key,item])).values()].sort((a,b)=>Date.parse(b.time??'')-Date.parse(a.time??''))});
 return phases;
}
