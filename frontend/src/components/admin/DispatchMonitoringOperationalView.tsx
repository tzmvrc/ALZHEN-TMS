import TableViewers from "./TableViewers";
import {TripTableLoadingRow} from "./TripTableLoading";
import {useOperationalCellFormatting} from "./OperationalCellFormatting";
import {useRegisterTopbarAction} from "./topbarActions";
import {readTripRowHeight} from "./tripRowHeight";
import ColumnFinder from "./ColumnFinder";
import {TopbarSearchRegistration} from "./topbarSearch";
import {SpreadsheetBottomControlsContext} from "./SpreadsheetBottomControlsContext";
import {useSpreadsheetViewport} from "./SpreadsheetPresentation";
import {useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from "react";
import {createPortal} from "react-dom";
import {Columns3,SlidersHorizontal,X,Pencil,RefreshCw,ArrowUpRight,Paintbrush} from "lucide-react";
import {useAuth} from "../../context/AuthContext";
import {fetchReportTripRows,type ReportPageOptions,type ReportRow} from "../../services/report.service";
import {MILESTONES,monitoringAssignments,monitoringField,monitoringValue,monitoringValues,type MonitoringAssignment,type MonitoringBucket} from "../../services/dispatch-monitoring-model";
import {loadMonitoringWindow} from "../../services/dispatch-monitoring-operational.service";
import {fetchTripDetail,updateTripRecord,invalidateTripCache,type TripDetail} from "../../services/trip.service";
import {subscribeToAdminRealtime,REPORT_REALTIME_TABLES} from "../../services/realtime.service";
import {useDeferredRealtimeRefresh} from "./useDeferredRealtimeRefresh";
import "./DispatchMonitoringOperationalView.css";

const COLUMNS=[{key:"dispatch",title:"Dispatch number",width:170},{key:"loading",title:"Loading date",width:110},{key:"route",title:"Pick-up → destination",width:230},{key:"truck",title:"Plate number and driver",width:225},{key:"progress",title:"Delivery progress",width:185},{key:"milestone",title:"Latest milestone and time",width:250},{key:"remarks",title:"Remarks",width:200}] as const;
type ColumnKey=typeof COLUMNS[number]["key"];
const STATUS:["all"|MonitoringBucket,string][]=[["all","All"],["ongoing","Ongoing"],["delivered","Delivered"],["attention","Needs attention"],["unrecorded","Unrecorded"]];
const EDIT_FIELDS=[{key:"loading_date",label:"Loading date",type:"date"},{key:"authorization_letter",label:"Authorization letter",type:"text"},{key:"page_no",label:"Page number",type:"number"},{key:"subcon_rate_manual",label:"Subcontractor rate (manual)",type:"number"},{key:"remarks",label:"Trip remarks",type:"text"}] as const;
function stamp(value:unknown,dateOnly=false){const text=monitoringValue(value);if(!text)return "—";if(dateOnly&&/^\d{4}-\d{2}-\d{2}$/.test(text)){const date=new Date(text+"T00:00:00+08:00");return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Manila",day:"2-digit",month:"short",year:"numeric"}).format(date);}const date=new Date(text);if(!Number.isFinite(date.getTime()))return text;return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Manila",day:"2-digit",month:"short",year:"numeric",...(dateOnly?{}:{hour:"2-digit" as const,minute:"2-digit" as const})}).format(date);}
function Fields({rows,fields}:{rows:readonly ReportRow[];fields:readonly (readonly [string,string])[]}){return <dl className="dm-fields">{fields.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{monitoringValues(rows,key).map(value=>/(?:_at|_time|_date)$/.test(key)?stamp(value,key==="loading_date"||/^\d{4}-\d{2}-\d{2}$/.test(value)):value).join(" · ")||"—"}</dd></div>)}</dl>;}
function StatusTag({value,neutral=false}:{value:string;neutral?:boolean}){
 const key=value.toLowerCase().replaceAll("_"," ").trim();
 const tone=neutral?"neutral":/^(failed|cancelled|canceled)(?:\b|$)/.test(key)?"red":/^(delayed|needs attention|backload|offload|exception)(?:\b|$)/.test(key)?"amber":/^(completed|delivered|approved|received)$/.test(key)?"green":/^(in progress|ongoing|arrived|loading|unloading|in transit|dispatched)$/.test(key)?"blue":"neutral";
 return <span className={`dm-tag dm-tag-${tone}`}>{value.replaceAll("_"," ")||"—"}</span>;
}
function DetailValue({label,children}:{label:string;children:ReactNode}){return <div><dt>{label}</dt><dd>{children||"—"}</dd></div>;}
function RecordedTimeline({rows}:{rows:readonly ReportRow[]}){
 const events=MILESTONES.slice(0,4).flatMap(([key,label])=>monitoringValues(rows,key).map(time=>({key,label,time})));
 return events.length?<ol className="dm-timeline">{events.map(event=><li key={`${event.key}:${event.time}`}><span>{event.label}</span><time>{stamp(event.time)}</time></li>)}</ol>:<p className="dm-missing">No loading milestones recorded.</p>;
}
function Section({title,children}:{title:string;children:ReactNode}){return <section className="dm-detail-section"><h3>{title}</h3>{children}</section>;}

