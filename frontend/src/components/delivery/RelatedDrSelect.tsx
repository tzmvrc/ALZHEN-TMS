import {useEffect,useId,useRef,useState} from 'react';
import {ChevronDown,Search,X} from 'lucide-react';

export default function RelatedDrSelect({options,value,onChange,disabled=false,label='Related DR',placeholder='Select related DR(s)',itemName='DR',searchLabel='Search DR numbers',emptyLabel='No DR numbers are recorded for this assignment.',alwaysSearch=false,placement='auto',selectAll=false,quantities,onQuantityChange,serialCounts,optionLabels}:{options:string[];value:string[];onChange:(value:string[])=>void;disabled?:boolean;label?:string;placeholder?:string;itemName?:string;searchLabel?:string;emptyLabel?:string;alwaysSearch?:boolean;placement?:'auto'|'below';selectAll?:boolean;quantities?:Record<string,string>;serialCounts?:Record<string,number>;optionLabels?:Record<string,string>;onQuantityChange?:(model:string,value:string)=>void}){
 const id=useId(),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');
 const choices=[...new Set(options)],selected=[...new Set(value)].filter(item=>!optionLabels||choices.includes(item)),searchable=alwaysSearch||choices.length>6;
 const optionLabel=(key:string)=>optionLabels?.[key]??key;
 const below=placement==='below';
 const close=()=>{if(below)setOpen(false);else panel.current?.hidePopover();};
 const matches=choices.filter(dr=>optionLabel(dr).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const position=()=>{
  if(!trigger.current||!panel.current)return;
  if(below){panel.current.style.maxHeight=`${Math.min(300,Math.max(100,(window.visualViewport?.height??innerHeight)*.42))}px`;return;}
  const rect=trigger.current.getBoundingClientRect(),viewport=window.visualViewport;
  const leftEdge=(viewport?.offsetLeft??0)+8,topEdge=(viewport?.offsetTop??0)+8;
  const rightEdge=leftEdge+(viewport?.width??window.innerWidth)-16,bottomEdge=topEdge+(viewport?.height??window.innerHeight)-16;
  const width=Math.min(rect.width,Math.max(0,rightEdge-leftEdge));
  const spaceBelow=Math.max(0,bottomEdge-rect.bottom-6),above=Math.max(0,rect.top-topEdge-6);
  const useBelow=spaceBelow>=240||spaceBelow>=above,height=Math.min(320,useBelow?spaceBelow:above);
  const top=useBelow?Math.max(topEdge,rect.bottom+6):Math.max(topEdge,rect.top-height-6);
  Object.assign(panel.current.style,{left:`${Math.max(leftEdge,Math.min(rect.left,rightEdge-width))}px`,top:`${top}px`,width:`${width}px`,maxHeight:`${height}px`});
 };
 const revealBelow=()=>{
  if(!below||!panel.current||!trigger.current)return;
  const dialog=trigger.current.closest('dialog');if(!dialog)return;
  const viewport=window.visualViewport,bounds=panel.current.getBoundingClientRect(),frame=dialog.getBoundingClientRect(),footer=dialog.querySelector('.delivery-sheet-footer')?.getBoundingClientRect();
  const bottom=Math.min((viewport?.offsetTop??0)+(viewport?.height??innerHeight),frame.bottom,footer?.top??frame.bottom)-12;
  const delta=bounds.bottom-bottom;
  if(delta>0)dialog.scrollTop+=delta;
 };
 useEffect(()=>{
  if(!open)return;
  const update=()=>position();
  const resize=()=>{position();revealBelow();};
  update();
  const frame=below?requestAnimationFrame(revealBelow):undefined;
  const observer=below?new ResizeObserver(()=>{position();revealBelow();}):undefined;
  if(observer&&panel.current){observer.observe(panel.current);const dialog=trigger.current?.closest('dialog');if(dialog){observer.observe(dialog);const footer=dialog.querySelector('.delivery-sheet-footer');if(footer)observer.observe(footer);}}
  window.addEventListener('resize',resize);window.addEventListener('scroll',update,true);
  window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',update);
  return()=>{observer?.disconnect();if(frame!==undefined)cancelAnimationFrame(frame);window.removeEventListener('resize',resize);window.removeEventListener('scroll',update,true);window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',update);};
 },[open,below]);
 useEffect(()=>{if(disabled){setOpen(false);if(!below)panel.current?.hidePopover();}},[disabled,below]);
 const toggle=(dr:string)=>onChange(selected.includes(dr)?selected.filter(v=>v!==dr):[...selected,dr]);
 return <div className={`delivery-dr-select${below?' delivery-dr-select--below':''}`} onKeyDown={event=>{if(open&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close();trigger.current?.focus();}}}>
  <label id={`${id}-label`} htmlFor={`${id}-trigger`}>{label}</label>
  <button ref={trigger} id={`${id}-trigger`} type="button" className="delivery-dr-trigger" disabled={disabled} aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-panel`} onClick={()=>{if(open)close();else{setQuery('');if(below)setOpen(true);else{position();panel.current?.showPopover();}}}}>
   <span id={`${id}-value`}>{selected.length?`${selected.length} ${itemName}${selected.length===1?'':'s'} selected`:placeholder}</span><ChevronDown size={18} aria-hidden/>
  </button>

  <div ref={panel} id={`${id}-panel`} popover={below?undefined:'auto'} hidden={below&&!open} role="dialog" aria-labelledby={`${id}-label`} className="delivery-dr-popover" onToggle={event=>{if(!below)setOpen(event.newState==='open');}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();trigger.current?.focus();}}}>
   {searchable&&<div className="delivery-dr-search"><Search size={17} aria-hidden/><input type="text" aria-label={searchLabel} placeholder={`${searchLabel}...`} value={query} onChange={event=>setQuery(event.target.value)}/></div>}
   {selectAll&&choices.length>0&&<label className="delivery-dr-all"><input type="checkbox" aria-label="Select All" ref={node=>{if(node)node.indeterminate=selected.length>0&&choices.some(choice=>!selected.includes(choice));}} checked={choices.every(choice=>selected.includes(choice))} disabled={disabled} onChange={event=>onChange(event.target.checked?choices:[])}/><span>Select All</span></label>}
   <div className="delivery-dr-options" role="group" aria-label={`Available ${itemName}s`}>{matches.map(dr=>onQuantityChange?<div className="delivery-model-row" key={dr}><label><input type="checkbox" aria-label={optionLabel(dr)} checked={selected.includes(dr)} disabled={disabled} onChange={()=>toggle(dr)}/><span>{optionLabel(dr)}{serialCounts?.[dr]!==undefined&&<small className="delivery-model-serial-count">{serialCounts[dr]} unique serials</small>}</span></label>{selected.includes(dr)&&<label className="delivery-model-quantity"><span>Qty:</span><input type="text" inputMode="numeric" pattern="[0-9]*" aria-label={`Quantity for ${optionLabel(dr)}`} value={quantities?.[dr]??'1'} disabled={disabled} onChange={event=>{const value=event.target.value;if(/^\d*$/.test(value)&&Number.isSafeInteger(Number(value)))onQuantityChange(dr,value);}} onBlur={()=>{if(quantities?.[dr]==='')onQuantityChange(dr,'0');}}/></label>}</div>:<label key={dr}><input type="checkbox" checked={selected.includes(dr)} disabled={disabled} onChange={()=>toggle(dr)}/><span>{optionLabel(dr)}</span></label>)}{!matches.length&&<p role="status">{choices.length?`No matching ${itemName}s.`:emptyLabel}</p>}</div>
   <button type="button" className="delivery-dr-done" onClick={()=>{close();trigger.current?.focus();}}>Done</button>
  </div>
  {selected.length>0&&<div className="delivery-dr-chips" aria-label={`Selected ${itemName}s`}>{selected.map(dr=><button key={dr} type="button" disabled={disabled} aria-label={`Remove ${itemName} ${optionLabel(dr)}`} title={`Remove ${itemName} ${optionLabel(dr)}`} onClick={()=>toggle(dr)}><span>{optionLabel(dr)}</span><X size={14} aria-hidden/></button>)}</div>}
 </div>;
}
