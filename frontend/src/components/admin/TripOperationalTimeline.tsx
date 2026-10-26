import {useEffect,useRef,useState} from 'react';
import {useSpreadsheetInfiniteScroll} from './useSpreadsheetInfiniteScroll';
import {motion,useReducedMotion} from 'motion/react';
import {AlertTriangle,Camera,ChevronDown,Clock,ClockAlert,FileText,MapPin,Package,PackageCheck,PackageMinus,Truck,Undo2,Warehouse,type LucideIcon} from 'lucide-react';
import {incidentPresentation,isOperationalIncident,type OperationalMilestone,type OperationalPhase} from '../../services/operational-timeline';
import {cleanActivityNote} from '../../services/activity-presentation';
import {phTime} from '../../services/delivery.service';

export function milestoneIcon(type:string):LucideIcon{
 if(/BACKLOAD/.test(type))return Undo2;
 if(/OFFLOAD/.test(type))return PackageMinus;
 if(/DEMURRAGE/.test(type))return ClockAlert;
 if(/INCIDENT|ACCIDENT|TRAFFIC|BREAKDOWN|DEMURRAGE|FAULT|DELAY/.test(type))return AlertTriangle;
 if(/WAREHOUSE_ARRIVAL/.test(type))return Warehouse;
 if(/ARRIV/.test(type))return MapPin;
 if(/POD|PHOTO/.test(type))return Camera;
 if(/UNLOADING_FINISHED|COMPLETED/.test(type))return PackageCheck;
 if(/LOAD/.test(type))return Package;
 if(/REPORT/.test(type))return FileText;
 return Truck;
}
export const milestoneIncident=isOperationalIncident;
type Selection={truckLabel?:string;selected:string|null;onSelect:(milestone:OperationalMilestone)=>void};
export default function TripOperationalTimeline({phases,truckLabel,selected,onSelect,onClear,loading,error}:Selection&{phases:OperationalPhase[];onClear:()=>void;loading:boolean;error?:string|null}){
 return <section className="trip-phase-timeline" aria-label="Operational timeline" onClick={e=>{if(!(e.target as HTMLElement).closest('button,a,input,select,textarea,summary,[role="button"],[data-keep-selection]'))onClear();}}><header><span className="trip-panel-icon"><Clock size={18} aria-hidden="true"/></span><div><h2>Operational timeline</h2><p>Milestones, reports & supporting evidence</p></div></header>{error&&<p role="status" className="trip-empty-note">{error}</p>}{loading&&<p role="status" className="trip-empty-note">Refreshing saved milestones...</p>}<ol>{phases.map((phase,index)=><Phase key={phase.key} phase={phase} truckLabel={truckLabel} selected={selected} onSelect={onSelect} initiallyOpen={index===0}/>)}</ol><p className="trip-timeline-scope">Philippine time. Shared historical records are labeled Trip-wide.</p></section>;
}
function EvidenceNotice({milestone}:{milestone:OperationalMilestone}){
 const count=(milestone.event?.attachments.length??0)+milestone.files.length;
 const hasInfo=Boolean(count||cleanActivityNote(milestone.remarks??'')||milestone.report?.reason);
 return hasInfo?<span className="trip-milestone-notice" aria-label={count?`${count} attachments available`:'Supporting information available'}>{count||'•'}</span>:null;
}
function Phase({phase,truckLabel,selected,onSelect,initiallyOpen}:Selection&{phase:OperationalPhase;initiallyOpen:boolean}){
 const [open,setOpen]=useState(initiallyOpen),[visited,setVisited]=useState(initiallyOpen),[visibleCount,setVisibleCount]=useState(60),viewport=useRef<HTMLOListElement>(null),reduced=useReducedMotion();
 const containsSelected=phase.milestones.some(m=>m.key===selected);
 useEffect(()=>{if(containsSelected){setOpen(true);setVisited(true);setVisibleCount(n=>Math.max(n,phase.milestones.findIndex(m=>m.key===selected)+1));}},[selected,containsSelected]);
 const reports=phase.key==='incidents';
 useSpreadsheetInfiniteScroll(viewport,{axis:'horizontal',enabled:open&&!reports,hasMore:visibleCount<phase.milestones.length,onLoadMore:()=>setVisibleCount(n=>n+40),revision:visibleCount});
 const recorded=phase.milestones.filter(m=>m.time),complete=phase.milestones.some(m=>/WAREHOUSE_DEPARTURE|STOP_DEPARTURE|ASSIGNMENT_COMPLETED/.test(m.type)&&m.time&&m.scope==='assignment'),incident=reports||phase.milestones.some(milestoneIncident);
 const activeIndex=!complete&&recorded.length?phase.milestones.findLastIndex(m=>Boolean(m.time))+1:-1;
 const Icon=phase.key==='loading'?Warehouse:reports?AlertTriangle:phase.key==='additional'?Clock:MapPin;
 return <li className="trip-phase" data-incident={incident||undefined}><span className="trip-phase-node"><Icon size={17} aria-hidden="true"/></span><article><button type="button" className="trip-phase-toggle" aria-expanded={open} onClick={()=>{setVisited(true);setOpen(v=>!v);}}><span><strong>{phase.title}</strong><small>{phase.subtitle}</small></span><span className="trip-phase-status" data-complete={!reports&&complete||undefined}>{reports?(phase.milestones.length?`${phase.milestones.length} report${phase.milestones.length===1?'':'s'}`:'No reports'):complete?'Completed':recorded.length?`${recorded.length} recorded`:'Not recorded'}</span><ChevronDown size={15} className={open?'is-open':''} aria-hidden="true"/></button><div className="trip-phase-content" hidden={!open}>
 {visited&&(reports?<ul className="trip-incident-list">{phase.milestones.map(m=>{const presentation=incidentPresentation(m),EventIcon=milestoneIcon(presentation.tone==='incident'?m.type:presentation.tone.toUpperCase());return <li key={m.key} data-category={presentation.tone}><button type="button" aria-pressed={selected===m.key} onClick={()=>onSelect(m)}><span className="trip-milestone-icon"><EventIcon size={22} aria-hidden="true"/><EvidenceNotice milestone={m}/></span><span><strong>{presentation.label}</strong><time>{m.time?phTime(m.time):'Date not recorded'}</time><small>{m.scope==='trip-wide'?'Trip-wide report':truckLabel||'Selected truck'}{m.event?.demonstration?' / Demo':''}</small>{(presentation.reason||m.remarks)&&<p>{cleanActivityNote(presentation.reason||m.remarks||'')}</p>}</span></button></li>;})}{!phase.milestones.length&&<li className="trip-empty-note">No reports</li>}</ul>:<ol ref={viewport} className="trip-phase-milestones" aria-label={`${phase.title} milestones`}>{phase.milestones.slice(0,visibleCount).map((milestone,index)=>{
 const EventIcon=milestoneIcon(milestone.type),issue=milestoneIncident(milestone),connected=Boolean(milestone.time&&phase.milestones[index+1]?.time);
 return <li key={milestone.key} data-state={issue?'exception':milestone.time?'recorded':index===activeIndex&&milestone.pending?'active':'pending'}>{index<Math.min(visibleCount,phase.milestones.length)-1&&<span className="trip-milestone-link" data-recorded={connected||undefined} aria-hidden="true"><motion.i initial={reduced?false:{scaleX:0}} animate={{scaleX:connected?1:0}} transition={{duration:reduced?0:.65,ease:'easeOut'}}/></span>}<button type="button" aria-pressed={selected===milestone.key} onClick={()=>onSelect(milestone)}><span className="trip-milestone-icon"><EventIcon size={24} aria-hidden="true"/><EvidenceNotice milestone={milestone}/></span><strong>{milestone.title}</strong><time dateTime={milestone.time??undefined}>{milestone.time?phTime(milestone.time):milestone.pending?'Not recorded':'Saved report'}</time>{milestone.scope==='trip-wide'&&!milestone.pending&&<small>Trip-wide record</small>}{milestone.event?.demonstration&&<small className="trip-demo-tag">Demo</small>}</button></li>;
 })}{visibleCount<phase.milestones.length&&<li className="trip-empty-note" role="status">Scroll for more milestones</li>}</ol>)}
 </div></article></li>;
}
