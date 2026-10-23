import {useMemo,useState,type ReactNode} from "react";
import {ArrowDown,ArrowUp,ArrowUpDown,Search} from "lucide-react";
import {tableUi} from "../dashboardStyles";
import {REPORT_GRID_BODY_CELL_CLASS,REPORT_GRID_HEADER_CELL_CLASS} from "../ReportSpreadsheetUtils";
import {SpreadsheetRowNumber,SPREADSHEET_PANEL_CLASS} from "../SpreadsheetPresentation";
import SpreadsheetRowSelectionHeader from "../SpreadsheetRowSelectionHeader";

export type BillingColumn<R>={key:string;label:string;value:(row:R)=>string|number;render?:(row:R)=>ReactNode;numeric?:boolean;minWidth?:number};
/** A finite, local sample table; no operational grid services or API hooks. */
export default function BillingTable<R extends {id:string}>({name,rows,columns,filter,filterValue="",onFilter,selected,onSelect,onOpen,actions,caption}: {
 name:string;rows:R[];columns:BillingColumn<R>[];filter?:{label:string;options:string[]};filterValue?:string;onFilter?:(value:string)=>void;
 selected?:Set<string>;onSelect?:(ids:Set<string>)=>void;onOpen?:(row:R)=>void;actions?:ReactNode;caption?:string;
}){
 const [query,setQuery]=useState(""),[sort,setSort]=useState<{key:string;direction:1|-1}|null>(null),[localSelection,setLocalSelection]=useState(new Set<string>());
 const selection=selected??localSelection,choose=onSelect??setLocalSelection;
 const visible=useMemo(()=>{
  const needle=query.trim().toLocaleLowerCase();
  const filtered=rows.filter(row=>!needle||columns.some(column=>String(column.value(row)).toLocaleLowerCase().includes(needle)));
  const column=columns.find(column=>column.key===sort?.key);
  return column&&sort?[...filtered].sort((a,b)=>{const left=column.value(a),right=column.value(b);return sort.direction*(typeof left==="number"&&typeof right==="number"?left-right:String(left).localeCompare(String(right),"en",{numeric:true}));}):filtered;
 },[rows,columns,query,sort]);
 const currentSelected=selected?new Set(selected):new Set(rows.filter(row=>selection.has(row.id)).map(row=>row.id));
 const checked=visible.length>0&&visible.every(row=>selection.has(row.id));
 const toggle=(id:string)=>{const next=new Set(currentSelected);if(next.has(id))next.delete(id);else next.add(id);choose(next);};
 return <section className={`${SPREADSHEET_PANEL_CLASS} min-w-0`} aria-label={name}>
  <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white p-2">
   <label className="relative min-w-44 flex-1 sm:max-w-80"><Search aria-hidden className="pointer-events-none absolute left-3 top-2 h-4 w-4 text-slate-400"/><input className={`${tableUi.search} !h-8 !rounded-md !border-slate-200 !text-xs !shadow-none`} aria-label={`Search ${name}`} placeholder={`Search ${name.toLowerCase()}…`} value={query} onChange={event=>setQuery(event.target.value)}/></label>
   {filter&&<select aria-label={filter.label} value={filterValue} onChange={event=>onFilter?.(event.target.value)} className="h-8 max-w-56 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"><option value="">All {filter.label.toLowerCase()}</option>{filter.options.map(option=><option key={option}>{option}</option>)}</select>}
   <div className="ml-auto flex flex-wrap items-center gap-2">{currentSelected.size>0&&<><span className="text-xs text-blue-700">{currentSelected.size} selected</span><button type="button" className="text-xs text-slate-500 underline" onClick={()=>choose(new Set())}>Clear</button></>}{actions}</div>
  </div>
  <div tabIndex={0} aria-label={`${name} spreadsheet, scroll horizontally for more columns`} className="spreadsheet-viewport max-h-[58vh] min-h-52 w-full overflow-auto overscroll-contain bg-white focus-visible:outline-blue-500">
   <table className="spreadsheet-grid w-full border-collapse text-left"><caption className="sr-only">{name}. Sort with column headers; select rows using the row-number gutter.</caption>
    <thead><tr><th scope="col" className={`${REPORT_GRID_HEADER_CELL_CLASS} spreadsheet-gutter !left-0 !z-40 !w-9 !min-w-9 !px-1 text-center`}><SpreadsheetRowSelectionHeader active={currentSelected.size>0} checked={checked} partial={currentSelected.size>0&&!checked} disabled={!visible.length} label={`Select all matching ${name.toLowerCase()}`} onChange={next=>{const ids=new Set(currentSelected);visible.forEach(row=>next?ids.add(row.id):ids.delete(row.id));choose(ids);}}/></th>
     {columns.map(column=><th key={column.key} scope="col" aria-sort={sort?.key===column.key?sort.direction===1?"ascending":"descending":"none"} className={`${REPORT_GRID_HEADER_CELL_CLASS} !normal-case !tracking-normal ${column.numeric?"text-right":""}`} style={{minWidth:column.minWidth??120}}><button type="button" className={`flex w-full items-center gap-2 py-1 ${column.numeric?"justify-end":""}`} onClick={()=>setSort(current=>({key:column.key,direction:current?.key===column.key&&current.direction===1?-1:1}))}>{column.label}{sort?.key===column.key?sort.direction===1?<ArrowUp className="h-3 w-3 shrink-0"/>:<ArrowDown className="h-3 w-3 shrink-0"/>:<ArrowUpDown className="h-3 w-3 shrink-0 text-slate-300"/>}</button></th>)}
    </tr></thead>
    <tbody>{visible.map((row,index)=><tr key={row.id} tabIndex={onOpen?0:undefined} onKeyDown={event=>{if(event.target===event.currentTarget&&event.key==="Enter")onOpen?.(row);}} onClick={onOpen?()=>onOpen(row):undefined} className={`${selection.has(row.id)?"bg-blue-50":"hover:bg-slate-50"} ${onOpen?"cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-500":""}`}>
     <td className="spreadsheet-gutter sticky left-0 z-10 border-b border-r border-slate-200 bg-slate-50 px-1 text-center" onClick={event=>event.stopPropagation()}>{currentSelected.size?<input type="checkbox" aria-label={`Select ${name} row ${index+1}`} checked={selection.has(row.id)} className="h-3.5 w-3.5 accent-blue-600" onChange={()=>toggle(row.id)}/>:<button type="button" className="w-full py-1" aria-label={`Select ${name} row ${index+1}`} onClick={()=>toggle(row.id)}><SpreadsheetRowNumber value={index+1}/></button>}</td>
     {columns.map(column=><td key={column.key} className={`${REPORT_GRID_BODY_CELL_CLASS} !px-3 !py-2 ${column.numeric?"whitespace-nowrap text-right tabular-nums":""}`}>{column.render?column.render(row):column.value(row)}</td>)}
    </tr>)}</tbody>
   </table>
  </div>
  <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500"><span>{visible.length} of {rows.length} sample records</span><span>{caption??"Click a header to sort · Drag the scrollbar to view more columns"}</span></footer>
 </section>;
}