export default function DispatchMonitoringOperationalView({onOpenTrip,initialSearch=""}:{onOpenTrip?:(tripId:string,stopId?:string|null)=>void;initialSearch?:string}){
 const {accessToken,profile}=useAuth();
 const [search,setSearch]=useState(initialSearch),[dateFrom,setDateFrom]=useState(""),[dateTo,setDateTo]=useState(""),[moreFilters,setMoreFilters]=useState({plate_number:"",driver_name:"",warehouse_code:"",customer_name:""});
 const previousInitialSearch=useRef(initialSearch);
 useEffect(()=>{if(previousInitialSearch.current!==initialSearch){previousInitialSearch.current=initialSearch;setSearch(initialSearch);}},[initialSearch]);
 const [criteria,setCriteria]=useState({search:initialSearch,dateFrom:"",dateTo:"",...moreFilters});
 const [status,setStatus]=useState<"all"|MonitoringBucket>("all");
 const columnStorage=`alzhen:monitoring:operational-columns:${profile?.id??"guest"}`;
 const [visibleState,setVisibleState]=useState<{owner:string;keys:ColumnKey[]}|null>(null);
 const visible=useMemo(()=>visibleState?.owner===columnStorage?visibleState.keys:(()=>{try{const value=JSON.parse(localStorage.getItem(columnStorage)??"null");if(Array.isArray(value))return COLUMNS.filter(column=>column.key==="dispatch"||value.includes(column.key)).map(column=>column.key);}catch{/* Default operational columns. */}return COLUMNS.map(column=>column.key);})(),[columnStorage,visibleState]);
 const setVisible=(keys:ColumnKey[])=>{setVisibleState({owner:columnStorage,keys});try{localStorage.setItem(columnStorage,JSON.stringify(keys));}catch{/* Session preference remains usable. */}};
 const [window,setWindow]=useState<{rows:ReportRow[];trips:Set<string>;page:number;more:boolean}>({rows:[],trips:new Set(),page:0,more:false});
 const windowRef=useRef(window);windowRef.current=window;
 const [loading,setLoading]=useState(false),[error,setError]=useState(""),[refresh,setRefresh]=useState(0),[selectedKey,setSelectedKey]=useState<string|null>(null),[editing,setEditing]=useState(false);
 const controller=useRef<AbortController|null>(null),generation=useRef(0),loadedCriteria=useRef("");
 const headers=useRef(new Map<string,HTMLTableCellElement>());
 const footer=useContext(SpreadsheetBottomControlsContext);
 const viewport=useRef<HTMLDivElement>(null),returnFocus=useRef<HTMLElement|null>(null);
 useEffect(()=>{const timer=setTimeout(()=>setCriteria({search,dateFrom,dateTo,...moreFilters}),300);return()=>clearTimeout(timer);},[search,dateFrom,dateTo,moreFilters]);
 const queryKey=JSON.stringify([accessToken,criteria]);
 const options:ReportPageOptions={page:1,limit:50,search:criteria.search,sortBy:"loading_date",sortOrder:"desc",filters:{date_from:criteria.dateFrom,date_to:criteria.dateTo,plate_number:criteria.plate_number,driver_name:criteria.driver_name,warehouse_code:criteria.warehouse_code,customer_name:criteria.customer_name,active_transactions:"true"}};
 const optionsRef=useRef(options);optionsRef.current=options;
 useEffect(()=>{
  if(!accessToken)return;
  const current=++generation.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;
  const changed=loadedCriteria.current!==queryKey;loadedCriteria.current=queryKey;
  const pages=changed?1:Math.max(1,windowRef.current.page);if(changed){setSelectedKey(null);setWindow({rows:[],trips:new Set(),page:0,more:false});}
  if(criteria.dateFrom&&criteria.dateTo&&criteria.dateFrom>criteria.dateTo){setError("Choose a date range with the start before the end.");setLoading(false);return()=>abort.abort();}
  setLoading(true);setError("");
  void (async()=>{const trips=new Set<string>(),rows:ReportRow[]=[];let more=false,page=0;
   for(let index=1;index<=pages;index++){const result=await loadMonitoringWindow(accessToken,{...optionsRef.current,page:index},trips,abort.signal,!changed&&refresh>0);rows.push(...result.rows);result.trips.forEach(id=>trips.add(id));more=result.more;page=index;if(!more)break;}
   if(!abort.signal.aborted&&current===generation.current)setWindow({rows,trips,page,more});
  })().catch(cause=>{if(!abort.signal.aborted&&current===generation.current)setError(cause instanceof Error?cause.message:"Unable to load monitoring.");}).finally(()=>{if(!abort.signal.aborted&&current===generation.current)setLoading(false);});
  return()=>{abort.abort();controller.current?.abort();generation.current++;};
 },[accessToken,queryKey,refresh,criteria.dateFrom,criteria.dateTo]);
 const gate=useDeferredRealtimeRefresh(()=>setRefresh(value=>value+1),editing||loading);
 useEffect(()=>subscribeToAdminRealtime(event=>{if(event.kind==="resume"||event.kind==="batch"&&event.tables.some(table=>REPORT_REALTIME_TABLES["dispatch-monitoring"].includes(table)))gate.request();}),[gate]);
 const assignments=useMemo(()=>monitoringAssignments(window.rows),[window.rows]);
 const matching=useMemo(()=>assignments.filter(item=>{
  const text=item.records.flatMap(row=>Object.values(row).map(monitoringValue)).join(" ").toLowerCase();if(criteria.search&&!text.includes(criteria.search.trim().toLowerCase()))return false;
  if(criteria.plate_number&&!item.plate.toLowerCase().includes(criteria.plate_number.toLowerCase()))return false;
  if(criteria.driver_name&&!item.driver.toLowerCase().includes(criteria.driver_name.toLowerCase()))return false;
  if(criteria.customer_name&&!item.records.some(row=>monitoringValue(row.customer_name).toLowerCase().includes(criteria.customer_name.toLowerCase())))return false;
  if(criteria.warehouse_code&&!item.records.some(row=>monitoringValue(row.warehouse_code).toLowerCase().includes(criteria.warehouse_code.toLowerCase())))return false;
  return true;
 }),[assignments,criteria]);
 const displayed=matching.filter(item=>status==="all"||item.bucket===status),selected=assignments.find(item=>item.key===selectedKey);
 const columns=COLUMNS.filter(column=>visible.includes(column.key));
 const loadMore=async()=>{if(!accessToken||loading)return;const current=generation.current,abort=new AbortController();controller.current=abort;setLoading(true);setError("");try{const previous=windowRef.current,trips=new Set(previous.trips),rows:ReportRow[]=[];let page=previous.page,more=previous.more;for(let scan=0;scan<8&&more;scan++){const result=await loadMonitoringWindow(accessToken,{...optionsRef.current,page:++page},trips,abort.signal);rows.push(...result.rows);result.trips.forEach(id=>trips.add(id));more=result.more;if(result.rows.length)break;}if(!abort.signal.aborted&&current===generation.current)setWindow(before=>({rows:[...before.rows,...rows],trips,page,more}));}catch(cause){if(!abort.signal.aborted)setError(cause instanceof Error?cause.message:"Unable to load more assignments.");}finally{if(current===generation.current)setLoading(false);}};

 const valueFor=(row:MonitoringAssignment,key:ColumnKey)=>key==="dispatch"?row.dispatch:key==="loading"?stamp(row.loadingDate,true):key==="route"?`${row.pickup||"—"} → ${row.destinations.join("; ")||"—"}`:key==="truck"?`${row.plate||"—"} · ${row.driver||"—"}`:key==="progress"?row.progress:key==="milestone"?row.latest?`${row.latest.label} · ${stamp(row.latest.time)}`:"—":row.remarks;
 const formatting=useOperationalCellFormatting({scope:"dispatch-monitoring",userId:profile?.id??"guest",canFormat:["ADMIN","STAFF"].includes(profile?.role??""),rows:displayed,columns,keyOf:row=>row.key,valueOf:(row,column)=>valueFor(row,column as ColumnKey)});
 const exportRows=()=>{const quote=(value:string)=>`"${(/^[=+@\-]/.test(value)?"'":"")+value.replaceAll('"','""')}"`;const csv=[columns.map(column=>quote(column.title)).join(","),...displayed.map(row=>columns.map(column=>quote(valueFor(row,column.key)||"—")).join(","))].join("\r\n");const url=URL.createObjectURL(new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="dispatch-monitoring.csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 useRegisterTopbarAction("trips:Dispatch Monitoring","export",{label:"Export",onClick:exportRows,disabled:!displayed.length||loading});
 const secondaryCount=Object.values(moreFilters).filter(value=>value.trim()).length;
 const filtersActive=Boolean(dateFrom||dateTo||status!=="all"||secondaryCount);
 const clearFilters=()=>{setDateFrom("");setDateTo("");setStatus("all");setMoreFilters({plate_number:"",driver_name:"",warehouse_code:"",customer_name:""});};
 const loadMoreRef=useRef(loadMore);loadMoreRef.current=loadMore;
 useSpreadsheetViewport(viewport,displayed.length);
 const registerFooter=footer?.registerPaging,activeSheet=footer?.activeSheet;
 useLayoutEffect(()=>{
  if(activeSheet!=="dispatch-monitoring"||!registerFooter)return;
  return registerFooter("dispatch-monitoring",<span role="status">Showing {displayed.length} of {matching.length} {window.more?"loaded ":""}assignments{window.more?" · more available":""}{loading?" · Updating…":""}</span>,<><button className="dm-footer-refresh" type="button" disabled={loading} onClick={()=>setRefresh(value=>value+1)} title="Refresh saved monitoring data"><RefreshCw size={13} aria-hidden/>Refresh</button>{window.more&&<button type="button" disabled={loading} onClick={()=>void loadMoreRef.current()}>Load more</button>}</>,null);
 },[registerFooter,activeSheet,displayed.length,matching.length,window.more,loading]);
 return <div className="dm-operational ml-root" style={{"--ml-row-height":`${readTripRowHeight()}px`} as React.CSSProperties}>
  <TopbarSearchRegistration scope="trips:Dispatch Monitoring"><ColumnFinder columns={COLUMNS.map(column=>({key:column.key,title:column.title,hidden:!visible.includes(column.key),index:columns.findIndex(item=>item.key===column.key)}))} viewport={viewport} getHeader={key=>headers.current.get(key)} onReveal={key=>setVisible(COLUMNS.filter(column=>visible.includes(column.key)||column.key===key).map(column=>column.key))} leadingColumns={0} rowSearch={{value:search,onSearch:setSearch,placeholder:"Search trips or columns..."}}/></TopbarSearchRegistration>
  <div className="dm-toolbar" aria-label="Monitoring table filters and actions">
   <div className="dm-primary-filters"><div className="dm-dates"><span>Loading</span><input aria-label="Loading date from" title="Loading date from" type="date" data-realtime-refresh-safe value={dateFrom} onChange={event=>setDateFrom(event.target.value)}/><span aria-hidden>–</span><input aria-label="Loading date to" title="Loading date to" type="date" data-realtime-refresh-safe value={dateTo} onChange={event=>setDateTo(event.target.value)}/></div>
   <div className="dm-status-chips" role="group" aria-label="Delivery progress">{STATUS.map(([value,label])=><button key={value} type="button" aria-pressed={status===value} onClick={()=>setStatus(value)}>{label}</button>)}</div>
   <details className="dm-options"><summary><SlidersHorizontal size={13} aria-hidden/>More filters{secondaryCount>0&&<span className="dm-filter-count">{secondaryCount}</span>}</summary><div className="dm-popover">{Object.entries({plate_number:"Plate number",driver_name:"Driver",warehouse_code:"Warehouse code",customer_name:"Customer"}).map(([key,label])=><label key={key}>{label}<input value={moreFilters[key as keyof typeof moreFilters]} onChange={event=>setMoreFilters(current=>({...current,[key]:event.target.value}))}/></label>)}</div></details>
   {filtersActive&&<button className="dm-clear-filters" type="button" onClick={clearFilters}>Clear filters</button>}</div>
   <div className="dm-toolbar-actions"><TableViewers table="dispatch-monitoring" toolbar/><button type="button" className="operational-format-toggle" aria-pressed={formatting.enabled} onClick={formatting.toggle} title="Select cells to change their appearance"><Paintbrush size={13} aria-hidden/>Format cells</button><details className="dm-options"><summary><Columns3 size={13} aria-hidden/>Columns</summary><div className="dm-popover">{COLUMNS.map(column=><label className="dm-check" key={column.key}><input type="checkbox" checked={visible.includes(column.key)} disabled={column.key==="dispatch"} onChange={event=>setVisible(event.target.checked?COLUMNS.filter(item=>visible.includes(item.key)||item.key===column.key).map(item=>item.key):visible.filter(key=>key!==column.key))}/>{column.title}</label>)}<button type="button" onClick={()=>setVisible(COLUMNS.map(column=>column.key))}>Reset columns</button></div></details>
   </div>
  </div>
  {formatting.toolbar}
  {error&&<div className="dm-error" role="alert">{error}<button type="button" disabled={loading} onClick={()=>setRefresh(value=>value+1)}>Retry</button></div>}
  <div className="dm-table-scroll spreadsheet-viewport" ref={viewport} tabIndex={0} aria-label="Dispatch monitoring assignments" aria-busy={loading}>
   <table className="dm-table" style={{minWidth:Math.max(700,columns.reduce((sum,column)=>sum+column.width,0))}}><colgroup>{columns.map(column=><col key={column.key} style={{width:column.width}}/>)}</colgroup><thead><tr>{columns.map(column=><th ref={node=>{if(node)headers.current.set(column.key,node);else headers.current.delete(column.key);}} key={column.key} scope="col" {...formatting.header(column.key)} className={column.key==="dispatch"?"dm-dispatch":""}>{column.title}</th>)}</tr></thead><tbody>
    {displayed.map(row=><tr key={row.key} tabIndex={0} aria-selected={row.key===selectedKey} aria-label={`Open details for ${row.dispatch||"dispatch"}, ${row.plate||"truck not recorded"}`} onClick={event=>{if(formatting.enabled)return;returnFocus.current=event.currentTarget;setSelectedKey(row.key);}} onDoubleClick={event=>{if(formatting.enabled){returnFocus.current=event.currentTarget;setSelectedKey(row.key);}}} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();returnFocus.current=event.currentTarget;setSelectedKey(row.key);}}}>{columns.map(column=><td key={column.key} {...formatting.cell(row.key,column.key)} className={column.key==="dispatch"?"dm-dispatch":""} title={valueFor(row,column.key)||"—"}>
     {column.key==="dispatch"?<><strong>{row.dispatch||"—"}</strong><small>{row.assignmentId?"Truck assignment":"Assignment not recorded"}</small></>:column.key==="route"?<><span className="dm-primary dm-route">{row.pickup||"—"}<span aria-hidden> → </span>{row.destinations.slice(0,2).join(" · ")||"—"}</span><small>{row.stops.length?`${row.stops.length} delivery ${row.stops.length===1?"stop":"stops"}`:"Stop list not recorded"}</small></>:column.key==="truck"?<><strong>{row.plate||"—"}</strong><small className="dm-driver">{row.driver||"—"}</small></>:column.key==="progress"?<span className={`dm-progress dm-${row.bucket}`}>{row.progress}</span>:column.key==="milestone"?row.latest?<><span className="dm-primary">{row.latest.label}</span><small>{row.latest.scope==="trip"?"Trip · ":"Stop · "}{stamp(row.latest.time)}{row.latest.destination?` · ${row.latest.destination}`:""}</small></>:"—":<span className="dm-primary">{valueFor(row,column.key)||"—"}</span>}
    </td>)}</tr>)}
     {!displayed.length&&(loading?<TripTableLoadingRow columns={columns.length} label="Loading assignments…"/>:<tr><td className="dm-empty" colSpan={columns.length}>No assignments match the current filters.</td></tr>)}
     {loading&&displayed.length>0&&<TripTableLoadingRow columns={columns.length} label="Updating assignments…"/>}
   </tbody></table>
  </div>

  {selected&&accessToken&&<MonitoringDetailPanel key={selected.key} assignment={selected} token={accessToken} canEdit={["ADMIN","STAFF"].includes(profile?.role??"")} onEditing={setEditing} onClose={()=>{setSelectedKey(null);setEditing(false);requestAnimationFrame(()=>returnFocus.current?.focus());}} onSaved={()=>setRefresh(value=>value+1)} onOpenTrip={onOpenTrip}/>}
 </div>;
}

