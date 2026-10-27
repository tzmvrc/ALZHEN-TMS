import {useEffect,useId,useRef,useState} from 'react';
import {ChevronDown,Search,X} from 'lucide-react';

export default function RelatedDrSelect({options,value,onChange,disabled=false}:{options:string[];value:string[];onChange:(value:string[])=>void;disabled?:boolean}){
 const id=useId(),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');
 const choices=[...new Set(options)],selected=[...new Set(value)],searchable=choices.length>6;
 const matches=choices.filter(dr=>dr.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const position=()=>{
  if(!trigger.current||!panel.current)return;
  const rect=trigger.current.getBoundingClientRect(),viewport=window.visualViewport;
  const leftEdge=(viewport?.offsetLeft??0)+8,topEdge=(viewport?.offsetTop??0)+8;
  const rightEdge=leftEdge+(viewport?.width??window.innerWidth)-16,bottomEdge=topEdge+(viewport?.height??window.innerHeight)-16;
  const width=Math.min(rect.width,Math.max(0,rightEdge-leftEdge));
  const below=Math.max(0,bottomEdge-rect.bottom-6),above=Math.max(0,rect.top-topEdge-6);
  const useBelow=below>=240||below>=above,height=Math.min(320,useBelow?below:above);
  const top=useBelow?Math.max(topEdge,rect.bottom+6):Math.max(topEdge,rect.top-height-6);
  Object.assign(panel.current.style,{left:`${Math.max(leftEdge,Math.min(rect.left,rightEdge-width))}px`,top:`${top}px`,width:`${width}px`,maxHeight:`${height}px`});
 };
 useEffect(()=>{
  if(!open)return;
  const update=()=>position();
  update();
  window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
  window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);
  return()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update);};
 },[open]);
 useEffect(()=>{if(disabled)panel.current?.hidePopover();},[disabled]);
 const toggle=(dr:string)=>onChange(selected.includes(dr)?selected.filter(v=>v!==dr):[...selected,dr]);
 return <div className="delivery-dr-select" onKeyDown={event=>{if(open&&event.key==='Escape'){event.preventDefault();event.stopPropagation();panel.current?.hidePopover();trigger.current?.focus();}}}>
  <label id={`${id}-label`} htmlFor={`${id}-trigger`}>Related DR</label>
  <button ref={trigger} id={`${id}-trigger`} type="button" className="delivery-dr-trigger" disabled={disabled} aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-panel`} onClick={()=>{if(open)panel.current?.hidePopover();else{setQuery('');position();panel.current?.showPopover();}}}>
   <span id={`${id}-value`}>{selected.length?`${selected.length} DR${selected.length===1?'':'s'} selected`:'Select related DR(s)'}</span><ChevronDown size={18} aria-hidden/>
  </button>
  {selected.length>0&&<div className="delivery-dr-chips" aria-label="Selected DR numbers">{selected.map(dr=><button key={dr} type="button" disabled={disabled} aria-label={`Remove DR ${dr}`} title={`Remove DR ${dr}`} onClick={()=>toggle(dr)}><span>{dr}</span><X size={14} aria-hidden/></button>)}</div>}
  <div ref={panel} id={`${id}-panel`} popover="auto" role="dialog" aria-labelledby={`${id}-label`} className="delivery-dr-popover" onToggle={event=>setOpen(event.newState==='open')} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();panel.current?.hidePopover();trigger.current?.focus();}}}>
   {searchable&&<div className="delivery-dr-search"><Search size={17} aria-hidden/><input type="text" aria-label="Search DR numbers" placeholder="Search DR numbers..." value={query} onChange={event=>setQuery(event.target.value)}/></div>}
   <div className="delivery-dr-options" role="group" aria-label="Available DR numbers">{matches.map(dr=><label key={dr}><input type="checkbox" checked={selected.includes(dr)} disabled={disabled} onChange={()=>toggle(dr)}/><span>{dr}</span></label>)}{!matches.length&&<p role="status">{choices.length?'No matching DR numbers.':'No DR numbers are recorded for this assignment.'}</p>}</div>
   <button type="button" className="delivery-dr-done" onClick={()=>{panel.current?.hidePopover();trigger.current?.focus();}}>Done</button>
  </div>
 </div>;
}
