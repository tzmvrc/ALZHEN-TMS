import {useEffect,useRef,useState} from 'react';
import {motion,useReducedMotion} from 'motion/react';
import {AlertTriangle,ChevronDown,Clock,MapPin,PackageMinus,Warehouse} from 'lucide-react';
import {incidentPresentation,operationalProgress,milestoneTone,type OperationalMilestone,type OperationalPhase} from '../../services/operational-timeline';
import {cleanActivityNote} from '../../services/activity-presentation';
import {milestoneIcon} from '../../services/operational-timeline-icons';
import {phTime} from '../../services/delivery.service';
const STEP_WIDTH=146;
type Selection={truckLabel?:string;selected:string|null;onSelect:(m:OperationalMilestone)=>void};
export default function TripOperationalTimeline({phases,truckLabel,selected,onSelect,onClear,loading,error}:Selection&{phases:OperationalPhase[];onClear:()=>void;loading:boolean;error?:string|null}){
 const latest=phases.filter(p=>p.key!=='incidents').map(p=>({key:p.key,time:Math.max(0,...p.milestones.map(m=>Date.parse(m.time??'')||0))})).sort((a,b)=>b.time-a.time)[0]?.key??'loading';
 return <section className="trip-phase-timeline" aria-label="Operational timeline" onClick={e=>{if(!(e.target as HTMLElement).closest('button,a,input,select,textarea,summary,[role="button"],[data-keep-selection]'))onClear();}}><header><span className="trip-panel-icon"><Clock size={18} aria-hidden/></span><div><h2>Operational timeline</h2><p>Saved milestones, driver updates & reports</p></div></header>{error&&<p role="status" className="trip-empty-note">{error}</p>}{loading&&<p role="status" className="trip-empty-note">Refreshing saved milestones...</p>}<ol>{phases.map(phase=><Phase key={phase.key} phase={phase} truckLabel={truckLabel} selected={selected} onSelect={onSelect} initiallyOpen={phase.key===latest}/>)}</ol><p className="trip-timeline-scope">Philippine time. Shared historical records are labeled Trip-wide.</p></section>;
}
function EvidenceNotice({milestone:m}:{milestone:OperationalMilestone}){
 if(m.pending||!m.time||m.derived)return null;
 const count=(m.event?.attachments.length??0)+m.files.length;
 return count||cleanActivityNote(m.remarks??'')||m.report?.reason?<span className="trip-milestone-notice" aria-label={count?`${count} attachments available`:'Remarks available'}>{count||'•'}</span>:null;
}
function Phase({phase,truckLabel,selected,onSelect,initiallyOpen}:Selection&{phase:OperationalPhase;initiallyOpen:boolean}){
 const [open,setOpen]=useState(initiallyOpen),[visited,setVisited]=useState(initiallyOpen),[view,setView]=useState({left:0,width:600});
 const viewport=useRef<HTMLOListElement>(null),reduced=useReducedMotion(),previous=useRef<Set<string>|null>(null),centered=useRef(''),focusIndex=useRef<number|null>(null);
 const reports=phase.key==='incidents',progress=operationalProgress(phase),recorded=phase.milestones.filter(m=>m.time);
 const latest=phase.milestones[progress.latest],signature=`${latest?.key??'start'}:${latest?.time??''}:${progress.complete}`;
 useEffect(()=>{
  const added=previous.current?phase.milestones.filter(m=>m.time&&!previous.current!.has(m.key)):[];
  previous.current=new Set(phase.milestones.map(m=>m.key));
  if(added.length&&!reports){const fresh=added.sort((a,b)=>Date.parse(b.time!)-Date.parse(a.time!))[0];focusIndex.current=phase.milestones.findIndex(m=>m.key===fresh.key);centered.current='';setOpen(true);setVisited(true);}
 },[phase.milestones,reports]);
 const selectedIndex=phase.milestones.findIndex(m=>m.key===selected);
 useEffect(()=>{if(selectedIndex<0)return;focusIndex.current=selectedIndex;centered.current='';const frame=requestAnimationFrame(()=>{setOpen(true);setVisited(true);});return()=>cancelAnimationFrame(frame);},[selected,selectedIndex]);
 useEffect(()=>{
  if(!open||reports||!viewport.current)return;
  const node=viewport.current,read=()=>setView({left:node.scrollLeft,width:node.clientWidth||600});
  read();const observer=new ResizeObserver(read);observer.observe(node);return()=>observer.disconnect();
 },[open,reports]);
 useEffect(()=>{
  const node=viewport.current;if(!open||reports||!node||centered.current===signature&&focusIndex.current===null)return;
  const target=focusIndex.current??progress.index;focusIndex.current=null;centered.current=signature;
  const max=Math.max(0,phase.milestones.length*STEP_WIDTH-node.clientWidth);
  const left=progress.complete&&target===progress.index?max:Math.max(0,Math.min(max,target*STEP_WIDTH+STEP_WIDTH/2-node.clientWidth/2));
  const frame=requestAnimationFrame(()=>{node.scrollTo({left,behavior:reduced?'auto':'smooth'});setView({left:node.scrollLeft,width:node.clientWidth||600});});
  return()=>cancelAnimationFrame(frame);
 },[open,reports,signature,selected,phase.milestones,reduced,progress.index,progress.complete]);
 const start=Math.max(0,Math.floor(view.left/STEP_WIDTH)-4),end=Math.min(phase.milestones.length,Math.ceil((view.left+view.width)/STEP_WIDTH)+5);
 const Icon=phase.key==='loading'?Warehouse:reports?PackageMinus:MapPin;
 return <li className="trip-phase"><span className="trip-phase-node"><Icon size={17} aria-hidden/></span><article><button type="button" className="trip-phase-toggle" aria-expanded={open} onClick={()=>{setVisited(true);setOpen(v=>!v);}}><span><strong>{phase.title}</strong><small>{phase.subtitle}</small></span><span className="trip-phase-status" data-complete={!reports&&progress.complete||undefined}>{reports?`${phase.milestones.length} report${phase.milestones.length===1?'':'s'}`:progress.complete?'Completed':recorded.length?`${recorded.length} recorded`:'Not recorded'}</span><ChevronDown size={15} className={open?'is-open':''} aria-hidden/></button><div className="trip-phase-content" hidden={!open}>
 {visited&&(reports?<ul className="trip-incident-list">{phase.milestones.map(m=>{const presentation=incidentPresentation(m),EventIcon=milestoneIcon(presentation.tone.toUpperCase());return <li key={m.key} data-category={presentation.tone}><button type="button" aria-pressed={selected===m.key} onClick={()=>onSelect(m)}><span className="trip-milestone-icon"><EventIcon size={22} aria-hidden/><EvidenceNotice milestone={m}/></span><span><strong>{presentation.label}</strong><time>{m.time?phTime(m.time):'Date not recorded'}</time><small>{m.scope==='trip-wide'?'Trip-wide report':truckLabel||'Selected truck'} · {presentation.status||'Status not recorded'}</small>{(presentation.reason||m.remarks)&&<p>{cleanActivityNote(presentation.reason||m.remarks||'')}</p>}</span></button></li>;})}{!phase.milestones.length&&<li className="trip-empty-note">No reports</li>}</ul>:<ol ref={viewport} className="trip-phase-milestones" tabIndex={0} data-keep-selection aria-label={`${phase.title} milestones`} onScroll={e=>setView({left:e.currentTarget.scrollLeft,width:e.currentTarget.clientWidth})}>
 {start>0&&<li aria-hidden style={{flex:`0 0 ${start*STEP_WIDTH}px`}}/>}
 {phase.milestones.slice(start,end).map((m,offset)=>{const index=start+offset,tone=milestoneTone(m),EventIcon=tone==='red'||tone==='amber'?AlertTriangle:milestoneIcon(m.type),connected=Boolean(m.time&&phase.milestones[index+1]?.time);
 return <li key={m.key} data-milestone-key={m.key} data-state={tone==='pending'?(index===progress.index?'active':'pending'):'recorded'} data-tone={tone} aria-posinset={index+1} aria-setsize={phase.milestones.length} style={{flex:`0 0 ${STEP_WIDTH}px`}}>{index<phase.milestones.length-1&&<span className="trip-milestone-link" data-recorded={connected||undefined} aria-hidden><motion.i initial={reduced?false:{scaleX:0}} animate={{scaleX:connected?1:0}} transition={{duration:reduced?0:.5,ease:'easeOut'}}/></span>}<button type="button" aria-pressed={selected===m.key} onClick={()=>onSelect(m)}><span className="trip-milestone-icon"><EventIcon size={23} aria-hidden/><EvidenceNotice milestone={m}/></span><strong>{m.title}</strong><time dateTime={m.time??undefined}>{m.time?phTime(m.time):m.pending?'Not recorded':'Saved report'}</time>{m.podStatus&&<small>{m.podStatus}</small>}{m.type==='STOP_DEPARTURE'&&m.time&&m.completionApproved===false&&<small>POD approval pending</small>}{m.scope==='trip-wide'&&!m.pending&&<small>Trip-wide record</small>}{m.event?.demonstration&&<small className="trip-demo-tag">Demo</small>}</button></li>;
 })}
 {end<phase.milestones.length&&<li aria-hidden style={{flex:`0 0 ${(phase.milestones.length-end)*STEP_WIDTH}px`}}/>}
 </ol>)}
 </div></article></li>;
}