function MonitoringDetailPanel({assignment,token,canEdit,onClose,onEditing,onSaved,onOpenTrip}:{assignment:MonitoringAssignment;token:string;canEdit:boolean;onClose:()=>void;onEditing:(value:boolean)=>void;onSaved:()=>void;onOpenTrip?:(trip:string,stop?:string|null)=>void}){
 const panel=useRef<HTMLElement>(null),close=useRef(onClose);close.current=onClose;
 const [editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[detail,setDetail]=useState<TripDetail|null>(null),[draft,setDraft]=useState<Record<string,string>>({}),[error,setError]=useState("");
 const [booking,setBooking]=useState<{rows:ReportRow[];loading:boolean;error:string}>({rows:[],loading:true,error:""});
 useEffect(()=>{let active=true;setBooking({rows:[],loading:true,error:""});void fetchReportTripRows("trip-booking",token,{page:1,limit:200,search:"",sortBy:"loading_date",sortOrder:"desc",filters:{active_transactions:"true"}},assignment.tripId).then(rows=>{if(active)setBooking({rows,loading:false,error:""});}).catch(cause=>{if(active)setBooking({rows:[],loading:false,error:cause instanceof Error?cause.message:"Cargo and billing references are unavailable."});});return()=>{active=false;};},[token,assignment.tripId]);
 const cargo=useMemo(()=>{const scoped=booking.rows.filter(row=>assignment.assignmentId?monitoringField(row,"assignment_id","_assignment_id")===assignment.assignmentId:!monitoringField(row,"assignment_id","_assignment_id"));return [...new Map(scoped.flatMap(row=>{const id=monitoringField(row,"trip_line_item_id","_trip_line_item_id");return id?[[id,row] as const]:[];})).values()];},[booking.rows,assignment.assignmentId]);
 const [discardPrompt,setDiscardPrompt]=useState(false);
 const dirty=editing&&EDIT_FIELDS.some(field=>(draft[field.key]??"")!==monitoringValue(detail?.trip[field.key]).slice(0,field.type==="date"?10:undefined));
 const stateRef=useRef({editing,busy,dirty});stateRef.current={editing,busy,dirty};
 useEffect(()=>{panel.current?.querySelector<HTMLButtonElement>("button")?.focus({preventScroll:true});const original=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{document.body.style.overflow=original;onEditing(false);};},[onEditing]);
 const cancelEditing=()=>{setDiscardPrompt(false);setEditing(false);onEditing(false);setDraft({});requestAnimationFrame(()=>panel.current?.querySelector<HTMLButtonElement>("button")?.focus());};
 const dismiss=()=>{if(stateRef.current.busy)return;if(stateRef.current.editing){if(stateRef.current.dirty){setDiscardPrompt(true);requestAnimationFrame(()=>panel.current?.querySelector<HTMLButtonElement>(".dm-discard-prompt button")?.focus());return;}cancelEditing();return;}close.current();};
 const startEdit=async()=>{if(busy||!canEdit)return;setBusy(true);setError("");onEditing(true);try{invalidateTripCache(assignment.tripId);const next=await fetchTripDetail(token,assignment.tripId);setDetail(next);setDraft(Object.fromEntries(EDIT_FIELDS.map(field=>[field.key,monitoringValue(next.trip[field.key]).slice(0,field.type==="date"?10:undefined)])));setEditing(true);}catch(cause){setError(cause instanceof Error?cause.message:"Unable to open editing.");onEditing(false);}finally{setBusy(false);}};
 const save=async()=>{if(!detail||!canEdit||busy)return;const payload:Record<string,unknown>={};for(const field of EDIT_FIELDS){const original=monitoringValue(detail.trip[field.key]),value=draft[field.key]??"";if(value===original)continue;if(field.type==="number"){if(value&&(!Number.isFinite(Number(value))||Number(value)<0||field.key==="page_no"&&!Number.isInteger(Number(value)))){setError(`Enter a valid non-negative ${field.label.toLowerCase()}.`);return;}payload[field.key]=value?Number(value):null;}else payload[field.key]=value||null;}
  if(!Object.keys(payload).length){setEditing(false);onEditing(false);return;}setBusy(true);setError("");try{await updateTripRecord(token,assignment.tripId,payload);setEditing(false);onEditing(false);onSaved();}catch(cause){setError(cause instanceof Error?cause.message:"Changes were not saved.");}finally{setBusy(false);}};
 const rows=assignment.records;
 const savedStatuses=[...new Set(assignment.stops.map(stop=>stop.status).filter(Boolean))];
 const statusLabel=savedStatuses.length===1?savedStatuses[0]:savedStatuses.length?"Mixed statuses":"Status not recorded";
 const joined=(key:string)=>monitoringValues(rows,key).join(" · ")||"—";
 const transactions=joined("transaction_number");
 const rate=(key:string)=>monitoringValues(rows,key).map(value=>/^-?\d+(?:\.\d+)?$/.test(value)?new Intl.NumberFormat("en-PH",{maximumFractionDigits:20}).format(Number(value)):value).join(" · ")||"—";

 return createPortal(<div className="dm-panel-backdrop" onPointerDown={event=>{if(event.target===event.currentTarget)dismiss();}}><aside ref={panel} className="dm-panel" role="dialog" aria-modal="true" aria-labelledby="dm-detail-title" onKeyDown={event=>{if(event.key==="Escape"){event.stopPropagation();dismiss();}if(event.key==="Tab"){const nodes=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]'));const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}}>
  <header className="dm-panel-header"><div className="dm-panel-heading"><span className="dm-eyebrow">Dispatch monitoring</span><div className="dm-panel-title"><h2 id="dm-detail-title">{assignment.dispatch||"Dispatch details"}</h2><StatusTag value={statusLabel}/></div><p className="dm-panel-meta"><span>Loading · {stamp(assignment.loadingDate,true)}</span><span>Transaction · {transactions}</span></p></div><button className="dm-panel-close" type="button" aria-label={editing?"Cancel editing":"Close details"} disabled={busy} onClick={dismiss}><X size={20} aria-hidden/></button></header>
  <div className="dm-panel-actions">{canEdit&&!editing&&<button className="dm-edit-primary" type="button" disabled={busy} onClick={()=>void startEdit()}><Pencil size={14} aria-hidden/>{busy?"Opening editor…":"Edit"}</button>}{onOpenTrip&&<button className="dm-secondary-action" type="button" disabled={busy||editing} onClick={()=>onOpenTrip(assignment.tripId,assignment.stops.length===1?assignment.stops[0].id:null)}>Open trip workspace<ArrowUpRight size={14} aria-hidden/></button>}<span className="dm-timezone">Manila time · UTC+8</span></div>
  {discardPrompt&&<div className="dm-discard-prompt" role="alert"><strong>Discard unsaved changes?</strong><p>Your changes have not been saved.</p><div><button type="button" onClick={()=>setDiscardPrompt(false)}>Keep editing</button><button type="button" onClick={cancelEditing}>Discard changes</button></div></div>}
  {error&&<div className="dm-error" role="alert">{error}</div>}
  {editing?<form className="dm-edit-form" onSubmit={event=>{event.preventDefault();void save();}}><h3>Edit trip-level fields</h3><p>These saved fields are shared by all truck assignments on this trip. Truck, driver and stop relationships are managed in the trip workspace.</p>{EDIT_FIELDS.map(field=><label key={field.key}>{field.label}{field.key==="remarks"?<textarea rows={4} disabled={busy} value={draft[field.key]??""} onChange={event=>setDraft(current=>({...current,[field.key]:event.target.value}))}/>:<input type={field.type} min={field.type==="number"?0:undefined} step={field.key==="subcon_rate_manual"?"any":undefined} disabled={busy} value={draft[field.key]??""} onChange={event=>setDraft(current=>({...current,[field.key]:event.target.value}))}/>}</label>)}<div className="dm-edit-actions"><button type="button" disabled={busy} onClick={dismiss}>Cancel</button><button type="submit" disabled={busy}>{busy?"Saving…":"Save changes"}</button></div></form>:<div className="dm-panel-body">
   <Section title="Overview">
    <div className="dm-route-summary"><div><span className="dm-label">Pick-up</span><p>{assignment.pickup||"—"}</p></div><span className="dm-route-arrow" aria-hidden>→</span><div><span className="dm-label">Destination{assignment.destinations.length===1?"":"s"}</span><p>{assignment.destinations.slice(0,2).join(" · ")||"—"}</p><small>{assignment.stops.length} delivery {assignment.stops.length===1?"stop":"stops"} · Complete list below</small></div></div>
    <dl className="dm-fields dm-key-fields"><DetailValue label="Plate number">{assignment.plate}</DetailValue><DetailValue label="Driver">{assignment.driver}</DetailValue><DetailValue label="Delivery progress">{assignment.progress}</DetailValue><DetailValue label="Latest milestone">{assignment.latest?<><span>{assignment.latest.label}</span><small>{stamp(assignment.latest.time)} · {assignment.latest.scope==="trip"?"Trip":assignment.latest.destination||"Delivery stop"}</small></>:"—"}</DetailValue></dl>
    <Fields rows={rows} fields={[["trucking_company","Trucker"],["contact_number","Driver contact number"],["loading_date","Loading date · trip-wide"],["assigned_cbm","Assigned volume · CBM"],["trip_number","Trip number"],["truck_allocated_by_name","Truck allocated by"],["added_by_name","Trip added by"]]}/>
    <dl className="dm-fields dm-overview-meta"><DetailValue label="Trip type"><StatusTag value={joined("trip_type")} neutral/></DetailValue><DetailValue label="Assignment record">{assignment.assignmentId}</DetailValue></dl>
   </Section>
   <Section title="Delivery progress"><div className="dm-section-intro"><p>{assignment.progress}</p><StatusTag value={statusLabel}/></div><p className="dm-scope">Only stops linked to this truck assignment. Loading events apply to the trip; delivery events apply to each stop.</p><h4 className="dm-subheading">Trip loading milestones</h4><RecordedTimeline rows={rows}/>
    {!assignment.stops.length?<p className="dm-missing">No stops linked to this assignment.</p>:<ol className="dm-stop-list">{assignment.stops.map((stop,index)=><li className="dm-stop" key={stop.id}><div className="dm-stop-heading"><span className="dm-stop-index" aria-hidden>{String(index+1).padStart(2,"0")}</span><h4>{stop.destination||"Destination not recorded"}</h4><StatusTag value={stop.status}/></div><Fields rows={stop.records} fields={[["transaction_number","Transaction number"],["transaction_dr_number","Delivery receipt"],["ship_to_city","Destination city"],["arrival_time","Arrived at destination"],["start_unloading_time","Unloading started"],["finish_unloading_time","Unloading finished"],["departure_time","Departed destination"]]}/></li>)}</ol>}
   </Section>
   <Section title="Cargo">{booking.loading&&<p className="dm-scope" role="status">Loading cargo references…</p>}{booking.error&&<p className="dm-error">{booking.error}</p>}<Fields rows={rows} fields={[["assigned_cbm","Assigned volume · CBM"],["truck_capacity_cbm","Truck capacity · CBM"],["transaction_quantity","Stop quantities · recorded values"],["trip_total_cbm","Trip total volume · CBM"],["remaining_unassigned_cbm","Trip unassigned volume · CBM"],["number_of_drops","Trip drops · saved count"]]}/>
    {cargo.length>0?<div className="dm-cargo-list" role="list" aria-label="Assigned cargo">{cargo.map(row=><article className="dm-cargo-row" role="listitem" key={monitoringField(row,"trip_line_item_id","_trip_line_item_id")}><h4>{monitoringField(row,"customer_model","product_name","model_code")||"Cargo record"}</h4><dl className="dm-cargo-amounts"><DetailValue label="Quantity">{monitoringField(row,"quantity")}</DetailValue><DetailValue label="Unit">{monitoringField(row,"unit_of_measure","uom","unit")}</DetailValue><DetailValue label="Volume · CBM">{monitoringField(row,"cbm")}</DetailValue></dl><Fields rows={[row]} fields={[["dr_number","Delivery receipt"],["sap_so_number","SAP SO"],["customer_po_number","Customer PO"],["internal_po_number","Internal PO"]]}/></article>)}</div>:!booking.loading&&!booking.error&&<p className="dm-missing">No cargo line records linked to this assignment.</p>}
   </Section>
   <Section title="Documents"><div className="dm-document-rows"><div className="dm-document-row"><div><h4>Authorization letter</h4><p>{joined("authorization_letter")}</p></div><StatusTag value={joined("letter_status")}/></div><div className="dm-document-row"><div><h4>Proof of delivery</h4><p>Saved status for this assignment’s stops</p></div><StatusTag value={joined("pod_status")}/></div></div><Fields rows={rows} fields={[["page_no","Page number · trip-wide"],["signed_dr_upload_date","Signed DR uploaded"],["pod_submitted_at","POD submitted"],["pod_received_at","POD approved / received"],["transmittal_ref","Transmittal reference"],["transmittal_date","Transmittal date"],["tms_date","TMS date"],["tms_done_by_name","TMS done by"],["pod_ac_shipping_date","POD / AC shipping date"],["lbc_tracking_number","LBC tracking number"]]}/><p className="dm-scope dm-section-note">Open the trip workspace for existing document view and download actions.</p></Section>
   <Section title="Rates and billing"><p className="dm-scope">Trip-level rates apply across the trip. Billing references below are trip-wide and may include other truck assignments.</p><dl className="dm-fields"><DetailValue label="Subcontractor rate · manual, trip-wide">{rate("subcon_rate_manual")}</DetailValue><DetailValue label="Subcontractor rate · automated, report value">{rate("subcon_rate_automated")}</DetailValue><DetailValue label="Currency · when recorded">{monitoringValues(rows,"currency","currency_code").join(" · ")||"—"}</DetailValue><DetailValue label="Billing status · when recorded"><StatusTag value={monitoringValues([...rows,...booking.rows],"billing_status").join(" · ")}/></DetailValue></dl><Fields rows={[...rows,...booking.rows]} fields={[["invoice_number","S.I. / invoice number · trip-wide"],["billing","Billing · trip-wide"],["ship_from_city","Ship From city"],["from_to","From – To"],["transaction_number_repeat","Transaction number · trip-wide"]]}/></Section>
   <Section title="Remarks"><p className="dm-full-remarks">{assignment.remarks||"—"}</p></Section>
  </div>}
 </aside></div>,document.body);
}
