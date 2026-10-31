import type {MouseEvent} from 'react';
import {Truck} from 'lucide-react';
import type {OperationalMilestone} from '../../services/operational-timeline';
import TripOperationalInspector from './TripOperationalInspector';
import type {OperationsReportData} from '../../services/operations-report.service';
export type ConvoyDetail={assignmentId:string;plate:string;driver:string;milestone:OperationalMilestone};
export default function ConvoyEventDetails({rows,activeAssignmentId,onSelectAssignment,onBack,onReviewed,onOpenReport,operations}:{rows:ConvoyDetail[];activeAssignmentId:string;onSelectAssignment:(id:string)=>void;onBack:()=>void;onReviewed:()=>void;onOpenReport:(kind:'operations'|'receipts')=>void;operations:OperationsReportData|null}){
 // Select from the section's passive content, never from its nested controls.
 const selectSection=(event:MouseEvent<HTMLElement>,id:string)=>{
  if((event.target as HTMLElement).closest('button,a,input,textarea,select,summary,details,[role="button"],[role="dialog"]')||window.getSelection()?.toString())return;
  onSelectAssignment(id);
 };
 return <section className="trip-convoy-event-details" aria-label="Convoy Event Details"><header><h2>Event Details</h2><button type="button" onClick={onBack}>Back to route</button></header><div className="trip-convoy-event-columns" data-count={rows.length}>{rows.map(row=><section key={row.assignmentId} className="trip-convoy-event-column" data-assignment-id={row.assignmentId} data-active={activeAssignmentId===row.assignmentId} onClick={event=>selectSection(event,row.assignmentId)} aria-label={`${row.plate} event details`}><h3 className="trip-convoy-truck-heading"><button type="button" className="trip-convoy-truck-select" aria-pressed={activeAssignmentId===row.assignmentId} onClick={()=>onSelectAssignment(row.assignmentId)} aria-label={`Show ${row.plate} operational timeline`}><Truck size={18} aria-hidden/><span>{row.plate} <small>{row.driver}</small></span></button></h3><TripOperationalInspector embedded key={`${row.assignmentId}:${row.milestone.key}:${row.milestone.event?.id??'pending'}:${row.milestone.event?.delivery_version??0}`} {...row} onBack={onBack} onReviewed={onReviewed} onOpenReport={onOpenReport} operations={operations}/></section>)}</div></section>;
}
