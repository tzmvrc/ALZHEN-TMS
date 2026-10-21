import DatabaseDeleteDialog from "./DatabaseDeleteDialog";
import TruckImagesCell from "./TruckImagesCell";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent, type KeyboardEvent, type ReactNode } from "react";
import { Trash2, LoaderCircle } from "lucide-react";
import { useManagementTableColumns } from "./useManagementTableColumns";
import { ReportCellFormattingToolbar } from "./ReportSpreadsheetShared";
import { SpreadsheetCellContextMenu } from "./SpreadsheetCellContextMenu";
import { SpreadsheetBlankRows, SpreadsheetRowNumber, SPREADSHEET_NUMBER_GUTTER_WIDTH, SPREADSHEET_ATTACHED_VIEWPORT_CLASS, useSpreadsheetViewport } from "./SpreadsheetPresentation";
import { REPORT_GRID_BODY_CELL_CLASS, REPORT_GRID_HEADER_CELL_CLASS, REPORT_GRID_VIEWPORT_CLASS, reportColumnAppearance, reportHeaderAppearance, type ReportCellFormat } from "./ReportSpreadsheetUtils";
import { useSpreadsheetSurface } from "./useSpreadsheetSurface";
import { useVirtualSpreadsheetRows } from "./useVirtualSpreadsheetRows";
import { useDeferredRealtimeRefresh } from "./useDeferredRealtimeRefresh";
import { subscribeToAdminRealtime } from "../../services/realtime.service";
import { fetchMasterData, readMasterDataRecord, getCachedMasterData, saveMasterData, deleteMasterDataRecords, type MasterDataKey, type MasterDataRow, type MasterDataPage } from "../../services/master-data.service";
import { invalidateApiCache } from "../../services/api.service";
import { useOptionalToast } from "../ui/toast-context";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import type { RelationshipKind } from "../../services/lookup.service";
import "./database-spreadsheet.css";

export type DatabaseField={key:string;label:string;kind?:"textarea"|"number"|"boolean"|"relation"|"select"|"images";readOnly?:boolean;required?:boolean;source?:string;options?:string[]};
type Draft={id:string;field:string;value:string};
export type SpreadsheetDataSource={tableKey:string;sheetId:string;topics:readonly string[];recordNoun?:string;deleteDescription?:string;load:(query:string,page:number,sort:string,direction:string)=>Promise<MasterDataPage>;cached?:(query:string,sort:string,direction:string)=>MasterDataPage|null;read?:(id:string)=>Promise<MasterDataRow|null>;save:(id:string,values:Record<string,unknown>)=>Promise<MasterDataRow>;remove:(ids:string[])=>Promise<{deleted:string[];failed:Array<{id:string;message:string}>}>;invalidate:()=>void;canEditField?:(row:MasterDataRow,field:DatabaseField)=>boolean;sortKeys?:readonly string[];canEditRow?:(row:MasterDataRow)=>boolean;canDeleteRow?:(row:MasterDataRow)=>boolean;onViewProfile?:(row:MasterDataRow)=>void;onViewActivity?:(row:MasterDataRow)=>void;renderCell?:(row:MasterDataRow,field:DatabaseField)=>ReactNode};
type Props={dataSource?:SpreadsheetDataSource;resource:MasterDataKey;fields:DatabaseField[];token:string;profileId?:string;canEdit:boolean;active:boolean;search:string;revision:number;onEdit:(row:MasterDataRow)=>void;onImage?:(row:MasterDataRow)=>void;onMetadata:(supported:boolean)=>void;confirmedRecord?:{row:MasterDataRow;sequence:number}};
const PAGE_SIZE=30;
const cellMenuItemClass="block w-full rounded-sm px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 focus-visible:bg-blue-50 focus-visible:outline-none disabled:cursor-default disabled:opacity-40";
const resourceTable:Record<MasterDataKey,string>={warehouses:"warehouses",trucks:"trucks",drivers:"drivers","trucking-companies":"trucking_companies",customers:"customers",stores:"customer_stores","store-contacts":"store_contacts",products:"products"};
const text=(value:unknown)=>value==null?"":String(value);
const keyFor=(id:string,field:string)=>`${id}|${field}`;
function display(row:MasterDataRow,field:DatabaseField){
 if(field.kind!=="relation")return field.kind==="boolean"?(row[field.key]==null?"":row[field.key]?"Yes":"No"):text(row[field.key]);
 const nested=field.key==="trucking_company_id"?row.trucking_companies:field.key==="customer_id"?row.customers:field.key==="store_id"?row.customer_stores:row.trucks;
 const related=nested as Record<string,unknown>|null;
 return text(related?.name??related?.plate_number??row[field.key]);
}

