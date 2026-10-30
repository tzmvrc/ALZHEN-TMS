import {useState} from 'react';
import {useTripsTableAppearance} from './TripsTableAppearance';
import TableViewers from './TableViewers';
import ModernColumnLegend from './ModernColumnLegend';
import './MasterListView.css';

export function useModernReportControls(enabled=true){
  const appearance=useTripsTableAppearance();
  const [editMode,setEditMode]=useState(false);
  const [category,setCategory]=useState('all');
  const [mode,setMode]=useState<'collapse'|'drs'|'lines'>('collapse');
  const [expansion,setExpansion]=useState<Record<string,boolean>>({});
  const modern=enabled&&appearance==='modern';
  return {category,setCategory,modern,canEdit:!enabled||editMode,editMode,setEditMode,mode,setMode,expansion,setExpansion};
}
export type ModernReportState=ReturnType<typeof useModernReportControls>;
export function ModernReportEditSwitch({state,busy=false}:{state:ModernReportState;busy?:boolean}){
  return <label className="ml-edit-switch"><span>Edit mode</span><input type="checkbox" checked={state.editMode} disabled={busy} onChange={event=>state.setEditMode(event.target.checked)}/><span className="ml-switch-track"/></label>;
}
export default function ModernReportControls({state,table,canEdit,busy=false,lines=true,columns,onSelect,showLegend=true,showViewers=true,inline=false}:{state:ModernReportState;table:string;canEdit:boolean;busy?:boolean;lines?:boolean;columns?:readonly {key:string;title:string}[];onSelect?:(key:string)=>void;showLegend?:boolean;showViewers?:boolean;inline?:boolean}){
  const controls=<div className={`modern-report-controls${inline?" inline-report-controls":""}`}>{showViewers&&<TableViewers table={table} toolbar/>}{state.modern&&<div className="ml-segments" role="group" aria-label="Expand report rows">{(['collapse','drs',...(lines?['lines'] as const:[])] as const).map(mode=><button key={mode} type="button" aria-pressed={state.mode===mode} disabled={busy} onClick={()=>{state.setExpansion({});state.setMode(mode);}}>{mode==='collapse'?'Collapse':mode==='drs'?(lines?'DRs':'Expand'):'Lines'}</button>)}</div>}{canEdit&&<ModernReportEditSwitch state={state} busy={busy}/>}</div>;
  if(inline)return controls;
  return <div className="modern-report-toolbar">{showLegend&&columns&&<ModernColumnLegend columns={columns} active={state.category} disabled={busy} onChange={state.setCategory} onSelect={onSelect}/>} {controls}</div>;
}
