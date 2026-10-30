import {tripSelectionText} from "./trip-table-selection";
import {useEffect,useMemo,useRef,useState} from 'react';
import {parseSpreadsheetClipboard} from './ReportSpreadsheetUtils';

import type {TripTableAction} from "./TripTableShared";
export type ContextAction=TripTableAction;

type Change={row:string;column:string;before:string;after:string};
type Options<R>={scope:string;rows:readonly R[];columns:readonly {key:string}[];identity:(row:R)=>string;value:(row:R,column:string)=>string;editable:(row:R,column:string)=>boolean;write:(row:R,column:string,value:string)=>Promise<boolean>;selection:ReadonlySet<string>;focus:{row:string;column:string}|null;enabled:boolean;onError:(message:string)=>void};

/** All mutations pass through each report's existing versioned source editor. */
export function useReportContextActions<R>(options:Options<R>){
  const latest=useRef(options);latest.current=options;
  const replay=useRef(false),running=useRef(false);
  const index=useMemo(()=>({rows:new Map(options.rows.map(row=>[options.identity(row),row])),columns:new Set(options.columns.map(column=>column.key))}),[options.rows,options.columns,options.identity]);
  const indexed=useRef(index);indexed.current=index;
  const [history,setHistory]=useState<{past:Change[];future:Change[]}>({past:[],future:[]});
  const [busy,setBusy]=useState(false);
  useEffect(()=>{setHistory({past:[],future:[]});},[options.scope]);
  const record=(row:string,column:string,before:string,after:string)=>{
    if(replay.current||before===after)return;
    setHistory(current=>({past:[...current.past,{row,column,before,after}].slice(-100),future:[]}));
  };
  const selected=()=>{
    const current=latest.current;
    const result:{row:R;column:string}[]=[];
    for(const key of current.selection){
      const split=key.lastIndexOf("\u0000");if(split<0)continue;
      const row=indexed.current.rows.get(key.slice(0,split)),column=key.slice(split+1);
      if(row&&indexed.current.columns.has(column))result.push({row,column});
    }
    return result;
  };
  const run=async(action:()=>Promise<void>)=>{if(running.current)return;running.current=true;setBusy(true);try{await action();}catch(error){latest.current.onError(error instanceof Error?error.message:'The action could not be completed.');}finally{running.current=false;setBusy(false);}};
  const copy=async()=>{
    const current=latest.current;
    await navigator.clipboard.writeText(tripSelectionText(current.rows,current.columns.map(column=>column.key),current.selection,current.identity,current.value));
  };
  const restore=async(redo:boolean)=>run(async()=>{
    const change=(redo?history.future:history.past).at(-1);if(!change)return;
    const current=latest.current,row=current.rows.find(row=>current.identity(row)===change.row);
    if(!row||current.value(row,change.column)!==(redo?change.before:change.after))throw Error('This cell changed or is no longer loaded. Refresh it before undoing or redoing.');
    replay.current=true;
    try{if(await current.write(row,change.column,redo?change.after:change.before))setHistory(state=>redo?{past:[...state.past,change],future:state.future.slice(0,-1)}:{past:state.past.slice(0,-1),future:[...state.future,change]});}finally{replay.current=false;}
  });
  const cells=selected();
  const canChange=options.enabled&&!busy;
  const actions:ContextAction[]=[
    {label:'Copy',disabled:busy||!cells.length,onClick:()=>run(copy)},
    {label:'Cut',disabled:!canChange||!cells.length||cells.some(cell=>!options.editable(cell.row,cell.column)),onClick:()=>run(async()=>{await copy();for(const cell of selected()){if(!await latest.current.write(cell.row,cell.column,''))break;}})},
    {label:'Paste',disabled:!canChange||!options.focus,onClick:()=>run(async()=>{
      const current=latest.current,focus=current.focus;if(!focus)return;
      const values=parseSpreadsheetClipboard(await navigator.clipboard.readText());
      const start=current.rows.findIndex(row=>current.identity(row)===focus.row),left=current.columns.findIndex(column=>column.key===focus.column);
      if(start<0||left<0)return;
      for(let r=0;r<values.length;r++)for(let c=0;c<values[r].length;c++){
        const original=current.rows[start+r],row=original?indexed.current.rows.get(current.identity(original)):undefined,column=current.columns[left+c];
        if(!row||!column||!latest.current.editable(row,column.key))continue;
        if(!await latest.current.write(row,column.key,values[r][c]))return;
      }
    })},
    {label:'Clear selected comments',disabled:!canChange||!cells.some(cell=>/remarks|comments|notes/i.test(cell.column)&&options.editable(cell.row,cell.column)),onClick:()=>run(async()=>{for(const cell of selected().filter(cell=>/remarks|comments|notes/i.test(cell.column)&&latest.current.editable(cell.row,cell.column)))if(!await latest.current.write(cell.row,cell.column,''))break;})},
    {label:'Bulk edit selected cells…',disabled:!canChange||!cells.some(cell=>options.editable(cell.row,cell.column)),onClick:()=>run(async()=>{
      const available=[...new Set(selected().filter(cell=>latest.current.editable(cell.row,cell.column)).map(cell=>cell.column))];
      const column=available.length===1?available[0]:window.prompt('Choose a selected column: '+available.join(', '),available[0]);
      if(!column||!available.includes(column))return;
      const value=window.prompt('New value for '+column);if(value===null)return;
      for(const cell of selected().filter(cell=>cell.column===column&&latest.current.editable(cell.row,cell.column)))if(!await latest.current.write(cell.row,cell.column,value))break;
    })},
    {label:'Undo',disabled:!canChange||!history.past.length,onClick:()=>restore(false)},
    {label:'Redo',disabled:!canChange||!history.future.length,onClick:()=>restore(true)},
  ];
  const order=["Copy","Cut","Paste","Undo","Redo","Clear selected comments","Bulk edit selected cells…"];
  actions.sort((left,right)=>order.indexOf(left.label)-order.indexOf(right.label));
  return {actions,record,busy};
}