/** Master-data adapter for the shared spreadsheet surfaces. Selection never writes records. */
export default function DatabaseSpreadsheet({dataSource,resource,fields:sourceFields,token,profileId,canEdit,active,search,revision,onEdit,onImage,onMetadata,confirmedRecord}:Props){
 const fields=useMemo<DatabaseField[]>(()=>resource==="trucks"?[...sourceFields,{key:"__truck_images",label:"Images",kind:"images"}]:sourceFields,[sourceFields,resource]);
 const viewport=useRef<HTMLDivElement|null>(null),toast=useOptionalToast();
 const [sort,setSort]=useState({key:"",direction:"asc"});
 const [query,setQuery]=useState(search);
 useEffect(()=>{const timer=setTimeout(()=>setQuery(search),200);return()=>clearTimeout(timer);},[search]);
 const initial=dataSource?dataSource.cached?.(query,sort.key,sort.direction)??null:getCachedMasterData(token,resource,query,1,PAGE_SIZE,sort.key,sort.direction);
 const [rows,setRows]=useState<MasterDataRow[]>(initial?.rows??[]),[total,setTotal]=useState(initial?.pagination.total??0),[lastPage,setLastPage]=useState(initial?1:0),[pages,setPages]=useState(initial?.pagination.totalPages??1);
 const [loading,setLoading]=useState(!initial),[more,setMore]=useState(false),[error,setError]=useState("");
 const [refresh,setRefresh]=useState(0),[draft,setDraft]=useState<Draft|null>(null),[saving,setSaving]=useState(false);
 const [focused,setFocused]=useState<{id:string;field:string}|null>(null),[cells,setCells]=useState(new Set<string>()),[rowSelection,setRowSelection]=useState(new Set<string>()),[columnSelection,setColumnSelection]=useState(new Set<string>());
 const [headerSelection,setHeaderSelection]=useState<string|null>(null),[renaming,setRenaming]=useState<{key:string;value:string}|null>(null);
 const [cellFeedback,setCellFeedback]=useState<Record<string,"saved"|"error">>({});
 const feedbackTimers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
 useEffect(()=>()=>{feedbackTimers.current.forEach(clearTimeout);},[]);
 const notifyCell=(id:string,field:string,state:"saved"|"error")=>{const key=keyFor(id,field);clearTimeout(feedbackTimers.current.get(key));setCellFeedback(previous=>({...previous,[key]:state}));feedbackTimers.current.set(key,setTimeout(()=>{setCellFeedback(previous=>{const next={...previous};delete next[key];return next;});feedbackTimers.current.delete(key);},state==="saved"?1800:5000));};
 const selectHeader=(key:string)=>{setHeaderSelection(key);setCells(new Set());setRowSelection(new Set());setColumnSelection(new Set());setFocused(null);};
 const anchor=useRef<{id:string;field:string}|null>(null),selectionRowAnchor=useRef<string|null>(null),selectionColumnAnchor=useRef<string|null>(null);
 const [menu,setMenu]=useState<{x:number;y:number;id:string;field:string;row?:boolean}|null>(null),[confirm,setConfirm]=useState<string[]|null>(null),[deleting,setDeleting]=useState(false),[deleteError,setDeleteError]=useState("");
 const alive=useRef(true),request=useRef(0),loadLock=useRef(false),saveLock=useRef(false),deleteLock=useRef(false),loaded=useRef(0),reconcileKey=useRef("");
 const pendingDraft=useRef(draft);pendingDraft.current=draft;
 const dragSelecting=useRef(false);
 useEffect(()=>{const stop=()=>{dragSelecting.current=false;};window.addEventListener("pointerup",stop);window.addEventListener("pointercancel",stop);return()=>{window.removeEventListener("pointerup",stop);window.removeEventListener("pointercancel",stop);};},[]);
 useEffect(()=>{if(!active)setMenu(null);},[active]);
 const sheetId=dataSource?.sheetId??`db-${resource}`;
 const tableKey=dataSource?.tableKey??`master:${resource}`;
 const invalidate=()=>dataSource?dataSource.invalidate():invalidateApiCache(`/master-data/${resource}`);
 const load=(page:number)=>dataSource?dataSource.load(query,page,sort.key,sort.direction):fetchMasterData(token,resource,query,page,PAGE_SIZE,sort.key,sort.direction);
 const scope=`${token}:${tableKey}:${query}:${sort.key}:${sort.direction}`;
 const columns=useMemo(()=>fields.map(field=>({key:field.key,width:field.kind==="images"?180:undefined,title:field.key==="location_verified"?"Location verified":field.label})),[fields]);
 const management=useManagementTableColumns({table:tableKey,token,profileId,columns,enabled:canEdit&&active,leadingColumns:1,leadingWidth:SPREADSHEET_NUMBER_GUTTER_WIDTH,omitsHiddenCells:true,contextMenuOnly:true,showFinder:false,reportMenu:true,
 onRenameColumn:key=>{renameCancelled.current=false;selectHeader(key);setRenaming({key,value:design.columns[key]?.alias??columns.find(column=>column.key===key)?.title??key});},
 onRestoreColumnTitle:key=>{void design.save(key,{alias:null},management.columnWidth(key));},
 onSelectColumn:key=>selectColumn(key),onFormatHeader:selectHeader,onAutoFit:()=>autoFit(),sortActions:column=>(column==="__truck_images"||dataSource?.sortKeys&&!dataSource.sortKeys.includes(column))?[]:[
  {label:"Sort ascending",active:sort.key===column&&sort.direction==="asc",onClick:()=>setSort({key:column,direction:"asc"})},
  {label:"Sort descending",active:sort.key===column&&sort.direction==="desc",onClick:()=>setSort({key:column,direction:"desc"})}
 ],paused:!!draft||saving});
 const {design}=management;
 const surface=useSpreadsheetSurface(tableKey,design.columns);
 const visible=management.visibleColumns;
 const filler=useSpreadsheetViewport(viewport,rows.length,active);
 const keys=useMemo(()=>rows.map(row=>row.id),[rows]);
 const virtual=useVirtualSpreadsheetRows(viewport,keys,active,rows.findIndex(row=>row.id===draft?.id));
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current++;};},[]);
 const gate=useDeferredRealtimeRefresh(()=>{invalidate();setRefresh(value=>value+1);},!!draft||saving||deleting);
 useEffect(()=>subscribeToAdminRealtime(event=>{const changed=event.kind==="batch"?event.tables:event.kind==="change"?[event.payload.table]:event.kind==="recovered"?[event.table]:[];if(event.kind==="resume"||changed.some(table=>[...(dataSource?.topics??[resourceTable[resource]]),...(resource==="trucks"?["trucking_companies"]:resource==="stores"?["customers"]:resource==="store-contacts"?["customer_stores"]:[])].includes(table)))gate.request();}),[resource,gate]);
 const appliedConfirmation=useRef(0),acknowledgedRow=useRef<MasterDataRow|null>(null);
 useEffect(()=>{
  if(!confirmedRecord||confirmedRecord.sequence===appliedConfirmation.current)return;
  appliedConfirmation.current=confirmedRecord.sequence;acknowledgedRow.current=confirmedRecord.row;
  const needle=query.trim().toLocaleLowerCase();
  if(!needle||Object.values(confirmedRecord.row).some(value=>String(value??"").toLocaleLowerCase().includes(needle)))setRows(current=>[...new Map([confirmedRecord.row,...current.map(row=>row.id===confirmedRecord.row.id?confirmedRecord.row:row)].map(row=>[row.id,row])).values()]);
  gate.request();
 },[confirmedRecord?.sequence]);

 useEffect(()=>{
  if(!active||!token||pendingDraft.current||saveLock.current)return;
  const readKey=`${scope}:${revision}:${refresh}`;
  if(reconcileKey.current===readKey)return;
  let cancelled=false;const generation=++request.current;loadLock.current=true;setError("");setLoading(true);
  const sameScope=reconcileKey.current.startsWith(scope+":");
  const target=sameScope?Math.max(1,loaded.current):1;
  if(!sameScope){setRows([]);setLastPage(0);loaded.current=0;setCells(new Set());setRowSelection(new Set());setColumnSelection(new Set());setFocused(null);}
  void (async()=>{
   try{
    const first=await load(1);
    let all=first.rows;
    for(let page=2;page<=Math.min(target,first.pagination.totalPages);page++){
     if(cancelled||request.current!==generation)return;
     const result=await load(page);all=[...all,...result.rows];
    }
    if(cancelled||request.current!==generation)return;
    let acknowledged=acknowledgedRow.current;const needle=query.trim().toLocaleLowerCase();
    if(acknowledged&&!all.some(row=>row.id===acknowledged!.id)){
      try{acknowledged=dataSource?.read?await dataSource.read(acknowledged.id):dataSource?acknowledged:await readMasterDataRecord(token,resource,acknowledged.id);if(cancelled||request.current!==generation)return;acknowledgedRow.current=acknowledged;}catch{/* Retain a confirmed local row while read-only reconciliation is unavailable. */}
      if(acknowledged&&(!needle||Object.values(acknowledged).some(value=>String(value??"").toLocaleLowerCase().includes(needle))))all=[acknowledged,...all];
    }else if(acknowledged)acknowledgedRow.current=null;
    setRows([...new Map(all.map(row=>[row.id,row])).values()]);setTotal(first.pagination.total);setPages(first.pagination.totalPages);loaded.current=Math.min(target,first.pagination.totalPages);setLastPage(loaded.current);onMetadata(first.location_verification_supported??false);reconcileKey.current=readKey;
   }catch{if(!cancelled&&request.current===generation)setError("Unable to load records. Your current data and drafts are preserved.");}
   finally{if(!cancelled&&request.current===generation){loadLock.current=false;setLoading(false);setMore(false);}}
  })();
  return()=>{cancelled=true;};
 },[active,scope,revision,refresh,resource,token,query,sort.key,sort.direction,draft===null,saving]);
 const loadMore=useCallback(async()=>{
  if(!active||loadLock.current||loaded.current>=pages||!loaded.current)return;
  loadLock.current=true;setMore(true);const generation=request.current;const page=loaded.current+1;
  try{const result=await load(page);if(!alive.current||request.current!==generation)return;
   setRows(previous=>[...new Map([...previous,...result.rows].map(row=>[row.id,row])).values()]);setPages(result.pagination.totalPages);setTotal(result.pagination.total);loaded.current=page;setLastPage(page);setError("");
  }catch{if(alive.current&&request.current===generation)setError("More records could not load. Use Retry to continue.");}
  finally{if(alive.current&&request.current===generation){loadLock.current=false;setMore(false);}}
 },[active,pages,resource,token,query,sort.key,sort.direction]);
 useEffect(()=>{const element=viewport.current;if(!active||!element)return;const scroll=()=>{if(element.scrollHeight-element.scrollTop-element.clientHeight<180)void loadMore();};element.addEventListener("scroll",scroll,{passive:true});scroll();return()=>element.removeEventListener("scroll",scroll);},[active,rows.length,loadMore]);
 const getFormat=(id:string,field:string)=>design.columns[field]?.cells?.[id]??undefined;
 const isSelected=(id:string,field:string)=>rowSelection.has(id)||columnSelection.has(field)||cells.has(keyFor(id,field));
 const selectCell=(id:string,field:string,event?:{ctrlKey?:boolean;metaKey?:boolean;shiftKey?:boolean})=>{
  setHeaderSelection(null);setFocused({id,field});
  if(event?.shiftKey&&anchor.current){const ids=[...keys,...Array.from({length:filler.count},(_,i)=>`virtual:${resource}:${rows.length+i+1}`)],a=ids.indexOf(anchor.current.id),b=ids.indexOf(id),c=visible.findIndex(col=>col.key===anchor.current!.field),d=visible.findIndex(col=>col.key===field);if(Math.min(a,b,c,d)>=0){const range=new Set<string>();for(let i=Math.min(a,b);i<=Math.max(a,b);i++)for(let j=Math.min(c,d);j<=Math.max(c,d);j++)range.add(keyFor(ids[i],visible[j].key));setCells(range);setRowSelection(new Set());setColumnSelection(new Set());return;}}
  setRowSelection(new Set());setColumnSelection(new Set());setCells(previous=>{const next=event?.ctrlKey||event?.metaKey?new Set(previous):new Set<string>();const key=keyFor(id,field);if(next.has(key))next.delete(key);else next.add(key);return next;});anchor.current={id,field};
 };
 const selectRow=(id:string,event?:{ctrlKey?:boolean;metaKey?:boolean;shiftKey?:boolean})=>{
  setHeaderSelection(null);setFocused({id,field:visible[0]?.key??""});setCells(new Set());setColumnSelection(new Set());setRowSelection(previous=>{const next=event?.ctrlKey||event?.metaKey?new Set(previous):new Set<string>();if(event?.shiftKey&&selectionRowAnchor.current){const a=keys.indexOf(selectionRowAnchor.current),b=keys.indexOf(id);if(a>=0&&b>=0)for(let i=Math.min(a,b);i<=Math.max(a,b);i++)next.add(keys[i]);}else if(next.has(id))next.delete(id);else next.add(id);return next;});selectionRowAnchor.current=id;
 };
 const selectColumn=(field:string,event?:{ctrlKey?:boolean;metaKey?:boolean;shiftKey?:boolean})=>{setHeaderSelection(null);setFocused({id:keys[0]??`virtual:${resource}:1`,field});setCells(new Set());setRowSelection(new Set());setColumnSelection(previous=>{const next=event?.ctrlKey||event?.metaKey?new Set(previous):new Set<string>();const a=visible.findIndex(col=>col.key===selectionColumnAnchor.current),b=visible.findIndex(col=>col.key===field);if(event?.shiftKey&&a>=0){for(let i=Math.min(a,b);i<=Math.max(a,b);i++)next.add(visible[i].key);}else if(next.has(field))next.delete(field);else next.add(field);return next;});selectionColumnAnchor.current=field;};
 const apply=(change:Partial<ReportCellFormat>)=>{
  if(!canEdit)return;
  change={...change,...(change.color===""?{color:null}:{}),...(change.backgroundColor===""?{backgroundColor:null}:{})};
  if(headerSelection){void design.save(headerSelection,{header:change},management.columnWidth(headerSelection));return;}
  const incomingColumns=visible.filter(column=>!columnSelection.has(column.key));
  for(const column of incomingColumns){const ids=new Set([...Object.keys(design.columns[column.key]?.cells??{}),...rowSelection]);for(const key of cells){const [id,field]=key.split("|");if(field===column.key)ids.add(id);}if(ids.size>1000){toast?.addToast({title:"Use whole-column formatting or a smaller selection; this column exceeds 1,000 individual cell formats.",variant:"error"});return;}}
  for(const column of visible){
   if(columnSelection.has(column.key)){void design.save(column.key,{format:change},management.columnWidth(column.key));continue;}
   const ids=new Set(rowSelection);for(const key of cells){const [id,field]=key.split("|");if(field===column.key)ids.add(id);}
   if(!ids.size)continue;
   const existing=Object.keys(design.columns[column.key]?.cells??{});if(new Set([...existing,...ids]).size>1000){toast?.addToast({title:"This column has reached its 1,000 individually formatted cells. Use whole-column formatting or a smaller selection.",variant:"error"});return;}
   void design.save(column.key,{cells:Object.fromEntries([...ids].map(id=>[id,change]))},management.columnWidth(column.key));
  }
 };
 const format=headerSelection?{bold:true,...design.columns[headerSelection]?.format,...design.columns[headerSelection]?.header}:focused?{...design.columns[focused.field]?.format,...getFormat(focused.id,focused.field)}:{};
 const selectedCount=(headerSelection?1:0)+cells.size+rowSelection.size*visible.length+columnSelection.size*Math.max(1,rows.length);
 const commit=async(next:Draft)=>{
  if(saveLock.current||!canEdit)return false;const field=fields.find(field=>field.key===next.field),row=rows.find(row=>row.id===next.id);if(!field||!row||field.readOnly||dataSource?.canEditField?.(row,field)===false||field.kind==="images")return false;
  let value:unknown=next.value;
  if(field.required&&!next.value.trim()){toast?.addToast({title:`${field.label} is required.`,variant:"error"});return false;}
  if(field.kind==="number"){value=next.value.trim()?Number(next.value):null;if(value!==null&&!Number.isFinite(value)){toast?.addToast({title:"Enter a valid number.",variant:"error"});return false;}}
  else if(field.kind==="boolean")value=next.value==="true";
  else if(field.kind==="select"&&next.value&&!field.options?.includes(next.value)){toast?.addToast({title:"Choose an available option.",variant:"error"});return false;}
  else if(!next.value)value=null;
  if(text(value)===text(row[next.field])){setDraft(null);return true;}
  saveLock.current=true;setSaving(true);
  try{const canonical=dataSource?await dataSource.save(next.id,{[next.field]:value}):await saveMasterData(token,resource,{[next.field]:value},next.id);if(!alive.current)return false;setRows(previous=>previous.map(row=>row.id===next.id?{...row,...canonical}:row));notifyCell(next.id,next.field,"saved");setDraft(current=>current?.id===next.id&&current.field===next.field&&current.value===next.value?null:current);return true;}
  catch(cause){if(alive.current){notifyCell(next.id,next.field,"error");setDraft(current=>current&&current.id===next.id&&current.field===next.field?current:next);toast?.addToast({title:cause instanceof Error?cause.message:"Unable to save. Your draft is retained.",variant:"error"});}return false;}
  finally{saveLock.current=false;if(alive.current)setSaving(false);}
 };
 const begin=(id:string,fieldKey:string,seed?:string)=>{if(!canEdit||saving||deleting)return;const row=rows.find(row=>row.id===id),field=fields.find(field=>field.key===fieldKey);if(!row||!field||field.readOnly||dataSource?.canEditField?.(row,field)===false)return;if(field.kind==="images"){if(seed===undefined)onImage?.(row);return;}if(fieldKey==="location_verified"||fieldKey==="latitude"&&row.longitude==null||fieldKey==="longitude"&&row.latitude==null){onEdit(row);return;}setFocused({id,field:fieldKey});setDraft({id,field:fieldKey,value:seed??text(row[fieldKey])});};
 const focusCell=()=>requestAnimationFrame(()=>{if(!focused)return;viewport.current?.querySelector<HTMLElement>(`[data-database-cell="${CSS.escape(keyFor(focused.id,focused.field))}"]`)?.focus();});
 const editorKeys=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setDraft(null);focusCell();}if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();if(draft)void commit(draft).then(saved=>{if(saved)focusCell();});}};
 const cellProps=(id:string,field:string)=>({"data-database-cell":keyFor(id,field),"data-spreadsheet-selected":isSelected(id,field)?"true":undefined,title:id.startsWith("virtual:")?"Presentation cell only. Use Add to create a database record.":undefined,tabIndex:focused?.id===id&&focused.field===field?0:-1,onPointerDown:(event:ReactPointerEvent<HTMLTableCellElement>)=>{if(event.button!==0||(event.target as Element).closest("input,textarea,select,button"))return;dragSelecting.current=true;selectCell(id,field,event);event.currentTarget.focus({preventScroll:true});},onPointerEnter:(event:ReactPointerEvent<HTMLTableCellElement>)=>{if(dragSelecting.current&&event.buttons===1)selectCell(id,field,{shiftKey:true});},onClick:(event:MouseEvent<HTMLTableCellElement>)=>{if(!(event.target as Element).closest("input,textarea,select,button")&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&cells.size<=1)selectCell(id,field,event);},onDoubleClick:()=>begin(id,field),onContextMenu:(event:MouseEvent<HTMLTableCellElement>)=>{event.preventDefault();if(!isSelected(id,field))selectCell(id,field);setMenu({x:event.clientX,y:event.clientY,id,field});},className:`${REPORT_GRID_BODY_CELL_CLASS} relative whitespace-pre-wrap break-words ${isSelected(id,field)?"outline outline-2 outline-inset outline-blue-500":""}`,style:{...management.bodyProps(field).style,...reportColumnAppearance(design.columns[field],getFormat(id,field)),minHeight:30} as CSSProperties});
 const keyboard=(event:KeyboardEvent<HTMLDivElement>)=>{
  if((event.target as HTMLElement).closest("input,textarea,select,[role=dialog],[role=menu]"))return;
  if(!focused)return;
  if(["Enter","F2"].includes(event.key)){event.preventDefault();begin(focused.id,focused.field);return;}
  if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();begin(focused.id,focused.field,event.key);return;}
  if(!["ArrowDown","ArrowUp","ArrowLeft","ArrowRight","Tab"].includes(event.key))return;
  event.preventDefault();const ids=[...keys,...Array.from({length:filler.count},(_,i)=>`virtual:${resource}:${rows.length+i+1}`)];let r=ids.indexOf(focused.id),c=visible.findIndex(col=>col.key===focused.field);
  if(event.key==="ArrowDown")r++;if(event.key==="ArrowUp")r--;if(event.key==="ArrowLeft"||event.key==="Tab"&&event.shiftKey)c--;if(event.key==="ArrowRight"||event.key==="Tab"&&!event.shiftKey)c++;
  if(c>=visible.length){c=0;r++;}if(c<0){c=visible.length-1;r--;}
  if(r<0||r>=ids.length||c<0||!visible[c])return;selectCell(ids[r],visible[c].key,event);const key=keyFor(ids[r],visible[c].key);requestAnimationFrame(()=>viewport.current?.querySelector<HTMLElement>(`[data-database-cell="${CSS.escape(key)}"]`)?.focus({preventScroll:false}));
 };
 const deleteSelected=()=>{if(draft||saving){toast?.addToast({title:"Finish editing the active cell before deleting records.",variant:"warning"});return;}const ids=[...rowSelection].filter(id=>keys.includes(id)&&dataSource?.canDeleteRow?.(rows.find(row=>row.id===id)!)!==false);if(!ids.length)return;setDeleteError("");setConfirm(ids);};
 const remove=async()=>{
  if(deleteLock.current||!confirm)return;deleteLock.current=true;setDeleting(true);setDeleteError("");
  const targets=[...confirm],deleted:string[]=[],failed:Array<{id:string;message:string}>=[];
  try{
   for(let offset=0;offset<targets.length;offset+=100){
    try{const result=dataSource?await dataSource.remove(targets.slice(offset,offset+100)):await deleteMasterDataRecords(token,resource,targets.slice(offset,offset+100));deleted.push(...result.deleted);failed.push(...result.failed);}
    catch{failed.push(...targets.slice(offset).map(id=>({id,message:"Deletion was not confirmed. Refresh before retrying."})));break;}
   }
   if(!alive.current)return;
   const done=new Set(deleted);if(acknowledgedRow.current&&done.has(acknowledgedRow.current.id))acknowledgedRow.current=null;setRows(previous=>previous.filter(row=>!done.has(row.id)));setTotal(previous=>Math.max(0,previous-deleted.length));setRowSelection(new Set(failed.map(row=>row.id)));setConfirm(failed.length?failed.map(row=>row.id):null);
   if(failed.length){setDeleteError(`${failed.length} record${failed.length===1?"":"s"} could not be deleted. ${failed[0].message}`);}
   toast?.addToast({title:failed.length?`${deleted.length} deleted; ${failed.length} could not be deleted and remain selected.`:dataSource?.recordNoun==="user"?`${deleted.length} account${deleted.length===1?"":"s"} deactivated; history retained.`:`${deleted.length} record${deleted.length===1?"":"s"} deleted.`,variant:failed.length?(deleted.length?"warning":"error"):"success"});
   if(deleted.length)gate.request();
  }
  finally{deleteLock.current=false;if(alive.current)setDeleting(false);}
 };
 const renameCancelled=useRef(false);
 const saveAlias=()=>{if(!renaming)return;const alias=renaming.value.trim();if(!alias){toast?.addToast({title:"Enter a column title.",variant:"error"});return;}void design.save(renaming.key,{alias},management.columnWidth(renaming.key));setRenaming(null);};
 const recordLabel=(row:MasterDataRow|undefined,id:string)=>text((row?.first_name?[row.first_name,row.last_name].filter(Boolean).join(" "):null)??row?.plate_number??row?.name??row?.code??row?.sku??id);
 const autoFit=()=>{const canvas=document.createElement("canvas"),context=canvas.getContext("2d");if(!context)return;const sample=viewport.current?.querySelector("td:not(.spreadsheet-gutter)"),style=sample?getComputedStyle(sample):null;context.font=style?`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`:"12px Arial";for(const column of visible){const field=fields.find(field=>field.key===column.key)!;const values=[design.columns[column.key]?.alias??column.title,...rows.map(row=>display(row,field))];const width=field.kind==="images"?180:Math.max(60,Math.min(600,Math.ceil(values.reduce((width,value)=>Math.max(width,context.measureText(value).width),0)+32)));void management.saveWidth(column.key,width);}};
 useEffect(()=>{const element=viewport.current;if(!element||!active)return;const fit=()=>autoFit();element.addEventListener("sheet:auto-fit",fit);return()=>element.removeEventListener("sheet:auto-fit",fit);},[active,rows,visible,management.columnWidth]);
 const copy=async()=>{const lines=rows.flatMap(row=>{const values=visible.filter(column=>isSelected(row.id,column.key)).map(column=>display(row,fields.find(field=>field.key===column.key)!));return values.length?[values.join("\t")]:[];});try{await navigator.clipboard.writeText(lines.join("\n"));}catch{toast?.addToast({title:"Clipboard access is unavailable.",variant:"error"});}};
 return <div id={`trip-sheet-${sheetId}`} className="database-spreadsheet flex min-h-0 min-w-0 flex-1 flex-col" hidden={!active}>
  <ReportCellFormattingToolbar headerSelection={!!headerSelection} selectedCellCount={canEdit?selectedCount:0} selectionIsBold={!!format.bold} selectionIsItalic={!!format.italic} selectionIsUnderlined={!!format.underline} selectedFontSize={format.fontSize??12} selectedTextColor={format.color??null} selectedBackgroundColor={format.backgroundColor??null} onApply={apply} actions={<>{management.controls}{management.hiddenControl}{rowSelection.size>0&&<span className="px-1 text-[10px] text-slate-500" role="status">{[...rowSelection].filter(id=>keys.includes(id)).length} records selected</span>}{keys.some(id=>rowSelection.has(id)&&dataSource?.canDeleteRow?.(rows.find(row=>row.id===id)!)!==false)&&canEdit&&<button type="button" title="Delete selected records" aria-label="Delete selected database records" disabled={!!draft||saving||deleting} onClick={deleteSelected} className="inline-flex h-7 w-7 items-center justify-center rounded-full text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4"/></button>}</>}/>
  {error&&<div role="alert" className="flex shrink-0 items-center gap-2 px-3 py-1 text-xs text-rose-700">{error}<button onClick={()=>{invalidate();setRefresh(value=>value+1);}} className="underline">Retry</button></div>}
  {deleteError&&<div role="alert" className="px-3 py-1 text-xs text-rose-700">{deleteError}</div>}
  <div ref={element=>{viewport.current=element;management.attachViewport(element);}} {...management.viewportProps} onPointerDownCapture={event=>{if(event.button===2&&(event.target as Element).closest("tbody td"))event.preventDefault();}} tabIndex={0} onKeyDown={keyboard} className={`${REPORT_GRID_VIEWPORT_CLASS} ${SPREADSHEET_ATTACHED_VIEWPORT_CLASS} database-grid w-full`}>
   <table ref={surface} style={management.tableStyle} className="spreadsheet-grid report-data-table w-full border-collapse text-left text-[12px]">{management.colgroup}
    <thead><tr><th className={`${REPORT_GRID_HEADER_CELL_CLASS} spreadsheet-gutter !left-0 z-40 !px-0 text-center`} style={{width:SPREADSHEET_NUMBER_GUTTER_WIDTH}}>{rowSelection.size>0?<input type="checkbox" checked aria-label="Clear selected rows" onChange={()=>{setCells(new Set());setRowSelection(new Set());setColumnSelection(new Set());setHeaderSelection(null);}} className="h-3.5 w-3.5 cursor-pointer align-middle accent-blue-600"/>:<button title="Clear selection" aria-label="Clear database selection" className="w-full" onClick={()=>{setCells(new Set());setRowSelection(new Set());setColumnSelection(new Set());setHeaderSelection(null);}}>#</button>}</th>{visible.map(column=><th key={column.key} {...management.headerProps(column.key)} data-spreadsheet-column={column.key} className={`${REPORT_GRID_HEADER_CELL_CLASS} cursor-pointer ${columnSelection.has(column.key)||headerSelection===column.key?"outline outline-2 outline-inset outline-blue-500":""}`} style={{...management.headerProps(column.key).style,...reportHeaderAppearance(design.columns[column.key]),position:"sticky",top:0,textAlign:"left",verticalAlign:"middle"}} onClick={event=>{if(!(event.target as Element).closest("button,[role=menu],[role=separator]"))selectHeader(column.key);}} onContextMenu={event=>{event.preventDefault();selectHeader(column.key);management.openColumnMenu(column.key,event.clientX,event.clientY);}}><div className="database-header-content">{renaming?.key===column.key?<input autoFocus aria-label={`Rename ${column.title}`} maxLength={100} className="database-editor" value={renaming.value} onFocus={event=>event.currentTarget.select()} onClick={event=>event.stopPropagation()} onChange={event=>setRenaming({key:column.key,value:event.target.value})} onBlur={()=>{if(!renameCancelled.current)saveAlias();renameCancelled.current=false;}} onKeyDown={event=>{event.stopPropagation();if(event.key==="Enter"){event.preventDefault();saveAlias();}if(event.key==="Escape"){event.preventDefault();renameCancelled.current=true;setRenaming(null);}}}/>:<span data-spreadsheet-header-title title={design.columns[column.key]?.alias??column.title}>{design.columns[column.key]?.alias??column.title}</span>}</div><span className="database-header-controls">{management.headerControls(column)}</span></th>)}</tr></thead>
    <tbody>{virtual.map(item=>item.spacer!==undefined?<tr key={`spacer:${item.index}`} aria-hidden="true"><td colSpan={visible.length+1} style={{height:item.spacer,padding:0,border:0}}/></tr>:(()=>{const row=rows[item.index];return <tr key={row.id} data-virtual-index={item.index} className="report-data-row" style={{height:30}}><td className="spreadsheet-gutter sticky left-0 z-30 border-b border-r border-slate-200 bg-slate-50 px-0 text-center text-xs text-slate-400"><div className="flex min-h-7 items-center justify-center" onContextMenu={event=>{event.preventDefault();if(!rowSelection.has(row.id))selectRow(row.id);setMenu({x:event.clientX,y:event.clientY,id:row.id,field:visible[0]?.key??"",row:true});}}>{rowSelection.size>0?<input type="checkbox" aria-label={`Select row ${item.index+1}`} checked={rowSelection.has(row.id)} onChange={()=>{}} onClick={event=>{event.stopPropagation();selectRow(row.id,{ctrlKey:true,shiftKey:event.shiftKey});}} className="h-3.5 w-3.5 cursor-pointer accent-blue-600"/>:<button className="w-full" aria-label={`Select row ${item.index+1}`} aria-pressed={false} title="Select row; Ctrl/Cmd-click toggles, Shift-click extends" onClick={event=>selectRow(row.id,event)}><SpreadsheetRowNumber value={item.index+1}/></button>}</div></td>{visible.map(column=>{const field=fields.find(field=>field.key===column.key)!;const editing=draft?.id===row.id&&draft.field===field.key;return <td key={field.key} {...cellProps(row.id,field.key)}>{field.kind==="images"?<TruckImagesCell token={token} truckId={row.id} canEdit={canEdit} onManage={()=>onImage?.(row)}/>:editing?field.kind==="relation"?<SearchableRelationshipEditor token={token} kind={field.source as RelationshipKind} value={display(row,field)} onSelect={option=>{const next={...draft!,value:option.id};setDraft(next);void commit(next);}} onCommitBlur={()=>{if(!saveLock.current)setDraft(null);}} onCancel={()=>setDraft(null)}/>:field.kind==="select"||field.kind==="boolean"?<select autoFocus disabled={saving} className="database-editor" value={draft.value} onChange={event=>setDraft({...draft,value:event.target.value})} onBlur={()=>void commit(draft)} onKeyDown={editorKeys}><option value=""/>{(field.kind==="boolean"?["true","false"]:field.options??[]).map(value=><option key={value} value={value}>{value}</option>)}</select>:field.kind==="textarea"?<textarea autoFocus rows={Math.max(1,Math.min(5,draft.value.split("\n").length))} disabled={saving} className="database-editor resize-none" value={draft.value} onChange={event=>setDraft({...draft,value:event.target.value})} onBlur={()=>void commit(draft)} onKeyDown={editorKeys}/>:<input autoFocus disabled={saving} type="text" inputMode={field.kind==="number"?"decimal":undefined} onWheel={event=>{if(field.kind==="number")event.stopPropagation();}} className="database-editor" value={draft.value} onChange={event=>setDraft({...draft,value:event.target.value})} onBlur={()=>void commit(draft)} onKeyDown={editorKeys}/>:<div className="flex min-h-5 items-center gap-1"><span className="min-w-0 flex-1">{dataSource?.renderCell?.(row,field)??display(row,field)}</span></div>}{cellFeedback[keyFor(row.id,field.key)]&&<span role="status" className={`database-cell-feedback ${cellFeedback[keyFor(row.id,field.key)]==="error"?"is-error":""}`}>{cellFeedback[keyFor(row.id,field.key)]==="saved"?"Saved":"Save failed"}</span>}</td>;})}</tr>;})())}
     <SpreadsheetBlankRows count={loading&&!rows.length?Math.max(8,filler.count):filler.count} loading={loading&&!rows.length} start={rows.length+1} height={30} gutterWidth={SPREADSHEET_NUMBER_GUTTER_WIDTH} columns={visible.map(column=>({key:column.key,width:management.columnWidth(column.key)}))} cellProps={(number,field)=>cellProps(`virtual:${resource}:${number}`,field)} onRowSelect={(number,event)=>selectRow(`virtual:${resource}:${number}`,event)}/>
    </tbody>
   </table>
  </div>
  <div className="flex shrink-0 items-center gap-2 bg-white px-2 text-xs text-slate-500">{more&&<span role="status" className="inline-flex items-center gap-1"><LoaderCircle className="h-3 w-3 animate-spin"/>Loading more records</span>}{lastPage>0&&lastPage<pages&&!more&&<button className="py-1 hover:text-blue-700" onClick={()=>void loadMore()}>Load more</button>}<span className="sr-only">{rows.length} of {total} records loaded</span></div>
  {menu&&<SpreadsheetCellContextMenu x={menu.x} y={menu.y} count={selectedCount} format={format} canFormat={canEdit} onApply={apply}
    actions={<>
      <button role="menuitem" className={cellMenuItemClass} disabled={!canEdit||!keys.includes(menu.id)||(menu.row&&dataSource?.canEditRow?.(rows.find(row=>row.id===menu.id)!)===false)||(!menu.row&&(fields.find(field=>field.key===menu.field)?.readOnly||dataSource?.canEditField?.(rows.find(row=>row.id===menu.id)!,fields.find(field=>field.key===menu.field)!)===false))} onClick={()=>{const row=rows.find(row=>row.id===menu.id);if(row){if(menu.row)onEdit(row);else begin(menu.id,menu.field);}setMenu(null);}}>{menu.row&&dataSource?"Edit User":menu.row?"Edit record":"Edit cell"}</button>
      {dataSource?.onViewProfile&&keys.includes(menu.id)&&<button role="menuitem" className={cellMenuItemClass} onClick={()=>{dataSource.onViewProfile!(rows.find(row=>row.id===menu.id)!);setMenu(null);}}>View Profile</button>}
      {dataSource?.onViewActivity&&keys.includes(menu.id)&&<button role="menuitem" className={cellMenuItemClass} onClick={()=>{dataSource.onViewActivity!(rows.find(row=>row.id===menu.id)!);setMenu(null);}}>Activity History</button>}
      <button role="menuitem" className={cellMenuItemClass} onClick={()=>{void copy();setMenu(null);}}>Copy selection</button>
      {onImage&&keys.includes(menu.id)&&<button role="menuitem" className={cellMenuItemClass} onClick={()=>{const row=rows.find(row=>row.id===menu.id);if(row)onImage(row);setMenu(null);}}>Manage images</button>}
      {menu.row&&canEdit&&keys.some(id=>rowSelection.has(id)&&dataSource?.canDeleteRow?.(rows.find(row=>row.id===id)!)!==false)&&<button role="menuitem" className={cellMenuItemClass} disabled={!!draft||saving||deleting} onClick={()=>{deleteSelected();setMenu(null);}}>{dataSource?"Delete User(s)":"Delete selected records"}</button>}
    </>}
    onSelectRow={()=>{if(!rowSelection.has(menu.id))selectRow(menu.id);}} onSelectColumn={()=>{if(!columnSelection.has(menu.field))selectColumn(menu.field);}} onClose={()=>setMenu(null)}/>}
  {confirm&&<DatabaseDeleteDialog noun={dataSource?.recordNoun} description={dataSource?.deleteDescription} records={confirm.map(id=>({id,label:recordLabel(rows.find(row=>row.id===id),id)}))} deleting={deleting} error={deleteError} onCancel={()=>{if(!deleteLock.current)setConfirm(null);}} onDelete={()=>void remove()}/>}

 </div>;
}
