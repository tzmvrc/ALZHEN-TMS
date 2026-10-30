import {cloneElement,isValidElement,useMemo,useRef,type ComponentProps,type MouseEvent,type CSSProperties} from 'react';
import {ChevronRight} from 'lucide-react';
import VirtualSpreadsheetRows from './VirtualSpreadsheetRows';
import type {ModernReportState} from './ModernReportControls';

import {reportRowGroups,type Group} from '../../services/modern-report-hierarchy';
type Entry={key:string;index:number;group?:Group;depth:number;count:number;open:boolean;indices?:number[]};
type Node={group:Group;children:Map<string,Node>;indices:number[]};

type SummaryColumn={key:string;title:string;value?:(row:Record<string,unknown>)=>unknown};
type Props=ComponentProps<typeof VirtualSpreadsheetRows>&{state:ModernReportState;rows:readonly Record<string,unknown>[];report:string;columns:readonly SummaryColumn[];cellAppearance?:(index:number,column:string)=>CSSProperties;onGroupSelect?:(event:MouseEvent<HTMLElement>,indices:number[],column:string|null)=>void;isCellSelected?:(indices:number[],column:string)=>boolean;busy?:boolean;selectedKeys?:ReadonlySet<string>;onGroupContextMenu?:(event:MouseEvent<HTMLTableRowElement>,indices:number[],column:string)=>void};
export default function ModernReportRows({state,rows,report,columns,cellAppearance,onGroupSelect,isCellSelected,busy=false,selectedKeys,onGroupContextMenu,...props}:Props){
  const groupAnchor=useRef<string|null>(null);
  const entries=useMemo(()=>{
  if(!state.modern)return [];
    const roots=new Map<string,Node>();
    const seen=new Set<string>();
    rows.forEach((row,index)=>{if(seen.has(props.keys[index]))return;seen.add(props.keys[index]);let children=roots;for(const group of reportRowGroups(row,props.keys[index],report)){let node=children.get(group.id);if(!node){node={group,children:new Map(),indices:[]};children.set(group.id,node);}node.indices.push(index);children=node.children;}});
    const result:Entry[]=[];
    const walk=(nodes:Map<string,Node>,depth:number,path:string)=>{for(const node of nodes.values()){
      const key=path+'/'+node.group.id;
      const open=state.expansion[key]??(state.mode==='lines'||(state.mode==='drs'&&(report!=='dispatch'||node.group.kind!=='dr')));
      result.push({key,index:-1,group:node.group,depth,count:node.indices.length,open,indices:node.indices});
      if(open){if(node.children.size)walk(node.children,depth+1,key);else for(const index of node.indices)result.push({key:props.keys[index],index,depth:depth+1,count:0,open:false});}
    }};
    walk(roots,0,'');return result;
  },[rows,props.keys,report,state.modern,state.mode,state.expansion]);
    const selectGroup=(event:MouseEvent<HTMLElement>,entry:Entry,column:string|null)=>{
    let indices=entry.indices??[];
    if(event.shiftKey&&groupAnchor.current){const start=entries.findIndex(item=>item.key===groupAnchor.current),end=entries.findIndex(item=>item.key===entry.key);if(start>=0&&end>=0)indices=[...new Set(entries.slice(Math.min(start,end),Math.max(start,end)+1).flatMap(item=>item.indices??(item.index>=0?[item.index]:[])))];}
    if(!event.shiftKey)groupAnchor.current=entry.key;
    onGroupSelect?.(event,indices,column);
  };
  if(!state.modern)return <VirtualSpreadsheetRows {...props}/>;
  const focused=props.keys[props.keepAlive??-1];
  return <VirtualSpreadsheetRows {...props} keys={entries.map(entry=>entry.key)} keepAlive={entries.findIndex(entry=>entry.key===focused)} renderRow={index=>{
    const entry=entries[index];
    if(entry.group)return <tr data-group-key={entry.key} style={{height:props.heights?.[entry.key]??56,"--modern-group-row-height":`${props.heights?.[entry.key]??56}px`} as CSSProperties} aria-selected={Boolean(entry.indices?.length&&entry.indices.every(i=>selectedKeys?.has(props.keys[i])))} onContextMenu={event=>onGroupContextMenu?.(event,entry.indices??[],(event.target as HTMLElement).closest<HTMLElement>('[data-group-column-key]')?.dataset.groupColumnKey??columns[0]?.key??'')} data-virtual-index={index} className={`modern-report-group modern-report-group-${entry.group.kind}`}><td className="spreadsheet-gutter"/>{columns.map((column,columnIndex)=>{
      const appearance=cellAppearance?.(entry.indices?.[0]??0,column.key);
      if(columnIndex===0)return <td key={column.key} data-group-column-key={column.key} data-spreadsheet-selected={isCellSelected?.(entry.indices??[],column.key)?"true":undefined} onClick={event=>{if(!(event.target as Element).closest("button"))selectGroup(event,entry,column.key);}} style={appearance} className="modern-report-identity"><div className="modern-report-identity-content" style={{paddingLeft:12+entry.depth*20}}><button className="ml-chevron" type="button" aria-label={`${entry.open?'Collapse':'Expand'} ${entry.group!.label}`} aria-expanded={entry.open} disabled={busy}  onClick={()=>state.setExpansion(current=>({...current,[entry.key]:!entry.open}))}><ChevronRight aria-hidden="true" className={entry.open?'is-open':''}/></button><span className="modern-report-label"><strong title={entry.group!.label}>{entry.group!.label}</strong><small>{entry.count} loaded {entry.count===1?'record':'records'}</small></span></div></td>;
      const values=[...new Set((entry.indices??[]).map(i=>{const raw=column.value?column.value(rows[i]):rows[i][column.key];return raw===null||raw===undefined?'':typeof raw==='object'?'':String(raw);}).filter(Boolean))];
      const first=values[0]||'—',preview=values.slice(1).join(', ');
      return <td key={column.key} data-group-column-key={column.key} data-spreadsheet-selected={isCellSelected?.(entry.indices??[],column.key)?"true":undefined} onClick={event=>{if(!(event.target as Element).closest("button"))selectGroup(event,entry,column.key);}} style={appearance} title={values.join(' · ')}><div className="ml-cell modern-report-summary" style={{alignItems:appearance?.textAlign==="right"?"flex-end":appearance?.textAlign==="center"?"center":"flex-start"}}><span className="ml-cell-value"><span className="ml-cell-primary" title={first}>{first}</span>{values.length>1&&<small className="ml-multi-count" title={preview}>+{values.length-1}</small>}</span>{values.length>1&&<small className="ml-multi-preview" title={preview}>{preview}</small>}</div></td>;
    })}</tr>;
    const row=props.renderRow(entry.index);
    return isValidElement<Record<string,unknown>>(row)?cloneElement(row,{'data-virtual-index':index,'data-hierarchy-depth':entry.depth}):row;
  }}/>;
}
