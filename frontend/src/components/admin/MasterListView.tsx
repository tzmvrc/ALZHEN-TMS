import {readTripRowHeight as readRowHeight,tripRowHeightStorageKey as rowHeightStorageKey} from "./tripRowHeight";
import TripTableColumnResizeHandle from "./TripTableColumnResizeHandle";
import {TripTableLoading} from "./TripTableLoading";
import {selectTripAxis,selectTripCells,tripSelectionText} from "./trip-table-selection";
import TripTableDropdownEditor from "./TripTableDropdownEditor";
import {TripTableFormatActions} from "./TripTableMenus";
import {tripTableShortcut,TripTableContextMenu,TripTableMenuItem as MenuItem,TripTableFormatDialog,TripTableCell,TripTableHeader} from "./TripTableShared";
import {TripTableTextEditor} from "./TripTableTextEditor";
import {useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore,type CSSProperties,type KeyboardEvent,type MouseEvent,type PointerEvent as ReactPointerEvent} from "react";
import {ChevronDown,ChevronRight,LoaderCircle,Pencil,X} from "lucide-react";
import {createPortal} from "react-dom";
import {useAuth} from "../../context/AuthContext";
import {useAccountPreferences} from "../account/useAccountPreferences";
import {useToast} from "../ui/Toast";
import type {AdminNotificationTarget} from "../../services/notification.service";
import {fetchReportRows} from "../../services/report.service";
import {fetchDropdownOptions} from "../../services/dropdown-option.service";
import {invalidateApiCache} from "../../services/api.service";
import {subscribeToAdminRealtime} from "../../services/realtime.service";
import {collaborationSnapshot,focusCollaborationCell,joinCollaborationRoom,subscribeCollaboration,subscribeCollaborationEvents,type CellTarget} from "../../services/collaboration.service";
import {beginCellDraft,cellDraftSnapshot,subscribeCellDraft,type DraftTarget} from "../../services/cell-draft.service";
import {fetchMasterDispatches,fetchMasterChildren,fetchMasterChildrenBatch,fetchMasterDeleteDispatchTrips,saveMasterChanges,type MasterChange,type MasterDispatch,type MasterTrip,type MasterTruckAssignment,type MasterDr,type MasterLine,type MasterValues,type MasterPage} from "../../services/master-list-hierarchy.service";
import {TopbarSearchRegistration} from "./topbarSearch";
import ColumnFinder from "./ColumnFinder";
import {useRegisterTopbarAction} from "./topbarActions";
import {useRegisterTopbarView,useStoredPageView} from "./topbarView";
import {SpreadsheetHiddenColumns} from "./SpreadsheetWorkspace";
import {SpreadsheetBottomControlsContext} from "./SpreadsheetBottomControlsContext";
import {useSpreadsheetViewport} from "./SpreadsheetPresentation";
import {useSpreadsheetDragSelection} from "./useSpreadsheetDragSelection";
import {useMasterListFormatting} from "./useMasterListFormatting";
import {useSharedTableWidths} from "./useSharedTableWidths";
import MasterListFormatToolbar from "./MasterListFormatToolbar";
import MasterListDeleteDialog,{type MasterListDeletePlan} from "./MasterListDeleteDialog";
import {ViewerGroup} from "./TableViewers";
import {parseSpreadsheetClipboard,reorderColumnKeys} from "./ReportSpreadsheetUtils";
import "./MasterListView.css";

type Group="booking"|"cargo"|"incident"|"delivery"|"all";
type Column={key:string;title:string;group:Exclude<Group,"all">;width:number};
const identityColumn:Column={key:"dispatch_number",title:"Dispatch no.",group:"booking",width:280};
const columns:Column[]=[
  {key:"remarks",title:"Comments",group:"booking",width:210},{key:"trip_type",title:"Trip type",group:"booking",width:145},
  {key:"letter_status",title:"Letter status",group:"booking",width:150},{key:"plate_number",title:"Plate no.",group:"booking",width:135},
  {key:"trucking_company",title:"Trucker GC Name",group:"booking",width:190},{key:"trip_number",title:"Trip no.",group:"booking",width:150},
  {key:"request_received_at",title:"Email date",group:"booking",width:145},{key:"added_by_name",title:"Added by",group:"booking",width:145},
  {key:"warehouse_code",title:"WH CODE",group:"cargo",width:115},{key:"warehouse_name",title:"Ship From",group:"cargo",width:170},
  {key:"store_name",title:"Ship To",group:"cargo",width:210},{key:"customer_name",title:"Customer Name",group:"cargo",width:210},
  {key:"dr_number",title:"DR",group:"cargo",width:150},{key:"sap_so_number",title:"SAP SO No.",group:"cargo",width:155},
  {key:"customer_po_number",title:"Customer PO",group:"cargo",width:170},{key:"internal_po_number",title:"PO NO.",group:"cargo",width:170},
  {key:"source_product_category",title:"Product Category",group:"cargo",width:170},{key:"customer_model",title:"Customer Model",group:"cargo",width:180},
  {key:"quantity",title:"Qty",group:"cargo",width:100},{key:"cbm",title:"Total CBM",group:"cargo",width:125},
  {key:"source_province",title:"Province",group:"cargo",width:145},{key:"source_city",title:"City",group:"cargo",width:145},
  {key:"incident_date",title:"Incident Date",group:"incident",width:145},{key:"backload_reason",title:"Backload Reason",group:"incident",width:200},
  {key:"backload_number_of_boxes",title:"No. of Box (Backload)",group:"incident",width:175},{key:"ir_status",title:"IR Status",group:"incident",width:145},
  {key:"ir_submitted_date",title:"IR Submitted Date",group:"incident",width:170},{key:"backload_comments",title:"Backload comments",group:"incident",width:210},
  {key:"offload_number_of_boxes",title:"No. of Box (Offload)",group:"incident",width:170},{key:"offload_reason",title:"Offload Reason",group:"incident",width:195},
  {key:"delivery_status",title:"Delivery status",group:"delivery",width:165},{key:"delivery_completed_date",title:"Delivery completed date",group:"delivery",width:190},
  {key:"pod_status",title:"POD status",group:"delivery",width:160},{key:"signed_dr_upload_date",title:"Signed DR uploading date to Google Drive",group:"delivery",width:255},
  {key:"transmittal_date",title:"Transmittal date",group:"delivery",width:165},{key:"tms_date",title:"TMS date",group:"delivery",width:145},
  {key:"tms_done_by_name",title:"TMS done by",group:"delivery",width:160},{key:"pod_ac_shipping_date",title:"POD/AC shipping date",group:"delivery",width:185},
  {key:"lbc_tracking_number",title:"LBC tracking no.",group:"delivery",width:180},{key:"pod_remarks",title:"POD comments",group:"delivery",width:200},
  {key:"invoice_number",title:"Invoice no.",group:"delivery",width:150},
];
const groupLabels:{key:Group;label:string;fullName:string}[]=[
  {key:"booking",label:"Booking · Geography",fullName:"Booking and Geography"},{key:"cargo",label:"Warehouse · Order · Cargo",fullName:"Warehouse, Order and Cargo"},
  {key:"incident",label:"Incident · Backload",fullName:"Incident and Backload"},{key:"delivery",label:"Delivery · POD · Billing",fullName:"Delivery, POD and Billing"},{key:"all",label:"All 42",fullName:"All 42 columns"},
];
type DisplayRow={kind:"dispatch"|"trip"|"truck"|"unallocated"|"dr"|"line";id:string;dispatch:string;data:MasterDispatch|MasterTrip|MasterTruckAssignment|MasterDr|MasterLine;label:string;sub:string;values:MasterValues;depth:number;canOpen:boolean;open:boolean;addedBy:string;drCount:number;deliveredCount:number};
const masterCellTarget=(row:DisplayRow,column:string,status:"selected"|"editing"):CellTarget|null=>{
  const drLine=row.kind==="dr"?(row.data as MasterDr).lines[0]?.id:undefined;
  const source=row.kind==="dispatch"||row.kind==="trip"||row.kind==="unallocated"?"trips":row.kind==="truck"?"trip_truck_assignments":row.kind==="dr"&&!drLine?"trip_stops":"trip_line_items";
  const recordId=row.kind==="dispatch"?(row.data as MasterDispatch).trip_ids[0]:row.kind==="dr"?drLine??(row.data as MasterDr).stop_id:row.kind==="line"?(row.data as MasterLine).id:row.id;
  if(!recordId||!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(recordId))return null;
  const tripId=row.kind==="dispatch"?recordId:(row.data as MasterTrip|MasterTruckAssignment|MasterDr|MasterLine).trip_id;
  const stopId=row.kind==="dr"||row.kind==="line"?(row.data as MasterDr|MasterLine).stop_id:undefined;
  return {table:"master-list",source,recordId,tripId,...(stopId?{stopId}:{}),field:column,status};
};
const masterPresenceKey=(target:CellTarget)=>`${target.source}:${target.recordId}:${target.field}`;
const isNumber=(key:string)=>key==="quantity"||key==="cbm"||key.includes("number_of_boxes");
const statusColor=(value:string)=>{
  const status=value.toUpperCase().replace(/[_-]+/g," ").trim();
  if(/DELIVERED|COMPLETED/.test(status))return "green";
  if(/BACKLOAD/.test(status))return "red";
  if(/OFFLOAD/.test(status))return "purple";
  if(/CANCEL/.test(status))return "grey";
  if(/ARRIVED/.test(status))return "arrived";
  if(/IN TRANSIT|TRANSIT/.test(status))return "transit";
  if(/AT DISPATCH|DISPATCHED/.test(status))return "dispatcher";
  if(/PLANNED|PENDING/.test(status))return "planned";
  return "orange";
};
const statusLabel=(value:string)=>/delivered|completed/i.test(value)?"Delivered":/backload/i.test(value)?"Backload":/offload/i.test(value)?"Offload":/cancel/i.test(value)?"Cancelled":/planned/i.test(value)?"Pending":value;
const otherValuesPreview=(value:string,detail?:string)=>detail?.startsWith(value+", ")?detail.slice(value.length+2):detail??"";
const canEdit=(kind:DisplayRow["kind"],field:string)=>kind==="dispatch"?["remarks","plate_number","trucking_company"].includes(field):kind==="dr"?["store_name","customer_name","delivery_status"].includes(field):field==="quantity";
const canEditRow=(row:DisplayRow,field:string)=>["dispatch","dr","line"].includes(row.kind)&&canEdit(row.kind,field)&&!(row.kind==="line"&&(row.data as MasterLine).read_only)&&!(row.kind==="dr"&&(row.data as MasterDr).read_only);
const masterDraftTarget=(row:DisplayRow,column:string):DraftTarget|null=>{
  if(!canEditRow(row,column))return null;
  if(!((row.kind==="dispatch"&&["remarks","plate_number","trucking_company"].includes(column))||(row.kind==="dr"&&["store_name","customer_name","delivery_status"].includes(column))||(row.kind==="line"&&column==="quantity")))return null;
  if(row.kind==="dr")return (row.data as MasterDr).stop_id?{table:"master-list",source:"trip_stops",recordId:(row.data as MasterDr).stop_id,tripId:(row.data as MasterDr).trip_id,stopId:(row.data as MasterDr).stop_id,field:column}:null;
  const cell=masterCellTarget(row,column,"editing");
  return cell?{table:cell.table,source:cell.source,recordId:cell.recordId,tripId:cell.tripId,stopId:cell.stopId,field:cell.field}:null;
};
function MasterDraftPreview({target,localEditing}:{target:DraftTarget;localEditing:boolean}){
  const identity=JSON.stringify(target),stable=useMemo(()=>JSON.parse(identity) as DraftTarget,[identity]);
  const subscribe=useCallback((notify:()=>void)=>subscribeCellDraft(stable,notify),[stable]);
  const read=useCallback(()=>cellDraftSnapshot(stable),[stable]);
  const peer=useSyncExternalStore(subscribe,read,read).at(-1);
  return peer?<span className={"ml-remote-draft"+(localEditing?" is-local-editing":"")} role="note" title={`${peer.name} is typing: ${peer.value}`} style={{color:peer.color}}>{localEditing?`${peer.name} is typing`:peer.value||"(blank draft)"}</span>:null;
}
const cellKey=(row:DisplayRow,field:string)=>row.kind+"|"+row.id+"|"+field;
const rowKey=(row:DisplayRow)=>row.kind+":"+row.id;
const tripDrs=(trip:MasterTrip)=>[...trip.drs,...trip.assignments.flatMap(assignment=>assignment.drs),...trip.unallocated_drs];
const mergeById=<T extends {id:string}>(left:T[],right:T[],merge:(a:T,b:T)=>T):T[]=>{
  const incoming=new Map(right.map(item=>[item.id,item]));
  const existing=new Set(left.map(item=>item.id));
  return [...left.map(item=>incoming.has(item.id)?merge(item,incoming.get(item.id)!):item),...right.filter(item=>!existing.has(item.id))];
};
const mergeDr=(left:MasterDr,right:MasterDr):MasterDr=>({...left,values:{...left.values,...right.values},lines:mergeById(left.lines,right.lines,(a,b)=>({...a,values:{...a.values,...b.values}}))});
const mergeTrips=(left:MasterTrip[],right:MasterTrip[])=>mergeById(left,right,(a,b)=>({...a,values:{...a.values,...b.values},drs:mergeById(a.drs,b.drs,mergeDr),flat_drs:a.flat_drs||b.flat_drs?mergeById(a.flat_drs??[],b.flat_drs??[],mergeDr):undefined,assignments:mergeById(a.assignments,b.assignments,(oldAssignment,newAssignment)=>({...oldAssignment,values:{...oldAssignment.values,...newAssignment.values},drs:mergeById(oldAssignment.drs,newAssignment.drs,mergeDr)})),unallocated_drs:mergeById(a.unallocated_drs,b.unallocated_drs,mergeDr)}));
const dispatchDrs=(children:Record<string,MasterTrip[]>,dispatch:string)=>(children[dispatch]??[]).flatMap(tripDrs);
const drBranchKeys=(dr:MasterDr)=>["dr:"+dr.id,...dr.lines.map(line=>"line:"+dr.id+":"+line.id)];
const tripBranchKeys=(trip:MasterTrip)=>["trip:"+trip.id,...trip.drs.flatMap(drBranchKeys),...trip.assignments.flatMap(assignment=>["truck:"+assignment.id,...assignment.drs.flatMap(drBranchKeys)]),...(trip.unallocated_drs.length?["unallocated:"+trip.id,...trip.unallocated_drs.flatMap(drBranchKeys)]:[])];
function rowBranchKeys(row:DisplayRow,children:Record<string,MasterTrip[]>):string[]{
  if(row.kind==="line")return [rowKey(row)];
  if(row.kind==="dr")return drBranchKeys(row.data as MasterDr);
  if(row.kind==="trip")return tripBranchKeys(row.data as MasterTrip);
  if(row.kind==="truck")return [rowKey(row),...(row.data as MasterTruckAssignment).drs.flatMap(drBranchKeys)];
  if(row.kind==="unallocated")return [rowKey(row),...(children[row.dispatch]??[]).find(trip=>trip.id===row.id)?.unallocated_drs.flatMap(drBranchKeys)??[]];
  return [rowKey(row),...(children[row.dispatch]??[]).flatMap(tripBranchKeys)];
}
const selectionKey=(row:string,column:string)=>row+"|"+column;
type FocusCell={row:string;column:string};
type MenuTarget={x:number;y:number;row?:string;column?:string;kind:"cell"|"row"|"column"};
const widthStorageKey="alzhen:master-list:widths:v1";
const readWidths=():Record<string,number>=>{try{const value=JSON.parse(localStorage.getItem(widthStorageKey)??"{}");return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}catch{return {};}};
const orderStorageKey="alzhen:master-list:order:v1";
const readOrder=()=>{try{const stored=JSON.parse(localStorage.getItem(orderStorageKey)??"[]");if(Array.isArray(stored)){const known=new Set(columns.map(column=>column.key));const ordered=stored.filter((key):key is string=>typeof key==="string"&&known.has(key));return [...new Set([...ordered,...columns.map(column=>column.key)])];}}catch{/* use default order */}return columns.map(column=>column.key);};
const pinStorageKey="alzhen:master-list:pins:v1";
const readPins=():Record<string,"left"|"right">=>{try{const value=JSON.parse(localStorage.getItem(pinStorageKey)??"{}");return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}catch{return {};}};
const alignStorageKey="alzhen:master-list:alignment:v1";
const readAlign=():Record<string,"left"|"center"|"right">=>{try{const value=JSON.parse(localStorage.getItem(alignStorageKey)??"{}");return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}catch{return {};}};


export default function MasterListView({createdTripReference,notificationDispatch,notificationTarget,onOpenTrip}:{createdTripReference?:string|null;notificationDispatch?:string|null;notificationTarget?:AdminNotificationTarget|null;onOpenTrip?:(tripId:string,stopId?:string|null)=>void}){
  const {accessToken,profile}=useAuth(),{addToast}=useToast(),admin=profile?.role==="ADMIN";
  const {preferences:accountPreferences}=useAccountPreferences(profile?.id??"anonymous");
  const excelFlat=accountPreferences.tableAppearance==="excel";
  const excelFlatRef=useRef(excelFlat);
  excelFlatRef.current=excelFlat;
  const notificationGroup=columns.find(column=>column.key===notificationTarget?.masterListCells?.[0]?.field)?.group??"booking";
  const collaboration=useSyncExternalStore(subscribeCollaboration,collaborationSnapshot,collaborationSnapshot);
  const sharedWidths=useSharedTableWidths("master-list",accessToken,["ADMIN","STAFF"].includes(profile?.role??""));
  const footerContext=useContext(SpreadsheetBottomControlsContext);
  const [viewMode,setViewMode]=useStoredPageView("trips:Master List","table",["visual","table"] as const);
  useRegisterTopbarView("trips:Master List",{value:viewMode==="visual"?"grid":"table",gridLabel:"Card view",tableLabel:"Table view",onChange:next=>setViewMode(next==="grid"?"visual":"table")});
  const [group,setGroup]=useState<Group>(excelFlat?"all":"booking"),[hidden,setHidden]=useState<string[]>([]);
  const modernGroup=useRef<Group>("booking"),previousAppearance=useRef(excelFlat);
  useLayoutEffect(()=>{
    if(previousAppearance.current===excelFlat)return;
    previousAppearance.current=excelFlat;
    if(excelFlat){modernGroup.current=group;setGroup("all");}
    else setGroup(modernGroup.current);
  },[excelFlat,group]);
  const [columnOrder,setColumnOrder]=useState<string[]>(readOrder);
  const [columnWidths,setColumnWidths]=useState<Record<string,number>>(readWidths);
  const [pins,setPins]=useState<Record<string,"left"|"right">>(readPins);
  const [columnAlign,setColumnAlign]=useState<Record<string,"left"|"center"|"right">>(readAlign);
  const [configuredRowHeight,setRowHeight]=useState(readRowHeight);
  const rowHeight=accountPreferences.tableAppearance==="excel"?({44:28,56:30,72:42}[configuredRowHeight]??30):configuredRowHeight;
  const identityWidth=columnWidths[identityColumn.key]??(excelFlat?170:280),gutterWidth=excelFlat?32:0,leadingWidth=identityWidth+gutterWidth,headerHeight=excelFlat?34:62;
  const dataGroup=excelFlat?"booking":group;
  const previousRowHeight=useRef(rowHeight);
  const [selectedCells,setSelectedCells]=useState<Set<string>>(()=>new Set()),[selectedRows,setSelectedRows]=useState<Set<string>>(()=>new Set()),[selectedColumns,setSelectedColumns]=useState<Set<string>>(()=>new Set());
  const [focusCell,setFocusCell]=useState<FocusCell|null>(null),[menu,setMenu]=useState<MenuTarget|null>(null);
  const [notificationHighlight,setNotificationHighlight]=useState<{row:string;field:string;key:string}|null>(null);
  const [hoveredPeer,setHoveredPeer]=useState<{name:string;status:string;left:number;top:number;below:boolean}|null>(null);
  const handledNotification=useRef("");
  const [formatDialog,setFormatDialog]=useState(false);
  const [barDraft,setBarDraft]=useState<{key:string;value:string}|null>(null);
  const [deletePlan,setDeletePlan]=useState<MasterListDeletePlan|null>(null);
  const [preparingDelete,setPreparingDelete]=useState(false);
  const preparingDeleteRef=useRef(false);
  const [bulkOpen,setBulkOpen]=useState(false),[bulkField,setBulkField]=useState(""),[bulkValue,setBulkValue]=useState("");
  const [sort,setSort]=useState<{key:string;direction:1|-1}|null>(null),[draggedColumn,setDraggedColumn]=useState<string|null>(null);
  const [page,setPage]=useState(1),[search,setSearch]=useState(""),[appliedSearch,setAppliedSearch]=useState("");
  const [mode,setMode]=useState<"collapse"|"drs"|"lines">("collapse");
  const [data,setData]=useState<MasterPage|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const [loadedScope,setLoadedScope]=useState("");
  const [loadedRefresh,setLoadedRefresh]=useState(-1);
  const [children,setChildren]=useState<Record<string,MasterTrip[]>>({}),[childLoading,setChildLoading]=useState<Record<string,boolean>>({});
  const [openDispatch,setOpenDispatch]=useState<Record<string,boolean>>({}),[openTrip,setOpenTrip]=useState<Record<string,boolean>>({}),[openTruck,setOpenTruck]=useState<Record<string,boolean>>({}),[openDr,setOpenDr]=useState<Record<string,boolean>>({});
  const [editMode,setEditMode]=useState(false),[editing,setEditing]=useState<string|null>(null),[draft,setDraft]=useState("");
  const [editError,setEditError]=useState("");
  const [changes,setChanges]=useState<Record<string,MasterChange>>({}),[saving,setSaving]=useState(false),[panel,setPanel]=useState<DisplayRow|null>(null);
  const [saveError,setSaveError]=useState("");
  const [panelDrafts,setPanelDrafts]=useState<Record<string,string>>({});
  const [history,setHistory]=useState<{past:Record<string,MasterChange>[];future:Record<string,MasterChange>[]}>({past:[],future:[]});
  const [scrollTop,setScrollTop]=useState(0),[viewportWidth,setViewportWidth]=useState(1200),[viewportHeight,setViewportHeight]=useState(548),[autoFit,setAutoFit]=useState(true),[refresh,setRefresh]=useState(0),[exporting,setExporting]=useState(false);
  const [statusOptions,setStatusOptions]=useState<string[]>([]);
  const loadedTripIds=useRef(new Set<string>());
  const viewport=useRef<HTMLDivElement>(null),headers=useRef(new Map<string,HTMLDivElement>()),anchor=useRef<FocusCell|null>(null),resizing=useRef<{key:string;x:number;width:number}|null>(null);
  const cancelEdit=useRef(false);
  const pendingRemoteRefresh=useRef(false);
  const liveDraft=useRef<ReturnType<typeof beginCellDraft>|null>(null);
  const panelLiveDraft=useRef<ReturnType<typeof beginCellDraft>|null>(null);
  const barLiveDraft=useRef<ReturnType<typeof beginCellDraft>|null>(null);
  useEffect(()=>{if(!editing){liveDraft.current?.close();liveDraft.current=null;}},[editing]);
  useEffect(()=>{if(!panel){panelLiveDraft.current?.close();panelLiveDraft.current=null;}},[panel]);
  useEffect(()=>()=>{liveDraft.current?.close();panelLiveDraft.current?.close();barLiveDraft.current?.close();},[]);
  useEffect(()=>{
    const clearOutside=(event:globalThis.PointerEvent)=>{
      const target=event.target;
      if(!(target instanceof Element))return;
      if(target.closest(".ml-menu,.ml-confirm,.ml-format-dialog,.ml-panel,.ml-save-bar,.ml-card-top,.al-topbar,.spreadsheet-footer"))return;
      if(target.closest(".ml-viewport .ml-cell,.ml-viewport .ml-identity,.ml-viewport .ml-head-cell,.ml-action-rail"))return;
      setSelectedCells(new Set());setSelectedRows(new Set());setSelectedColumns(new Set());setFocusCell(null);setNotificationHighlight(null);anchor.current=null;
    };
    document.addEventListener("pointerdown",clearOutside);
    return()=>document.removeEventListener("pointerdown",clearOutside);
  },[]);
  const seenCreated=useRef<string|null>(null);
  useEffect(()=>{if(!accessToken)return;let live=true;fetchDropdownOptions(accessToken).then(options=>{if(live)setStatusOptions(options.filter(option=>option.field_key==="delivery_status"&&option.active).map(option=>option.option_value));}).catch(()=>{});return()=>{live=false;};},[accessToken]);
  useEffect(()=>{const node=viewport.current;if(!node)return;const fit=()=>setAutoFit(value=>!value);node.addEventListener("sheet:auto-fit",fit);return()=>node.removeEventListener("sheet:auto-fit",fit);},[]);
  useEffect(()=>{const node=viewport.current;if(!node)return;const resize=new ResizeObserver(()=>{setViewportWidth(node.clientWidth);setViewportHeight(node.clientHeight);});resize.observe(node);return()=>resize.disconnect();},[]);
  useEffect(()=>{const refreshList=()=>setRefresh(value=>value+1);window.addEventListener("alzhen:trip-imported",refreshList);return()=>window.removeEventListener("alzhen:trip-imported",refreshList);},[]);
  useEffect(()=>{let timer:ReturnType<typeof setTimeout>|undefined;const sources=["trips","trip_stops","trip_line_items","trip_truck_assignments"];const schedule=()=>{if(Object.keys(changes).length){pendingRemoteRefresh.current=true;return;}if(timer)return;timer=setTimeout(()=>{timer=undefined;invalidateApiCache("/trips/master-list");setRefresh(value=>value+1);},180);};const unsubscribe=subscribeCollaborationEvents(event=>{if(event.kind==="connected"||event.kind==="commit"&&sources.includes(event.commit.source))schedule();});const stopFeed=subscribeToAdminRealtime(event=>{if(event.kind==="resume"||event.kind==="batch"&&event.tables.some(table=>sources.includes(table))||event.kind==="recovered"&&sources.includes(event.table))schedule();else if(event.kind==="change"&&sources.includes(event.payload.table)){const record=event.payload.new??event.payload.old,tripId=String(record?.trip_id??(event.payload.table==="trips"?record?.id:"")??"");if(!tripId||loadedTripIds.current.has(tripId))schedule();}});return()=>{clearTimeout(timer);unsubscribe();stopFeed();};},[changes]);
  useEffect(()=>{let pending:ReturnType<typeof setTimeout>|undefined,message="";const unsubscribe=subscribeCollaborationEvents(event=>{
    if(event.kind!=="layout"||event.table!=="master-list"||event.actorId===profile?.id)return;
    const name=collaborationSnapshot().viewers?.["master-list"]?.find(viewer=>viewer.userId===event.actorId)?.name??"A collaborator";
    message=`${name} updated the Master List layout.`;
    if(pending)return;
    pending=setTimeout(()=>{pending=undefined;addToast({variant:"info",activity:true,title:"Master List layout updated",description:message,duration:5500,notificationKey:"master-list-layout"});},400);
  });return()=>{clearTimeout(pending);unsubscribe();};},[profile?.id,addToast]);
  useEffect(()=>{if(!Object.keys(changes).length&&pendingRemoteRefresh.current){pendingRemoteRefresh.current=false;invalidateApiCache("/trips/master-list");setRefresh(value=>value+1);}},[changes]);
  useEffect(()=>{if(!createdTripReference||seenCreated.current===createdTripReference)return;seenCreated.current=createdTripReference;queueMicrotask(()=>{setSearch(createdTripReference);setAppliedSearch(createdTripReference);setPage(1);setRefresh(value=>value+1);});},[createdTripReference]);
  useEffect(()=>{if(!notificationDispatch)return;queueMicrotask(()=>{setSearch(notificationDispatch);setAppliedSearch(notificationDispatch);setPage(1);setRefresh(value=>value+1);});},[notificationDispatch,notificationTarget?.navigationKey]);
  useEffect(()=>{if(!notificationTarget?.masterListCells?.length||handledNotification.current===notificationTarget.navigationKey)return;setGroup(notificationGroup);setHidden(current=>current.filter(key=>!notificationTarget.masterListCells?.some(cell=>cell.field===key)));setNotificationHighlight(null);},[notificationTarget,notificationGroup]);
  const shown=useMemo(()=>{const visible=columnOrder.map(key=>columns.find(col=>col.key===key)).filter((col):col is Column=>col!==undefined&&(group==="all"||col.group===group)&&(col.key==="trip_number"?excelFlat:!hidden.includes(col.key)));return [...visible.filter(col=>pins[col.key]==="left"),...visible.filter(col=>!pins[col.key]),...visible.filter(col=>pins[col.key]==="right")];},[group,hidden,columnOrder,pins,excelFlat]);
  const formatSelection=useMemo(()=>({cells:selectedCells,rows:selectedRows,columns:selectedColumns}),[selectedCells,selectedRows,selectedColumns]);
  const formatWidth=useCallback((key:string)=>key===identityColumn.key?columnWidths[key]??identityColumn.width:columnWidths[key]??columns.find(col=>col.key===key)?.width??150,[columnWidths]);
  const formatting=useMasterListFormatting(accessToken,profile?.role,formatSelection,formatWidth);
  const sharedDesign=formatting.design;
  useEffect(()=>{
    if(!sharedDesign.loaded||resizing.current||draggedColumn)return;
    const layout=sharedDesign.columns,keys=columns.map(column=>column.key);
    const order=[...keys].sort((a,b)=>(layout[a]?.position??1001)-(layout[b]?.position??1001));
    const hiddenKeys=keys.filter(key=>layout[key]?.hidden);
    const nextPins=Object.fromEntries(keys.flatMap(key=>layout[key]?.pin?[[key,layout[key].pin]]:[])) as Record<string,"left"|"right">;
    const nextAlign=Object.fromEntries(keys.flatMap(key=>layout[key]?.alignment?[[key,layout[key].alignment]]:[])) as Record<string,"left"|"center"|"right">;
    const height=layout[identityColumn.key]?.rowHeights?.__all;
    setColumnOrder(current=>current.join("\u0000")===order.join("\u0000")?current:order);
    setHidden(current=>current.join("\u0000")===hiddenKeys.join("\u0000")?current:hiddenKeys);
    setPins(current=>JSON.stringify(current)===JSON.stringify(nextPins)?current:nextPins);
    setColumnAlign(current=>JSON.stringify(current)===JSON.stringify(nextAlign)?current:nextAlign);
    setRowHeight(current=>current===(height&&[44,56,72].includes(height)?height:56)?current:height&&[44,56,72].includes(height)?height:56);
  },[sharedDesign.loaded,sharedDesign.columns,draggedColumn]);
  useEffect(()=>{if(!sharedWidths.loaded||resizing.current)return;setColumnWidths(current=>({...current,...sharedWidths.widths}));},[sharedWidths.loaded,sharedWidths.widths]);
  useEffect(()=>{viewport.current?.scrollTo({left:0});},[group,hidden]);
  const finderColumns=useMemo(()=>columns.map(col=>({key:col.key,title:col.title,index:shown.findIndex(item=>item.key===col.key),hidden:!shown.some(item=>item.key===col.key)})),[shown]);
  const reveal=useCallback((key:string)=>{setHidden(current=>current.filter(item=>item!==key));void sharedDesign.save(key,{hidden:false},formatWidth(key));setGroup("all");},[sharedDesign,formatWidth]);
  const finder=useMemo(()=>({value:search,placeholder:"Search trips or columns...",onSearch:(value:string)=>{setSearch(value);setAppliedSearch(value);setPage(1);}}),[search]);
  useEffect(()=>{const timer=setTimeout(()=>{setAppliedSearch(search);setPage(1);},350);return()=>clearTimeout(timer);},[search]);
  const pageScope=useRef("");
  useEffect(()=>{if(!accessToken)return;let live=true;const scope=`${page}\u0000${appliedSearch}\u0000${dataGroup}`,scopeChanged=pageScope.current!==scope;pageScope.current=scope;queueMicrotask(()=>{if(live){setLoading(true);setError("");}});
    fetchMasterDispatches(accessToken,{page,search:appliedSearch,group:dataGroup}).then(async result=>{if(!live)return;setData(result);setLoadedScope(scope);setLoadedRefresh(refresh);setLoading(false);if(scopeChanged){setOpenDispatch({});setOpenTrip({});setOpenTruck({});setOpenDr({});setChildren({});setMode("collapse");setSelectedCells(new Set());setSelectedRows(new Set());setSelectedColumns(new Set());setFocusCell(null);viewport.current?.scrollTo({top:0});return;}if(excelFlatRef.current)return;const opened=result.rows.map(row=>row.dispatch_number).filter(dispatch=>openDispatch[dispatch]);if(!opened.length)return;try{const updated=await fetchMasterChildrenBatch(accessToken,opened,dataGroup);if(live)setChildren(current=>({...current,...updated}));}catch{if(live)addToast({variant:"warning",title:"Dispatch details may be outdated",description:"Refresh this dispatch to see its latest rows."});}})
      .catch(cause=>{if(live){setError(cause instanceof Error?cause.message:"Unable to load dispatches.");setLoading(false);}});return()=>{live=false;};
  },[accessToken,page,appliedSearch,dataGroup,refresh]);
  const loadChildren=useCallback(async(dispatch:string)=>{if(!accessToken||children[dispatch]||childLoading[dispatch])return;setChildLoading(current=>({...current,[dispatch]:true}));try{const loaded=await fetchMasterChildren(accessToken,dispatch,group);setChildren(current=>({...current,[dispatch]:loaded}));setSelectedRows(current=>{if(!current.has("dispatch:"+dispatch))return current;const next=new Set(current);for(const trip of loaded)for(const key of tripBranchKeys(trip))next.add(key);return next;});}catch(cause){addToast({variant:"error",title:"Could not load trips",description:cause instanceof Error?cause.message:undefined});}finally{setChildLoading(current=>({...current,[dispatch]:false}));}},[accessToken,children,childLoading,addToast,group]);
  const toggleDispatch=(dispatch:string)=>{const opening=!openDispatch[dispatch];setOpenDispatch(current=>({...current,[dispatch]:opening}));if(opening)void loadChildren(dispatch);};
  const toggleRow=(row:DisplayRow)=>{
    if(row.kind==="dispatch"){toggleDispatch(row.dispatch);return;}
    if(row.kind==="trip"){setOpenTrip(current=>({...current,[row.id]:!row.open}));return;}
    if(row.kind==="truck"||row.kind==="unallocated"){const key=row.kind==="truck"?row.id:"unallocated:"+row.id;setOpenTruck(current=>({...current,[key]:!row.open}));return;}
    if(row.kind==="dr")setOpenDr(current=>({...current,[row.id]:!row.open}));
  };
  const identityLabel=(row:DisplayRow)=>{
    if(row.kind==="trip"&&onOpenTrip)return <button type="button" className="ml-identity-label ml-trip-details-link" aria-label={`Open details for ${row.label}`} onClick={event=>{event.stopPropagation();onOpenTrip(row.id);}}><span className="ml-trip-number">{row.label}</span><span className="ml-trip-detail-bubble" aria-hidden="true">Open details</span></button>;
    if(row.canOpen)return <button type="button" className="ml-identity-label" aria-label={(row.open?"Collapse ":"Expand ")+row.label} aria-expanded={row.open} onClick={event=>{event.stopPropagation();toggleRow(row);}}>{row.label}</button>;
    return <strong>{row.label}</strong>;
  };
  const expandAll=async(next:"collapse"|"drs"|"lines")=>{setMode(next);setOpenTrip({});setOpenTruck({});setOpenDr({});if(next==="collapse"){setOpenDispatch({});return;}const ids=data?.rows.map(row=>row.dispatch_number)??[];setOpenDispatch(Object.fromEntries(ids.map(id=>[id,true])));const missing=ids.filter(id=>!children[id]);if(!accessToken||!missing.length)return;try{const loaded=await fetchMasterChildrenBatch(accessToken,missing,group);setChildren(current=>({...current,...loaded}));setSelectedRows(current=>{const updated=new Set(current);for(const [dispatch,trips] of Object.entries(loaded))if(current.has("dispatch:"+dispatch))for(const trip of trips)for(const key of tripBranchKeys(trip))updated.add(key);return updated;});}catch(cause){addToast({variant:"error",title:"Could not expand dispatches",description:cause instanceof Error?cause.message:undefined});}};
  const flatLoadKey=useRef("");
  useEffect(()=>{
    if(!excelFlat||!accessToken||!data||loading||loadedRefresh!==refresh||loadedScope!==`${page}\u0000${appliedSearch}\u0000${dataGroup}`)return;
    const ids=data.rows.map(row=>row.dispatch_number);
    const key=`${loadedScope}\u0000${refresh}\u0000${ids.join("\u0000")}`;
    if(flatLoadKey.current===key)return;
    const missing=ids;
    if(!missing.length){flatLoadKey.current=key;return;}
    flatLoadKey.current=key;
    setChildLoading(current=>({...current,...Object.fromEntries(missing.map(id=>[id,true]))}));
    void (async()=>{
      for(const fieldGroup of ["booking","cargo","incident","delivery"] as const){
        if(pageScope.current!==loadedScope)return;
        const loaded=await fetchMasterChildrenBatch(accessToken,missing,fieldGroup);
        if(pageScope.current!==loadedScope)return;
        setChildren(current=>{
          const next={...current};
          for(const id of missing)next[id]=next[id]?mergeTrips(next[id],loaded[id]??[]):loaded[id]??[];
          return next;
        });
      }
    })().catch(cause=>{if(pageScope.current===loadedScope){flatLoadKey.current="";setError(cause instanceof Error?`Some Excel columns could not load: ${cause.message}`:"Some Excel columns could not load. Retry to finish loading them.");}}).finally(()=>{if(pageScope.current===loadedScope)setChildLoading(current=>({...current,...Object.fromEntries(missing.map(id=>[id,false]))}));});
  },[excelFlat,accessToken,data,loading,loadedScope,loadedRefresh,page,appliedSearch,dataGroup,refresh]);
  const rows=useMemo(()=>{
    const out:DisplayRow[]=[];
    const pushDrs=(drs:MasterDr[],dispatch:string,depth:number)=>{for(const dr of drs){const drOpen=openDr[dr.id]??mode==="lines";out.push({kind:"dr",id:dr.id,dispatch,data:dr,label:dr.dr_number,sub:[dr.stop_sequence!=null?"Stop "+dr.stop_sequence:"",dr.line_count+" lines",dr.values.store_name?.value??""].filter(Boolean).join(" · "),values:dr.values,depth,canOpen:dr.lines.length>0,open:drOpen,addedBy:dr.values.added_by_name?.value??"",drCount:dr.dr_count,deliveredCount:dr.delivered_count});if(drOpen)for(const line of dr.lines)out.push({kind:"line",id:dr.id+":"+line.id,dispatch,data:line,label:line.values.customer_model?.value??"Product",sub:line.values.dr_number?.value??"",values:line.values,depth:depth+1,canOpen:false,open:false,addedBy:"",drCount:0,deliveredCount:0});}};
    const dispatches=[...(data?.rows??[])];
    if(sort)dispatches.sort((a,b)=>{const left=sort.key==="dispatch_number"?a.dispatch_number:a.values[sort.key]?.value??"",right=sort.key==="dispatch_number"?b.dispatch_number:b.values[sort.key]?.value??"";return sort.direction*(isNumber(sort.key)?Number(left)-Number(right):String(left).localeCompare(String(right)));});
    for(const dispatch of dispatches){const id=dispatch.dispatch_number,opened=!!openDispatch[id];
      if(excelFlat){
        const trips=children[id];
        const seen=new Set<string>();
        if(trips)for(const trip of trips)for(const dr of trip.flat_drs??trip.drs){
          if(seen.has(dr.id))continue;
          seen.add(dr.id);
          out.push({kind:"dr",id:dr.id,dispatch:id,data:dr,label:id,sub:dr.dr_number?"DR "+dr.dr_number:"",values:dr.values,depth:0,canOpen:false,open:false,addedBy:dr.values.added_by_name?.value??"",drCount:dr.dr_count,deliveredCount:dr.delivered_count});
        }
        if(!seen.size)out.push({kind:"dispatch",id,dispatch:id,data:dispatch,label:id,sub:trips?"":childLoading[id]?"Loading rows…":"",values:dispatch.values,depth:0,canOpen:false,open:false,addedBy:dispatch.values.added_by_name?.value??"",drCount:dispatch.dr_count,deliveredCount:dispatch.delivered_count});
        continue;
      }
      out.push({kind:"dispatch",id,dispatch:id,data:dispatch,label:id,sub:dispatch.trip_ids.length+" trips · "+dispatch.dr_count+" DRs",values:dispatch.values,depth:0,canOpen:true,open:opened,addedBy:dispatch.values.added_by_name?.value??"",drCount:dispatch.dr_count,deliveredCount:dispatch.delivered_count});if(!opened)continue;
      for(const trip of children[id]??[]){const tripOpen=openTrip[trip.id]??mode!=="collapse";out.push({kind:"trip",id:trip.id,dispatch:id,data:trip,label:trip.trip_number,sub:trip.convoy?trip.assignments.length+" trucks · "+trip.dr_count+" DRs":trip.dr_count+" DRs · "+trip.line_count+" lines",values:trip.values,depth:1,canOpen:true,open:tripOpen,addedBy:trip.values.added_by_name?.value??"",drCount:trip.dr_count,deliveredCount:trip.delivered_count});if(!tripOpen)continue;
        if(!trip.convoy){pushDrs(trip.drs,id,2);continue;}
        for(const truck of trip.assignments){const truckOpen=openTruck[truck.id]??mode!=="collapse";out.push({kind:"truck",id:truck.id,dispatch:id,data:truck,label:truck.plate_number,sub:[truck.trucking_company,truck.dr_count+" DRs",truck.line_count+" lines"].filter(Boolean).join(" · "),values:truck.values,depth:2,canOpen:true,open:truckOpen,addedBy:"",drCount:truck.dr_count,deliveredCount:truck.delivered_count});if(truckOpen)pushDrs(truck.drs,id,3);}
        if(trip.unallocated_drs.length){const qty=trip.unallocated_drs.reduce((sum,dr)=>sum+Number(dr.quantity||0),0),cbm=trip.unallocated_drs.reduce((sum,dr)=>sum+Number(dr.cbm||0),0),unallocatedOpen=openTruck["unallocated:"+trip.id]??mode!=="collapse";const values:MasterValues={quantity:{value:String(qty)},cbm:{value:cbm.toFixed(4)}};out.push({kind:"unallocated",id:trip.id,dispatch:id,data:trip,label:"Unallocated cargo",sub:trip.unallocated_drs.length+" DRs · assign in Trip Details",values,depth:2,canOpen:true,open:unallocatedOpen,addedBy:"",drCount:trip.unallocated_drs.length,deliveredCount:0});if(unallocatedOpen)pushDrs(trip.unallocated_drs,id,3);}
      }
    }
    return out;
  },[data,openDispatch,openTrip,openTruck,children,childLoading,openDr,mode,sort,excelFlat]);
  loadedTripIds.current=new Set(data?.rows.flatMap(dispatch=>dispatch.trip_ids)??[]);
  const rowIndex=useMemo(()=>new Map(rows.map((row,index)=>[rowKey(row),index])),[rows]);
  useEffect(()=>{if(!accessToken||!profile?.id)return;return joinCollaborationRoom("table","master-list");},[accessToken,profile?.id]);
  useEffect(()=>{const row=focusCell?rows[rowIndex.get(focusCell.row)??-1]:undefined;focusCollaborationCell("master-list",row&&focusCell?masterCellTarget(row,focusCell.column,editing===cellKey(row,focusCell.column)?"editing":"selected"):null);},[focusCell,editing,rows,rowIndex]);
  useEffect(()=>()=>focusCollaborationCell("master-list",null),[]);
  const peersByCell=useMemo(()=>{const map=new Map<string,typeof collaboration.presences>();for(const peer of collaboration.presences){if(peer.table!=="master-list")continue;const key=masterPresenceKey(peer);map.set(key,[...(map.get(key)??[]),peer]);}return map;},[collaboration.presences]);
  const peersFor=(row:DisplayRow,column:string)=>{const target=masterCellTarget(row,column,"selected");return target?peersByCell.get(masterPresenceKey(target))??[]:[];};
  const selectableColumns=useMemo(()=>[identityColumn,...shown],[shown]);
  const columnIndex=useMemo(()=>new Map(selectableColumns.map((column,index)=>[column.key,index])),[selectableColumns]);
  const selectCell=(row:string,column:string,extend=false,add=false)=>{
    setNotificationHighlight(null);
    const current={row,column},origin=extend&&anchor.current?anchor.current:current;
    const next=selectTripCells(rows.map(rowKey),selectableColumns.map(column=>column.key),selectedCells,current,origin,extend,add,selectionKey);
    if(!extend)anchor.current=current;
    setSelectedCells(next);setSelectedRows(new Set());setSelectedColumns(new Set());setFocusCell(current);
  };
  const selectRow=(key:string,extend=false,add=false)=>{
    setNotificationHighlight(null);
    const current=rowIndex.get(key),start=extend&&anchor.current?rowIndex.get(anchor.current.row):current;
    if(current===undefined)return;
    const clicked=rows[current],wasSelected=selectedRows.has(key);
    const next=add?new Set(selectedRows):new Set<string>();
    if(wasSelected&&add&&!extend){
      for(const branchKey of rowBranchKeys(clicked,children))next.delete(branchKey);
      let ancestorDepth=clicked.depth;
      for(let index=current-1;index>=0&&ancestorDepth>0;index--)if(rows[index].depth<ancestorDepth){next.delete(rowKey(rows[index]));ancestorDepth=rows[index].depth;}
    }else{
      for(let i=Math.min(start??current,current);i<=Math.max(start??current,current);i++){
        const row=rows[i];
        for(const branchKey of rowBranchKeys(row,children))next.add(branchKey);
        if(row.kind==="dispatch"&&!children[row.dispatch])void loadChildren(row.dispatch);
      }
    }
    if(!extend)anchor.current={row:key,column:identityColumn.key};
    setSelectedRows(next);setSelectedCells(new Set());setSelectedColumns(new Set());setFocusCell({row:key,column:identityColumn.key});
  };
  const selectColumn=(key:string,extend=false,add=false)=>{
    setNotificationHighlight(null);
    const next=selectTripAxis(selectableColumns.map(column=>column.key),selectedColumns,key,anchor.current?.column??null,extend,add);
    if(!extend)anchor.current={row:rows[0]?rowKey(rows[0]):"",column:key};
    setSelectedColumns(next);setSelectedCells(new Set());setSelectedRows(new Set());setFocusCell({row:anchor.current?.row??"",column:key});
  };
  const drag=useSpreadsheetDragSelection({viewport,scope:"master-list",blocked:Boolean(editing),onSelect:(row,column,extend)=>selectCell(row,column,extend)});
  useEffect(()=>{localStorage.setItem(widthStorageKey,JSON.stringify(columnWidths));},[columnWidths]);
  useEffect(()=>{localStorage.setItem(orderStorageKey,JSON.stringify(columnOrder));},[columnOrder]);
  useEffect(()=>{localStorage.setItem(pinStorageKey,JSON.stringify(pins));},[pins]);
  useEffect(()=>{localStorage.setItem(alignStorageKey,JSON.stringify(columnAlign));},[columnAlign]);
  useEffect(()=>{localStorage.setItem(rowHeightStorageKey,String(configuredRowHeight));},[configuredRowHeight]);
  useLayoutEffect(()=>{
    const previous=previousRowHeight.current;
    if(previous===rowHeight)return;
    previousRowHeight.current=rowHeight;
    const node=viewport.current;
    if(node){node.scrollTop=node.scrollTop/previous*rowHeight;setScrollTop(node.scrollTop);}
  },[rowHeight]);
  useSpreadsheetViewport(viewport,rows.length);
  const start=Math.max(0,Math.floor(scrollTop/rowHeight)-8),end=Math.min(rows.length,start+Math.ceil(viewportHeight/rowHeight)+16);
  const visibleRows=rows.slice(start,end);
  const widths=useMemo(()=>{
    const base=shown.map(col=>{
      if(Number.isFinite(columnWidths[col.key])&&columnWidths[col.key]>=72)return Math.min(600,columnWidths[col.key]);
      if(!autoFit)return col.width;
      let longest=0;
      for(const dispatch of data?.rows??[])longest=Math.max(longest,String(dispatch.values[col.key]?.value??"").length);
      for(const trips of Object.values(children))for(const trip of trips){
        longest=Math.max(longest,String(trip.values[col.key]?.value??"").length);
        for(const dr of tripDrs(trip)){longest=Math.max(longest,String(dr.values[col.key]?.value??"").length);for(const line of dr.lines)longest=Math.max(longest,String(line.values[col.key]?.value??"").length);}
      }
      // Column defaults are the readable minimum for headers; content can grow them.
      return Math.max(col.width,Math.min(360,Math.ceil(longest*7+28)));
    });
    if(!base.length)return base;
    const free=Math.max(0,viewportWidth-leadingWidth-base.reduce((sum,width)=>sum+width,0));
    const flexible=shown.flatMap((column,index)=>columnWidths[column.key]===undefined?[index]:[]);
    if(!flexible.length)return base;
    const perColumn=Math.floor(free/flexible.length),remainder=free%flexible.length;
    const additions=new Map(flexible.map((index,order)=>[index,perColumn+(order<remainder?1:0)]));
    return base.map((width,index)=>width+(additions.get(index)??0));
  },[shown,autoFit,data,children,viewportWidth,columnWidths,leadingWidth]);
  const totalColumnWidth=widths.reduce((sum,width)=>sum+width,0);
  const windowColumns=shown;
  useEffect(()=>{
    const target=notificationTarget,cell=target?.masterListCells?.[0];
    if(!target||!cell||handledNotification.current===target.navigationKey||group!==notificationGroup||loading||appliedSearch!==target.searchText||loadedScope!==`${page}\u0000${appliedSearch}\u0000${group}`)return;
    const dispatch=data?.rows.find(item=>item.dispatch_number===target.searchText||item.trip_ids.includes(target.referenceId))?.dispatch_number;
    if(!dispatch)return;
    if(cell.scope!=="dispatch"&&!openDispatch[dispatch]){setOpenDispatch(current=>({...current,[dispatch]:true}));if(!children[dispatch])void loadChildren(dispatch);return;}
    if(cell.scope!=="dispatch"&&!children[dispatch]){void loadChildren(dispatch);return;}
    const matchingTrip=(children[dispatch]??[]).find(trip=>tripDrs(trip).some(dr=>cell.scope==="dr"?dr.stop_id===cell.id:dr.lines.some(line=>line.id===cell.id)));
    if(matchingTrip&&!openTrip[matchingTrip.id]&&mode==="collapse"){setOpenTrip(current=>({...current,[matchingTrip.id]:true}));return;}
    const child=cell.scope==="dr"?matchingTrip&&tripDrs(matchingTrip).find(dr=>dr.stop_id===cell.id):undefined;
    const lineParent=cell.scope==="line"?matchingTrip&&tripDrs(matchingTrip).find(dr=>dr.lines.some(line=>line.id===cell.id)):undefined;
    const parent=child??lineParent;
    const truck=matchingTrip?.assignments.find(assignment=>assignment.drs.some(dr=>dr.id===parent?.id));
    const truckKey=truck?.id??(matchingTrip?.unallocated_drs.some(dr=>dr.id===parent?.id)?"unallocated:"+matchingTrip.id:undefined);
    if(truckKey&&openTruck[truckKey]===false){setOpenTruck(current=>({...current,[truckKey]:true}));return;}
    if(parent&&matchingTrip?.convoy&&truckKey&&mode==="collapse"&&!openTruck[truckKey]){setOpenTruck(current=>({...current,[truckKey]:true}));return;}
    if(lineParent&&!openDr[lineParent.id]&&mode!=="lines"){setOpenDr(current=>({...current,[lineParent.id]:true}));return;}
    const row=rows.find(item=>item.dispatch===dispatch&&(cell.scope==="dispatch"?item.kind==="dispatch":cell.scope==="dr"?item.kind==="dr"&&item.id===child?.id:item.kind==="line"&&(item.data as MasterLine).id===cell.id));    if(!row)return;
    if(columns.some(column=>column.key===cell.field)&&!shown.some(column=>column.key===cell.field)){setHidden(current=>current.filter(key=>key!==cell.field));return;}
    const field=cell.field==="dispatch_number"||shown.some(column=>column.key===cell.field)?cell.field:identityColumn.key;
    const columnIndex=shown.findIndex(column=>column.key===field);
    const node=viewport.current,index=rowIndex.get(rowKey(row));
    if(!node||index===undefined)return;
    handledNotification.current=target.navigationKey;
    const key=rowKey(row);
    setSelectedCells(new Set([selectionKey(key,field)]));setSelectedRows(new Set());setSelectedColumns(new Set());setFocusCell({row:key,column:field});
    setNotificationHighlight({row:key,field,key:target.navigationKey});anchor.current={row:key,column:field};
    const left=columnIndex<0||pins[field]?node.scrollLeft:Math.max(0,leadingWidth+widths.slice(0,columnIndex).reduce((sum,width)=>sum+width,0)-320);
    node.scrollTo({top:Math.max(0,index*rowHeight-(node.clientHeight-headerHeight)/2),left,behavior:"smooth"});
  },[notificationTarget,notificationGroup,group,loading,loadedScope,page,appliedSearch,data,openDispatch,children,openDr,rows,rowIndex,shown,widths,rowHeight,pins,loadChildren,leadingWidth,headerHeight]);
  const leftPinOffsets=new Map<string,number>(),rightPinOffsets=new Map<string,number>();
  let pinLeft=leadingWidth,pinRight=0;
  shown.forEach((column,index)=>{if(pins[column.key]==="left"){leftPinOffsets.set(column.key,pinLeft);pinLeft+=widths[index];}});
  for(let index=shown.length-1;index>=0;index--)if(pins[shown[index].key]==="right"){rightPinOffsets.set(shown[index].key,pinRight);pinRight+=widths[index];}
  const columnCellStyle=(column:Column,row:DisplayRow,selected:boolean):CSSProperties=>{
    const side=pins[column.key],align=formatting.effective(rowKey(row),column.key).alignment??columnAlign[column.key];
    const style:CSSProperties={...formatting.appearance(rowKey(row),column.key),alignItems:align==="right"?"flex-end":align==="center"?"center":align==="left"?"flex-start":undefined};
    if(side){style.position="sticky";style.zIndex=5;style.backgroundColor=style.backgroundColor??(selected?"#eaf1ff":row.kind==="dispatch"?"#fff":"#f8f9fb");if(side==="left")style.left=leftPinOffsets.get(column.key);else style.right=rightPinOffsets.get(column.key);}
    return style;
  };
  const headerCellStyle=(column:Column):CSSProperties=>{
    const style:CSSProperties={...formatting.headerAppearance(column.key)};
    const side=pins[column.key];
    if(side){style.position="sticky";style.zIndex=16;style.backgroundColor=style.backgroundColor??(selectedColumns.has(column.key)?"#eaf1ff":"#fff");if(side==="left")style.left=leftPinOffsets.get(column.key);else style.right=rightPinOffsets.get(column.key);}
    return style;
  };
  const gridColumns=(excelFlat?gutterWidth+"px ":"")+identityWidth+"px "+widths.map(width=>width+"px").join(" ")+" minmax(0,1fr)";
  const findHeader=(key:string)=>{const existing=headers.current.get(key);if(existing)return existing;const index=shown.findIndex(col=>col.key===key);if(index>=0&&viewport.current)viewport.current.scrollLeft=widths.slice(0,index).reduce((sum,width)=>sum+width,0);return null;};
  const deltas=useMemo(()=>{const totals=new Map<string,{quantity:number;cbm:number}>();for(const change of Object.values(changes)){if(change.scope!=="line"||change.field!=="quantity"||change.baseline_quantity===undefined||!change.dispatch)continue;const qty=Number(change.value)-change.baseline_quantity,cbm=change.baseline_quantity>0?(change.baseline_cbm??0)/change.baseline_quantity*qty:0;for(const key of [change.dispatch,change.trip,change.dr_key,change.unallocated_key].filter((key):key is string=>!!key)){const prior=totals.get(key)??{quantity:0,cbm:0};totals.set(key,{quantity:prior.quantity+qty,cbm:prior.cbm+cbm});}}return totals;},[changes]);
  const getCell=(row:DisplayRow,field:string)=>{if(field===identityColumn.key)return row.label;const edited=changes[cellKey(row,field)];if(edited)return String(edited.value);if(row.kind!=="line"&&(field==="quantity"||field==="cbm")){const delta=deltas.get(row.kind==="dispatch"?row.dispatch:row.kind==="unallocated"?"unallocated:"+row.id:row.id)?.[field]??0;if(delta){const total=Number(row.values[field]?.value??0)+delta;return field==="cbm"?total.toFixed(4):String(total);}}return row.values[field]?.value??"—";};
  const deliveredCount=(row:DisplayRow)=>{if(row.kind!=="dispatch")return row.deliveredCount;let count=row.deliveredCount;const unique=new Map(dispatchDrs(children,row.dispatch).map(dr=>[dr.trip_id+":"+dr.stop_id+":"+dr.dr_number,dr]));for(const dr of unique.values()){const change=Object.values(changes).find(item=>item.scope==="dr"&&item.id===dr.stop_id&&item.field==="delivery_status");if(!change)continue;const before=/delivered|completed/i.test(dr.values.delivery_status?.value??""),after=/delivered|completed/i.test(String(change.value));if(before!==after)count+=after?1:-1;}return count;};
  const applyEdits=(edits:{row:DisplayRow;field:string;value:string}[])=>{
    if(saving)return false;
    const next={...changes};let changed=false;
    for(const {row,field,value} of edits){
      if(row.kind!=="dispatch"&&row.kind!=="dr"&&row.kind!=="line")continue;
      if(!canEditRow(row,field)||row.kind==="dr"&&!(row.data as MasterDr).stop_id||!value.trim()&&field!=="remarks"||field==="quantity"&&(!Number.isFinite(Number(value))||Number(value)<0)||field==="delivery_status"&&statusOptions.length>0&&!statusOptions.includes(value))continue;
      const baseline=row.values[field]?.value??"—",key=cellKey(row,field);
      if(field==="quantity"?Number(value)===Number(baseline):value===(baseline==="—"?"":baseline))delete next[key];
      else next[key]={scope:row.kind,id:row.kind==="dr"?(row.data as MasterDr).stop_id:row.kind==="line"?(row.data as MasterLine).id:row.id,field,value:field==="quantity"?Number(value):value,...(row.kind==="line"&&field==="quantity"?{dispatch:row.dispatch,trip:(row.data as MasterLine).trip_id,dr_key:row.id.slice(0,-(row.data as MasterLine).id.length-1),unallocated_key:row.id.startsWith("unallocated:")?"unallocated:"+(row.data as MasterLine).trip_id:undefined,baseline_quantity:Number(row.values.quantity?.value??0),baseline_cbm:Number(row.values.cbm?.value??0)}:{})};
      changed=true;
    }
    if(Object.keys(next).length>200){addToast({variant:"warning",title:"Too many changes",description:"Wait for the current batch to save before editing more cells."});return false;}
    if(changed){setSaveError("");setHistory(current=>({past:[...current.past.slice(-49),changes],future:[]}));setChanges(next);}
    return changed;
  };
  const stage=(row:DisplayRow,field:string,value:string)=>{if(!applyEdits([{row,field,value}])){setEditError("Choose a valid value for this field.");return false;}setEditError("");setEditing(null);return true;};
  const undo=()=>{const previous=history.past.at(-1);if(!previous)return;setHistory(current=>({past:current.past.slice(0,-1),future:[changes,...current.future]}));setChanges(previous);};
  const redo=()=>{const next=history.future[0];if(!next)return;setHistory(current=>({past:[...current.past,changes],future:current.future.slice(1)}));setChanges(next);};
  const begin=(row:DisplayRow,field:string)=>{if(!admin||!editMode||saving||editing&&editError||!canEditRow(row,field)||row.kind==="dr"&&!(row.data as MasterDr).stop_id)return;cancelEdit.current=false;setEditError("");const value=getCell(row,field)==="—"?"":getCell(row,field);liveDraft.current?.close();const target=masterDraftTarget(row,field);liveDraft.current=target?beginCellDraft(target,value):null;setEditing(cellKey(row,field));setDraft(value);};
  const focusedRow=focusCell?rows[rowIndex.get(focusCell.row)??-1]:undefined;
  const activeBarKey=focusCell?selectionKey(focusCell.row,focusCell.column):"";
  const activeBarValue=barDraft?.key===activeBarKey?barDraft.value:focusedRow?(getCell(focusedRow,focusCell?.column??"")==="—"?"":getCell(focusedRow,focusCell?.column??"")):"";
  const prepareDelete=async()=>{
    if(preparingDeleteRef.current||!accessToken)return;
    if(Object.keys(changes).length||saving){addToast({variant:"warning",title:"Save or discard edits first",description:"Resolve pending edits before deleting rows."});return;}
    const selected=rows.filter(row=>selectedRows.has(rowKey(row)));
    const dispatches=selected.filter(row=>row.kind==="dispatch"),dispatchSet=new Set(dispatches.map(row=>row.dispatch));
    const selectedTrips=selected.filter(row=>row.kind==="trip"&&!dispatchSet.has(row.dispatch)),tripSet=new Set(selectedTrips.map(row=>row.id));
    const nested=selected.filter(row=>!dispatchSet.has(row.dispatch)&&!tripSet.has((row.data as {trip_id?:string}).trip_id??""));
    if(nested.some(row=>row.kind==="truck"||row.kind==="unallocated"||row.kind==="dr"&&(row.data as MasterDr).read_only||row.kind==="line"&&(row.data as MasterLine).read_only)){
      addToast({variant:"warning",title:"Use Trip Details for convoy allocations",description:"Select the whole trip, or change individual truck allocations in Trip Details."});return;
    }
    const drs=nested.filter(row=>row.kind==="dr");
    if(drs.some(row=>!(row.data as MasterDr).stop_id)){addToast({variant:"warning",title:"DR record unavailable",description:"Reload this dispatch before deleting its DR."});return;}
    const shared=drs.filter(row=>dispatchDrs(children,row.dispatch).some(dr=>dr.trip_id===(row.data as MasterDr).trip_id&&dr.stop_id===(row.data as MasterDr).stop_id&&!selectedRows.has("dr:"+dr.id)));
    if(shared.some(row=>!(row.data as MasterDr).lines.length)){addToast({variant:"warning",title:"DR products unavailable",description:"Reload this dispatch before deleting its DR."});return;}
    const sharedSet=new Set(shared.map(row=>row.id));
    const stops=[...new Map(drs.filter(row=>!sharedSet.has(row.id)).map(row=>{const dr=row.data as MasterDr;return [dr.trip_id+":"+dr.stop_id,{tripId:dr.trip_id,stopId:dr.stop_id,label:dr.dr_number}] as const;})).values()];
    const stopSet=new Set(stops.map(stop=>stop.tripId+":"+stop.stopId));
    const lines=[...new Map([
      ...nested.filter(row=>row.kind==="line"&&!stopSet.has((row.data as MasterLine).trip_id+":"+(row.data as MasterLine).stop_id)).map(row=>({tripId:(row.data as MasterLine).trip_id,stopId:(row.data as MasterLine).stop_id,id:(row.data as MasterLine).id})),
      ...shared.flatMap(row=>(row.data as MasterDr).lines.map(line=>({tripId:line.trip_id,stopId:line.stop_id,id:line.id}))),
    ].map(line=>[line.id,line] as const)).values()];
    if(!dispatches.length&&!selectedTrips.length&&!stops.length&&!lines.length){addToast({variant:"warning",title:"Select rows to delete"});return;}
    preparingDeleteRef.current=true;setPreparingDelete(true);
    try{
      const dispatchNames=dispatches.map(row=>row.dispatch);
      const resolved=dispatchNames.length?await fetchMasterDeleteDispatchTrips(accessToken,dispatchNames):{};
      const trips=[...new Set([...dispatchNames.flatMap(name=>resolved[name]??[]),...selectedTrips.map(row=>row.id)])];
      if(dispatchNames.some(name=>!resolved[name]?.length))throw new Error("A selected dispatch is no longer available. Reload before deleting.");
      setDeletePlan({dispatches:dispatchNames,drGroups:shared.length,trips,stops,lines});
    }catch(cause){addToast({variant:"error",title:"Could not prepare deletion",description:cause instanceof Error?cause.message:undefined});}
    finally{preparingDeleteRef.current=false;setPreparingDelete(false);}
  };
  const bulkTargets=useMemo(()=>{
    const targets:{row:DisplayRow;field:string}[]=[];
    for(const row of rows)for(const column of shown){
      if(!canEditRow(row,column.key))continue;
      if(selectedRows.has(rowKey(row))||selectedColumns.has(column.key)||selectedCells.has(selectionKey(rowKey(row),column.key)))targets.push({row,field:column.key});
    }
    return targets;
  },[rows,shown,selectedRows,selectedColumns,selectedCells]);
  const bulkFields=[...new Set(bulkTargets.map(target=>target.field))];
  const canCut=selectedCells.size>0&&selectedCells.size===bulkTargets.length&&[...selectedCells].every(key=>key.endsWith("|remarks"));
  const clearSelected=()=>{if(!admin||!editMode||data?.editingAvailable===false)return;const targets=bulkTargets.filter(({field})=>field==="remarks");if(targets.length)applyEdits(targets.map(({row,field})=>({row,field,value:""})));else addToast({variant:"warning",title:"No clearable cells selected",description:"Required values and linked records cannot be cleared here."});};
  const fieldsForPanel=(row:DisplayRow)=>row.kind==="dispatch"?["trucking_company","plate_number","remarks"]:["customer_name","store_name","delivery_status"];
  const openPanel=(row:DisplayRow)=>{if(editing&&editError||row.kind!=="dispatch"&&row.kind!=="dr"||row.kind==="dr"&&(row.data as MasterDr).read_only)return;setEditError("");setPanelDrafts(Object.fromEntries(fieldsForPanel(row).map(field=>[field,getCell(row,field)==="—"?"":getCell(row,field)])));setPanel(row);};
  const savePanel=()=>{if(!panel)return;const edits=fieldsForPanel(panel).flatMap(field=>{const value=panelDrafts[field]??"",original=getCell(panel,field);return value===(original==="—"?"":original)?[]:[{row:panel,field,value}];});
    if(edits.some(({field,value})=>!value.trim()&&field!=="remarks"||field==="delivery_status"&&statusOptions.length>0&&!statusOptions.includes(value))){setEditError("Complete the required fields with valid values before closing the editor.");return;}
    if(edits.length&&!applyEdits(edits)){setEditError("Could not stage these changes. Review the values and try again.");return;}
    setEditError("");setPanel(null);
  };
  const selectedText=()=>{
    const selected=selectedCells.size?new Set(selectedCells):new Set(rows.flatMap(row=>selectableColumns.filter(column=>selectedRows.has(rowKey(row))||selectedColumns.has(column.key)).map(column=>selectionKey(rowKey(row),column.key))));
    if(!selected.size&&focusedRow&&focusCell)selected.add(selectionKey(focusCell.row,focusCell.column));
    return tripSelectionText(rows,selectableColumns.map(column=>column.key),selected,rowKey,getCell,selectionKey);
  };
  const copySelected=async(cut=false)=>{
    if(cut&&!canCut){addToast({variant:"warning",title:"Cut is limited to editable comments",description:"Select comment cells to move their contents. Other fields remain protected."});return;}
    const value=selectedText();if(!value)return;
    try{await navigator.clipboard.writeText(value);if(cut)clearSelected();}catch{addToast({variant:"error",title:"Could not copy cells"});}
  };
  const pasteText=(value:string)=>{
    if(!focusCell||!admin||!editMode||data?.editingAvailable===false)return;
    const startRow=rowIndex.get(focusCell.row),startColumn=columnIndex.get(focusCell.column);
    if(startRow===undefined||startColumn===undefined)return;
    const matrix=parseSpreadsheetClipboard(value);let skipped=0;const edits:{row:DisplayRow;field:string;value:string}[]=[];
    matrix.forEach((cells,r)=>cells.forEach((cell,c)=>{const row=rows[startRow+r],column=selectableColumns[startColumn+c];if(!row||!column)return;
      if(!canEditRow(row,column.key)||row.kind==="dr"&&!(row.data as MasterDr).stop_id||!cell.trim()&&column.key!=="remarks"||column.key==="quantity"&&(!Number.isFinite(Number(cell))||Number(cell)<0)||column.key==="delivery_status"&&statusOptions.length>0&&!statusOptions.includes(cell)){skipped++;return;}
      edits.push({row,field:column.key,value:cell});
    }));
    if(edits.length)applyEdits(edits);
    if(skipped)addToast({variant:"warning",title:`${skipped} protected or invalid cells skipped`,description:edits.length?`${edits.length} editable cells are saving automatically.`:"No cells were changed."});
  };
  const moveFocus=(rowDelta:number,columnDelta:number)=>{if(!focusCell)return;const r=rowIndex.get(focusCell.row),c=columnIndex.get(focusCell.column);if(r===undefined||c===undefined)return;const nextRow=Math.max(0,Math.min(rows.length-1,r+rowDelta)),nextColumn=Math.max(0,Math.min(selectableColumns.length-1,c+columnDelta));const next={row:rowKey(rows[nextRow]),column:selectableColumns[nextColumn].key};selectCell(next.row,next.column);const node=viewport.current;if(node){if(nextRow*rowHeight<node.scrollTop)node.scrollTop=nextRow*rowHeight;else if((nextRow+1)*rowHeight>node.scrollTop+node.clientHeight-headerHeight)node.scrollTop=(nextRow+1)*rowHeight-node.clientHeight+headerHeight;if(nextColumn===0){node.scrollLeft=0;return;}const left=leadingWidth+widths.slice(0,nextColumn-1).reduce((sum,width)=>sum+width,0),width=widths[nextColumn-1];if(left<node.scrollLeft+leadingWidth)node.scrollLeft=Math.max(0,left-leadingWidth);else if(left+width>node.scrollLeft+node.clientWidth)node.scrollLeft=left+width-node.clientWidth;}};
  const gridKeyDown=(event:KeyboardEvent<HTMLDivElement>)=>{
    if((event.target as Element).closest("input,textarea,select,[contenteditable=true]"))return;
    if(tripTableShortcut(event,[{label:"Cut",disabled:!editMode||saving||!canCut,onClick:()=>copySelected(true)},{label:"Undo",disabled:!editMode||saving||!history.past.length,onClick:undo},{label:"Redo",disabled:!editMode||saving||!history.future.length,onClick:redo}]))return;
    const ctrl=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
    if(ctrl&&key==="a"){event.preventDefault();setSelectedCells(new Set(rows.flatMap(row=>selectableColumns.map(column=>selectionKey(rowKey(row),column.key)))));setSelectedRows(new Set());setSelectedColumns(new Set());return;}
    if(ctrl&&key==="c")return;
    if(ctrl&&key==="v")return;
    if((key==="contextmenu"||event.shiftKey&&key==="f10")&&focusCell){event.preventDefault();const cell=Array.from(viewport.current?.querySelectorAll<HTMLElement>('[data-range-row][data-range-column]')??[]).find(node=>node.dataset.rangeRow===focusCell.row&&node.dataset.rangeColumn===focusCell.column);const box=cell?.getBoundingClientRect();setMenu({kind:"cell",row:focusCell.row,column:focusCell.column,x:box?.left??120,y:box?.bottom??120});return;}
    if((key==="delete"||key==="backspace")&&editMode){event.preventDefault();clearSelected();return;}
    if((key==="enter"||key==="f2")&&focusedRow&&focusCell){event.preventDefault();begin(focusedRow,focusCell.column);return;}
    if(key==="arrowdown"||key==="arrowup"||key==="arrowleft"||key==="arrowright"||key==="tab"){event.preventDefault();moveFocus(key==="arrowdown"?1:key==="arrowup"?-1:0,key==="arrowright"||key==="tab"?1:key==="arrowleft"?-1:0);}
  };
  const resizeColumn=(key:string,event:ReactPointerEvent<HTMLSpanElement>)=>{
    event.preventDefault();event.stopPropagation();
    if(excelFlat)setColumnWidths(previous=>({...previous,...Object.fromEntries(shown.map((column,index)=>[column.key,widths[index]]))}));
    resizing.current={key,x:event.clientX,width:key===identityColumn.key?identityWidth:widths[shown.findIndex(column=>column.key===key)]??columns.find(column=>column.key===key)?.width??150};
    const move=(pointer:globalThis.PointerEvent)=>{const current=resizing.current;if(!current)return;setColumnWidths(previous=>({...previous,[current.key]:Math.max(72,Math.min(600,Math.round(current.width+pointer.clientX-current.x)))}));};
    const done=(pointer:globalThis.PointerEvent)=>{const current=resizing.current;resizing.current=null;window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",done);window.removeEventListener("pointercancel",done);if(current&&pointer.type==="pointercancel")setColumnWidths(previous=>({...previous,[current.key]:current.width}));if(current&&pointer.type==="pointerup")void sharedWidths.save(current.key,Math.max(72,Math.min(600,Math.round(current.width+pointer.clientX-current.x))));};
    window.addEventListener("pointermove",move);window.addEventListener("pointerup",done,{once:true});window.addEventListener("pointercancel",done,{once:true});
  };
  const openMenu=(event:MouseEvent<HTMLElement>,target:Omit<MenuTarget,"x"|"y">)=>{event.preventDefault();event.stopPropagation();if(target.kind==="row"&&target.row&&!selectedRows.has(target.row))selectRow(target.row);if(target.kind==="column"&&target.column&&!selectedColumns.has(target.column))selectColumn(target.column);setMenu({...target,x:event.clientX,y:event.clientY});};
  const menuRow=menu?.row?rows[rowIndex.get(menu.row)??-1]:undefined;
  const menuColumn=menu?.column?selectableColumns.find(column=>column.key===menu.column):undefined;
  const setColumnHidden=(key:string,hidden:boolean)=>{setHidden(current=>hidden?[...new Set([...current,key])]:current.filter(item=>item!==key));void sharedDesign.save(key,{hidden},formatWidth(key));};
  const showAllColumns=()=>{for(const key of hidden)void sharedDesign.save(key,{hidden:false},formatWidth(key));setHidden([]);};
  const setColumnAlignment=(key:string,alignment:"left"|"center"|"right")=>{setColumnAlign(current=>({...current,[key]:alignment}));void sharedDesign.save(key,{alignment},formatWidth(key));};
  const setSharedRowHeight=(height:44|56|72)=>{setRowHeight(height);void sharedDesign.save(identityColumn.key,{rowHeights:{__all:height}},280);};
  const moveColumn=(from:string,to:string)=>{const next=reorderColumnKeys(columnOrder,from,to);setColumnOrder(next);void sharedDesign.saveOrder(next,formatWidth);};
  const pinColumn=(key:string,side:"left"|"right")=>{const pinned=[...new Set([...Object.keys(pins).filter(item=>pins[item]&&item!==key),key])];const total=leadingWidth+pinned.reduce((sum,item)=>sum+(widths[(columnIndex.get(item)??0)-1]??columnWidths[item]??columns.find(col=>col.key===item)?.width??150),0);if(total>viewportWidth-120){addToast({variant:"warning",title:"Too many pinned columns",description:"Unpin a column to leave room for horizontal scrolling."});return;}setPins(current=>({...current,[key]:side}));void sharedDesign.save(key,{pin:side},formatWidth(key));};
  const save=async()=>{if(!accessToken||saving||!Object.keys(changes).length)return;setSaving(true);try{const result=await saveMasterChanges(accessToken,Object.values(changes));setSaveError("");setChanges({});setHistory({past:[],future:[]});setPanel(null);setRefresh(current=>current+1);if(result.notification_warning)addToast({variant:"warning",title:"Notification delayed",description:result.notification_warning});}catch(cause){const message=cause instanceof Error?cause.message:"Review and retry.";setSaveError(message);addToast({variant:"error",title:"Changes were not saved",description:message});}finally{setSaving(false);}};
  useEffect(()=>{if(!accessToken||saving||saveError||editing||panel||bulkOpen||!Object.keys(changes).length)return;const timer=setTimeout(()=>void save(),120);return()=>clearTimeout(timer);},[accessToken,saving,saveError,editing,panel,bulkOpen,changes]);
  const exportMaster=async()=>{if(!accessToken||exporting)return;setExporting(true);try{
    const {default:ExcelJS}=await import("exceljs");
    const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet("Master List");
    sheet.columns=[{header:"Dispatch no.",key:"dispatch_number",width:22},...columns.map(col=>({header:col.title,key:col.key,width:Math.min(32,Math.max(14,col.title.length+2))}))];
    sheet.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};
    sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF111A2E"}};
    let pageNumber=1,totalPages=1,total=0,written=0;
    do{
      const response=await fetchReportRows("dispatch-monitoring",accessToken,{page:pageNumber,limit:100,search:appliedSearch,sortBy:"",sortOrder:"asc",filters:{source_lines:"true"},fresh:true});
      if(pageNumber===1){totalPages=response.pagination.totalPages;total=response.pagination.total;}
      else if(response.pagination.total!==total)throw new Error("Rows changed during export. Retry for a complete file.");
      for(const row of response.rows){sheet.addRow({dispatch_number:row.dispatch_number,...Object.fromEntries(columns.map(col=>[col.key,row[col.key]??null]))});written++;}
      pageNumber++;
    }while(pageNumber<=totalPages);
    if(written!==total)throw new Error("Export is incomplete. Please retry.");
    const bytes=await workbook.xlsx.writeBuffer();
    const url=URL.createObjectURL(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    const link=document.createElement("a");link.href=url;link.download="alzhen-master-list.xlsx";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(cause){addToast({variant:"error",title:"Export failed",description:cause instanceof Error?cause.message:undefined});}finally{setExporting(false);}};
  useRegisterTopbarAction("trips:Master List","export",{label:exporting?"Exporting…":"Export",disabled:exporting,onClick:()=>void exportMaster()});
  const panelFields=panel?.kind==="dispatch"?["trucking_company","plate_number","remarks"]:["customer_name","store_name","delivery_status"];
  useLayoutEffect(()=>{
    if(footerContext?.activeSheet!=="trips")return;
    return footerContext.registerPaging("trips",
      <span>Showing {data?.rows.length??0} of {data?.total??0} dispatches{loading?" · Updating…":""}</span>,
      <><button type="button" disabled={page<=1||loading} onClick={()=>setPage(current=>current-1)}>Previous</button><button type="button" disabled={loading||page*50>=(data?.total??0)} onClick={()=>setPage(current=>current+1)}>Next 50</button></>,
      autoFit,
    );
  },[footerContext?.activeSheet,footerContext?.registerPaging,data?.rows.length,data?.total,loading,page,autoFit]);
  return <div className={"ml-root"+(editMode?" ml-edit-mode":"")} style={{"--ml-row-height":rowHeight+"px"} as CSSProperties}>
    <TopbarSearchRegistration scope="trips:Master List"><ColumnFinder columns={finderColumns} viewport={viewport} getHeader={findHeader} onReveal={reveal} rowSearch={finder}/></TopbarSearchRegistration>
    <div className="ml-card"><div className="ml-card-top">
      <div className="ml-toolbar">
        <div className="ml-groups" role="group" aria-label="Column groups">{groupLabels.map(item=><button key={item.key} type="button" aria-label={item.fullName} title={item.fullName} aria-pressed={group===item.key} className={"ml-group "+(group===item.key?"is-active":"")} onClick={()=>setGroup(item.key)}><span className={"ml-dot ml-dot-"+item.key}/>{item.label}</button>)}</div>
        <div className="ml-control-right"><ViewerGroup users={collaboration.viewers?.["master-list"]??[]} toolbar/>{!excelFlat&&<div role="group" aria-label="Expand rows" className="ml-segments">{(["collapse","drs","lines"] as const).map(item=><button type="button" key={item} aria-pressed={mode===item} onClick={()=>void expandAll(item)}>{item==="collapse"?"Collapse":item==="drs"?"DRs":"Lines"}</button>)}</div>}{admin&&selectedRows.size>0&&<button type="button" className="ml-toolbar-delete" onClick={()=>void prepareDelete()} disabled={saving||preparingDelete}>{preparingDelete?"Preparing…":"Delete selected"}</button>}{admin&&<label className="ml-edit-switch" title={data?.editingAvailable===false?"Editing needs the pending Master List database migration":undefined}><span>Edit mode</span><input type="checkbox" checked={editMode} disabled={data?.editingAvailable===false} onChange={event=>{setEditMode(event.target.checked);if(!event.target.checked)setSelectedRows(new Set());}}/><span className="ml-switch-track"/></label>}</div>
      </div>
      {focusCell&&<div className="ml-input-bar"><span>{focusedRow?.label??""} · {selectableColumns.find(column=>column.key===focusCell.column)?.title}</span><input aria-label="Selected cell value" value={activeBarValue} readOnly={!focusedRow||!admin||!editMode||saving||data?.editingAvailable===false||!canEditRow(focusedRow,focusCell.column)} onFocus={()=>{barLiveDraft.current?.close();const target=focusedRow?masterDraftTarget(focusedRow,focusCell?.column??""):null;barLiveDraft.current=target?beginCellDraft(target,activeBarValue):null;}} onChange={event=>{setBarDraft({key:activeBarKey,value:event.target.value});barLiveDraft.current?.update(event.target.value);}} onKeyDown={event=>{if(event.key==="Enter"&&focusedRow&&!saving){event.preventDefault();if(stage(focusedRow,focusCell.column,activeBarValue))setBarDraft(null);}if(event.key==="Escape"){setBarDraft(null);}}} onBlur={()=>{barLiveDraft.current?.close();barLiveDraft.current=null;if(focusedRow&&barDraft?.key===activeBarKey&&activeBarValue!==getCell(focusedRow,focusCell.column))if(stage(focusedRow,focusCell.column,activeBarValue))setBarDraft(null);}}/></div>}
      {formatting.count>0&&<div className="ml-format-toolbar"><MasterListFormatToolbar formatting={formatting}/></div>}
      {data?.editingAvailable===false&&<div className="ml-edit-banner" role="status">Viewing trips with the temporary read-only layout. Editing will be available after the Master List database migration is applied.</div>}
      </div>
      {error&&<div className="ml-error" role="alert">{error} <button type="button" onClick={()=>setRefresh(current=>current+1)}>Retry</button></div>}
      {editError&&!panel&&<div className="ml-edit-error" role="alert">{editError}</div>}
      <div className="ml-viewport-wrap"><div ref={viewport} className="ml-viewport spreadsheet-viewport" tabIndex={0} onPointerDownCapture={drag.onPointerDownCapture} onClickCapture={drag.onClickCapture} onKeyDown={gridKeyDown} onCopy={event=>{if((event.target as Element).closest("input,textarea"))return;event.preventDefault();event.clipboardData.setData("text/plain",selectedText());}} onPaste={event=>{if((event.target as Element).closest("input,textarea"))return;event.preventDefault();pasteText(event.clipboardData.getData("text/plain"));}} onScroll={event=>{setScrollTop(event.currentTarget.scrollTop);setHoveredPeer(null);}} aria-label="Master List table" role="table">
        <div className="ml-table-inner" style={{width:leadingWidth+totalColumnWidth}}>
          <div className="ml-row ml-head" role="row" style={{gridTemplateColumns:gridColumns}}>
            {excelFlat&&<div className="ml-excel-gutter ml-excel-gutter-head" role="columnheader" aria-label="Row numbers"/>}
            <TripTableHeader as="div" ref={node=>{if(node)headers.current.set(identityColumn.key,node);else headers.current.delete(identityColumn.key);}} role="columnheader" tabIndex={0} aria-sort={sort?.key===identityColumn.key?(sort.direction===1?"ascending":"descending"):undefined} className={"ml-pinned-left ml-head-cell ml-dispatch-head"+(selectedColumns.has(identityColumn.key)?" ml-selected-column":"")} style={formatting.headerAppearance(identityColumn.key)} onClick={event=>selectColumn(identityColumn.key,event.shiftKey,event.ctrlKey||event.metaKey)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();selectColumn(identityColumn.key,event.shiftKey,event.ctrlKey||event.metaKey);}}} onContextMenu={event=>openMenu(event,{kind:"column",column:identityColumn.key})}>{editMode&&<span className="ml-select-slot"><input type="checkbox" aria-label="Select all loaded rows" title="Select all loaded rows" checked={rows.length>0&&rows.every(row=>selectedRows.has(rowKey(row)))} onClick={event=>event.stopPropagation()} onChange={event=>{setSelectedRows(event.target.checked?new Set(rows.flatMap(row=>rowBranchKeys(row,children))):new Set());setSelectedCells(new Set());setSelectedColumns(new Set());}}/></span>} Dispatch no.<TripTableColumnResizeHandle title={identityColumn.title} width={identityWidth} enabled={sharedDesign.canEdit&&sharedWidths.loaded} onStart={event=>resizeColumn(identityColumn.key,event)} onResize={width=>{setColumnWidths(current=>({...current,[identityColumn.key]:width}));void sharedWidths.save(identityColumn.key,width);}}/></TripTableHeader>
            {windowColumns.map(col=><TripTableHeader as="div" key={col.key} ref={node=>{if(node)headers.current.set(col.key,node);else headers.current.delete(col.key);}} role="columnheader" title={col.title} tabIndex={0} aria-sort={sort?.key===col.key?(sort.direction===1?"ascending":"descending"):undefined} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();selectColumn(col.key,event.shiftKey,event.ctrlKey||event.metaKey);}}} draggable onDragStart={()=>setDraggedColumn(col.key)} onDragEnd={()=>setDraggedColumn(null)} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(draggedColumn&&draggedColumn!==col.key)moveColumn(draggedColumn,col.key);setDraggedColumn(null);}} onClick={event=>selectColumn(col.key,event.shiftKey,event.ctrlKey||event.metaKey)} onContextMenu={event=>openMenu(event,{kind:"column",column:col.key})} style={headerCellStyle(col)} className={"ml-head-cell ml-head-"+col.group+(isNumber(col.key)?" ml-number":"")+(selectedColumns.has(col.key)?" ml-selected-column":"")}><span>{col.title}</span><button type="button" className="ml-hide-column" aria-label={"Hide "+col.title} title={"Hide "+col.title} onClick={event=>{event.stopPropagation();setColumnHidden(col.key,true);}}>×</button><TripTableColumnResizeHandle title={col.title} width={widths[shown.findIndex(column=>column.key===col.key)]??col.width} enabled={sharedDesign.canEdit&&sharedWidths.loaded} onStart={event=>resizeColumn(col.key,event)} onResize={width=>{setColumnWidths(current=>({...current,[col.key]:width}));void sharedWidths.save(col.key,width);}}/></TripTableHeader>)}
            <div aria-hidden="true" role="presentation" className={"ml-head-cell ml-head-filler ml-head-"+(shown.at(-1)?.group??identityColumn.group)}/>
          </div>
          {loading&&!data?<TripTableLoading label="Loading dispatches…"/>:rows.length===0?loading?<TripTableLoading label="Loading dispatches…"/>:<div className="ml-empty">No dispatches found.</div>:<><div style={{height:start*rowHeight}}/>{visibleRows.map((row,index)=><div key={row.kind+":"+row.id} className={"ml-row ml-data-row ml-"+row.kind} role="row" style={{gridTemplateColumns:gridColumns,height:rowHeight,...formatting.identityAppearance(rowKey(row))}}>
            {excelFlat&&<div className="ml-excel-gutter" role="rowheader"><button type="button" aria-label={`Select row ${(page-1)*50+start+index+1}`} aria-selected={selectedRows.has(rowKey(row))} onClick={event=>selectRow(rowKey(row),event.shiftKey,event.ctrlKey||event.metaKey)} onContextMenu={event=>openMenu(event,{kind:"row",row:rowKey(row)})}>{(page-1)*50+start+index+1}</button></div>}
            <div className={"ml-pinned-left ml-identity"+(selectedRows.has(rowKey(row))?" ml-selected-row":"")+(selectedCells.has(selectionKey(rowKey(row),identityColumn.key))||selectedColumns.has(identityColumn.key)?" ml-selected-cell":"")+(notificationHighlight?.row===rowKey(row)&&notificationHighlight.field===identityColumn.key?" ml-notification-highlight":"")} role="cell" {...drag.cell(rowKey(row),identityColumn.key)} aria-selected={selectedCells.has(selectionKey(rowKey(row),identityColumn.key))||selectedRows.has(rowKey(row))||selectedColumns.has(identityColumn.key)} style={{...formatting.identityAppearance(rowKey(row)),...formatting.appearance(rowKey(row),identityColumn.key),paddingLeft:12+row.depth*20}} onClick={event=>selectCell(rowKey(row),identityColumn.key,event.shiftKey,event.ctrlKey||event.metaKey)} onContextMenu={event=>{if(!selectedCells.has(selectionKey(rowKey(row),identityColumn.key))&&!selectedRows.has(rowKey(row))&&!selectedColumns.has(identityColumn.key))selectCell(rowKey(row),identityColumn.key);openMenu(event,{kind:"cell",row:rowKey(row),column:identityColumn.key});}}>{editMode&&<span className="ml-select-slot"><input type="checkbox" aria-label={"Select "+row.label} checked={selectedRows.has(rowKey(row))} onClick={event=>event.stopPropagation()} onChange={()=>selectRow(rowKey(row),false,true)}/></span>}{row.canOpen?<button type="button" className="ml-chevron" aria-label={(row.open?"Collapse ":"Expand ")+row.label} aria-expanded={row.open} onClick={event=>{event.stopPropagation();toggleRow(row);}}>{row.open?<ChevronDown size={16}/>:<ChevronRight size={16}/>}</button>:<span className="ml-chevron-space"/>}<div className="ml-identity-text"><span className="ml-identity-title">{identityLabel(row)}{row.kind==="trip"&&(row.data as MasterTrip).convoy&&<span className="ml-convoy-badge" title="Multiple assigned trucks">Convoy</span>}</span>{!excelFlat&&<small>{row.sub}</small>}</div>{row.kind==="dispatch"&&<span className="ml-loading-slot">{childLoading[row.dispatch]&&<span className="ml-loading" role="status" aria-label="Loading dispatch details"><LoaderCircle size={16} aria-hidden="true"/></span>}</span>}</div>
            {windowColumns.map(col=>{const key=cellKey(row,col.key),current=getCell(row,col.key),isEditing=editing===key,editable=admin&&editMode&&data?.editingAvailable!==false&&canEditRow(row,col.key),selected=selectedCells.has(selectionKey(rowKey(row),col.key))||selectedRows.has(rowKey(row))||selectedColumns.has(col.key);const peer=peersFor(row,col.key)[0],cellStyle=columnCellStyle(col,row,selected);if(peer)Object.assign(cellStyle,{"--ml-peer-color":peer.color});return <TripTableCell as="div" role="cell" key={col.key} style={cellStyle} {...drag.cell(rowKey(row),col.key)} aria-selected={selected} title={peer?`${peer.name} is ${peer.status} here`:row.kind==="line"&&(row.data as MasterLine).read_only&&["quantity","cbm"].includes(col.key)?"Allocated amount. Change this in Trip Details.":undefined} className={"ml-cell "+(peer?"ml-peer-cell ":"")+(isNumber(col.key)?"ml-number ":"")+(editable?"ml-editable ":"")+(selected?"ml-selected-cell":"")+(cellStyle.backgroundColor?" ml-formatted-cell":"")+(notificationHighlight?.row===rowKey(row)&&notificationHighlight.field===col.key?" ml-notification-highlight":"")+(excelFlat&&col.key==="letter_status"&&current==="—"?" ml-excel-letter-empty":"")} onClick={event=>selectCell(rowKey(row),col.key,event.shiftKey,event.ctrlKey||event.metaKey)} onDoubleClick={()=>begin(row,col.key)} onMouseEnter={peer?event=>{const bounds=event.currentTarget.getBoundingClientRect();setHoveredPeer({name:peer.name,status:peer.status,left:bounds.left+bounds.width/2,top:bounds.top>52?bounds.top-8:bounds.bottom+8,below:bounds.top<=52});}:undefined} onMouseLeave={peer?()=>setHoveredPeer(null):undefined} onContextMenu={event=>{if(!selected)selectCell(rowKey(row),col.key);openMenu(event,{kind:"cell",row:rowKey(row),column:col.key});}}>{isEditing?(col.key==="delivery_status"?<TripTableDropdownEditor label={"Edit "+col.title} value={draft} options={(statusOptions.length?statusOptions:["PENDING","COMPLETED","IN PROGRESS"]).map(value=>({value,label:value}))} onSelect={value=>{setDraft(value);liveDraft.current?.update(value);if(stage(row,col.key,value))cancelEdit.current=true;}} onCommitSelection={value=>{if(!cancelEdit.current&&stage(row,col.key,value))cancelEdit.current=true;}} onCancel={()=>{cancelEdit.current=true;setEditError("");setEditing(null);}} onClose={()=>setEditing(null)}/>:<TripTableTextEditor onNavigate={backward=>moveFocus(0,backward?-1:1)} label={"Edit "+col.title} className="ml-inline-editor" type={col.key==="quantity"?"number":"text"} value={draft}
 onChange={value=>{setDraft(value);liveDraft.current?.update(value);}}
 onCommit={value=>{if(cancelEdit.current)return false;const accepted=stage(row,col.key,value);if(accepted)cancelEdit.current=true;return accepted;}}
 onCancel={()=>{cancelEdit.current=true;setEditError("");setEditing(null);}}/>):<><span className={"ml-cell-value "+(col.key==="delivery_status"?"ml-status":"")}>{col.key==="delivery_status"&&current!=="—"&&<i className={"ml-status-dot "+statusColor(row.kind==="dispatch"?(row.drCount>0&&deliveredCount(row)===row.drCount?"Delivered":"Pending"):current)}/ >}<span className="ml-cell-primary">{col.key==="delivery_status"&&row.kind==="dispatch"?deliveredCount(row)+" of "+row.drCount+" delivered":col.key==="delivery_status"?statusLabel(current):excelFlat&&col.key==="letter_status"&&current==="—"?"Not recorded":current}</span>{!changes[key]&&!(col.key==="delivery_status"&&row.kind==="dispatch")&&(row.values[col.key]?.count??0)>1&&<small className="ml-multi-count" title={row.values[col.key].detail} aria-label={`${(row.values[col.key].count??0)-1} more ${(row.values[col.key].count??0)===2?"value":"values"}: ${row.values[col.key].detail}`}>+{(row.values[col.key].count??0)-1}</small>}</span>{!changes[key]&&!(col.key==="delivery_status"&&row.kind==="dispatch")&&(row.values[col.key]?.count??0)>1&&<small className="ml-multi-preview" title={row.values[col.key].detail}>{otherValuesPreview(current,row.values[col.key].detail)}</small>}{changes[key]&&<i className="ml-dirty-dot"/>}</>}{peer&&<i className="ml-peer-marker" aria-label={`${peer.name} ${peer.status}`} style={{backgroundColor:peer.color}}/>}{masterDraftTarget(row,col.key)&&<MasterDraftPreview target={masterDraftTarget(row,col.key)!} localEditing={isEditing}/>}</TripTableCell>;})}
            
          </div>)}<div style={{height:Math.max(0,(rows.length-end)*rowHeight)}}/></>}
          {loading&&data&&rows.length>0&&<TripTableLoading label="Updating dispatches…"/>}
        </div></div>
        {admin&&editMode&&data?.editingAvailable!==false&&<div className="ml-action-rail" aria-label="Row edit actions">{visibleRows.map((row,index)=>{
          const size=excelFlat?26:44,top=headerHeight+(start+index)*rowHeight-scrollTop+(rowHeight-size)/2;
          return (row.kind==="dispatch"||row.kind==="dr"&&!(row.data as MasterDr).read_only)&&top>=headerHeight&&top+size<=viewportHeight-6?<button key={rowKey(row)} type="button" style={{top}} title={"Edit "+row.kind} aria-label={"Edit "+row.kind+" "+row.label} onClick={()=>openPanel(row)}><Pencil size={15}/></button>:null;
        })}</div>}
      </div>
      <SpreadsheetHiddenColumns sheet="trips" columns={columns.filter(col=>hidden.includes(col.key)).map(col=>({key:col.key,title:col.title}))} onRestore={key=>setColumnHidden(key,false)} onRestoreAll={showAllColumns}/>
    </div>
    {(saving||saveError)&&<div className={`ml-save-bar${saving?" is-saving":""}`} role="status" aria-live="polite">{saving?<><span className="ml-save-spinner" aria-hidden="true"/><span>Saving…</span></>:<><strong>Save failed. Changes are kept.</strong><button type="button" onClick={()=>{setChanges({});setSaveError("");setPanel(null);}}>Discard</button><button type="button" onClick={()=>void save()}>Retry</button></>}</div>}
    {hoveredPeer&&createPortal(<div className="ml-peer-tooltip" role="tooltip" style={{left:hoveredPeer.left,top:hoveredPeer.top,transform:hoveredPeer.below?"translate(-50%,0)":"translate(-50%,-100%)"}}><strong>{hoveredPeer.name}</strong><span>{hoveredPeer.status==="editing"?"Editing this cell":"Viewing this cell"}</span></div>,document.body)}
    {menu&&<TripTableContextMenu x={menu.x} y={menu.y} label="Master List actions" onClose={()=>setMenu(null)}>
      {menu.kind==="column"&&menuColumn?<>
        <MenuItem autoFocus label="Select column" onClick={()=>{selectColumn(menuColumn.key);setMenu(null);}}/>
        <MenuItem label="Sort ascending · current page" onClick={()=>{setSort({key:menuColumn.key,direction:1});setMenu(null);}}/>
        <MenuItem label="Sort descending · current page" onClick={()=>{setSort({key:menuColumn.key,direction:-1});setMenu(null);}}/>
        {menuColumn.key!==identityColumn.key&&<MenuItem label="Hide column" onClick={()=>{setColumnHidden(menuColumn.key,true);setMenu(null);}}/>}
        {hidden.length>0&&<MenuItem label={`Show all hidden columns (${hidden.length})`} onClick={()=>{showAllColumns();setMenu(null);}}/>}
        {menuColumn.key!==identityColumn.key&&<>
        <MenuItem label="Pin left" onClick={()=>{pinColumn(menuColumn.key,"left");setMenu(null);}}/>
        <MenuItem label="Pin right" onClick={()=>{pinColumn(menuColumn.key,"right");setMenu(null);}}/>
        {pins[menuColumn.key]&&<MenuItem label="Unpin column" onClick={()=>{setPins(current=>{const next={...current};delete next[menuColumn.key];return next;});void sharedDesign.save(menuColumn.key,{pin:null},formatWidth(menuColumn.key));setMenu(null);}}/>}
        <MenuItem label="Resize column…" onClick={()=>{const value=window.prompt("Column width in pixels (72–600)",String(columnWidths[menuColumn.key]??menuColumn.width));const width=Number(value);if(value!==null&&Number.isFinite(width)&&width>=72&&width<=600)setColumnWidths(current=>({...current,[menuColumn.key]:Math.round(width)}));if(value!==null&&Number.isFinite(width)&&width>=72&&width<=600)void sharedWidths.save(menuColumn.key,Math.round(width));setMenu(null);}}/>
        <MenuItem label="Align left" onClick={()=>{setColumnAlignment(menuColumn.key,"left");setMenu(null);}}/>
        <MenuItem label="Align center" onClick={()=>{setColumnAlignment(menuColumn.key,"center");setMenu(null);}}/>
        <MenuItem label="Align right" onClick={()=>{setColumnAlignment(menuColumn.key,"right");setMenu(null);}}/>
        <MenuItem label="Reset column width" onClick={()=>{setColumnWidths(current=>({...current,[menuColumn.key]:menuColumn.width}));void sharedWidths.save(menuColumn.key,menuColumn.width);setMenu(null);}}/>
        <MenuItem label="Reset column order" onClick={()=>{setColumnOrder(columns.map(column=>column.key));void sharedDesign.saveOrder(columns.map(column=>column.key),formatWidth);setMenu(null);}}/>
        </>}
      </>:<>
        <MenuItem autoFocus label="Copy" onClick={()=>{void copySelected();setMenu(null);}}/>
        <MenuItem label="Cut" disabled={!editMode||saving||data?.editingAvailable===false||!canCut} onClick={()=>{void copySelected(true);setMenu(null);}}/>
        <MenuItem label="Paste" disabled={!editMode||saving||data?.editingAvailable===false||!focusedRow||!focusCell||!canEditRow(focusedRow,focusCell.column)} onClick={()=>{void navigator.clipboard.readText().then(pasteText);setMenu(null);}}/>
        <MenuItem label="Undo" disabled={!history.past.length} onClick={()=>{undo();setMenu(null);}}/>
        <MenuItem label="Redo" disabled={!history.future.length} onClick={()=>{redo();setMenu(null);}}/>
        {menu.kind==="cell"&&menuRow&&menuColumn&&<MenuItem label="Edit cell" disabled={!editMode||data?.editingAvailable===false||!canEditRow(menuRow,menuColumn.key)} onClick={()=>{begin(menuRow,menuColumn.key);setMenu(null);}}/>}
        {menuRow&&(menuRow.kind==="dispatch"||menuRow.kind==="dr"&&!(menuRow.data as MasterDr).read_only)&&<MenuItem label="Edit row" disabled={!editMode||data?.editingAvailable===false} onClick={()=>{openPanel(menuRow);setMenu(null);}}/>}
        {menuRow&&menuRow.kind!=="dispatch"&&onOpenTrip&&<MenuItem label="Open trip details" onClick={()=>{const detail=menuRow.data as MasterTrip|MasterTruckAssignment|MasterDr|MasterLine;onOpenTrip(detail.trip_id,"stop_id" in detail?detail.stop_id:undefined);setMenu(null);}}/>}
        <MenuItem label="Clear selected comments" disabled={!editMode||data?.editingAvailable===false||!bulkTargets.some(target=>target.field==="remarks")} onClick={()=>{clearSelected();setMenu(null);}}/>
        {bulkTargets.length>1&&<MenuItem label="Bulk edit selected cells…" disabled={!editMode||data?.editingAvailable===false} onClick={()=>{setBulkField(menuColumn&&bulkFields.includes(menuColumn.key)?menuColumn.key:bulkFields[0]);setBulkValue("");setBulkOpen(true);setMenu(null);}}/>}
        {menuRow&&<MenuItem label={selectedRows.has(rowKey(menuRow))?"Unselect row":"Select row"} onClick={()=>{selectRow(rowKey(menuRow),false,true);setMenu(null);}}/>}
        {menuRow&&<MenuItem label="Compact row height" onClick={()=>{setSharedRowHeight(44);setMenu(null);}}/>}
        {menuRow&&<MenuItem label="Standard row height" onClick={()=>{setSharedRowHeight(56);setMenu(null);}}/>}
        {menuRow&&<MenuItem label="Roomy row height" onClick={()=>{setSharedRowHeight(72);setMenu(null);}}/>}
        {menuColumn&&<MenuItem label="Select column" onClick={()=>{selectColumn(menuColumn.key);setMenu(null);}}/>}
      </>}
      <TripTableFormatActions count={formatting.count} canFormat={formatting.design.canEdit} copied={Boolean(formatting.copied)} onFormat={()=>setFormatDialog(true)} onCopy={formatting.copy} onPaste={formatting.paste} onClear={formatting.clear} onClose={()=>setMenu(null)}/>
      {admin&&(selectedRows.size>0||menu.kind==="row")&&<MenuItem danger label="Delete selected rows…" disabled={preparingDelete} onClick={()=>{setMenu(null);void prepareDelete();}}/>}
    </TripTableContextMenu>}
    {formatDialog&&<TripTableFormatDialog onClose={()=>setFormatDialog(false)}><MasterListFormatToolbar formatting={formatting}/></TripTableFormatDialog>}
    {deletePlan&&accessToken&&createPortal(<MasterListDeleteDialog key={deletePlan.trips.join(",")+deletePlan.stops.map(stop=>stop.stopId).join(",")+deletePlan.lines.map(line=>line.id).join(",")} token={accessToken} plan={deletePlan} onClose={()=>setDeletePlan(null)} onChanged={()=>{setSelectedRows(new Set());setRefresh(value=>value+1);}}/>,document.body)}
    {bulkOpen&&createPortal(<div className="ml-confirm-backdrop" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="ml-bulk-title" onKeyDown={event=>{if(event.key==="Escape")setBulkOpen(false);}} className="ml-confirm"><h2 id="ml-bulk-title">Bulk edit selected cells</h2><p>Valid changes save automatically when applied.</p><label className="ml-bulk-field">Field<select value={bulkField} onChange={event=>setBulkField(event.target.value)}>{bulkFields.map(field=><option key={field} value={field}>{columns.find(column=>column.key===field)?.title??field}</option>)}</select></label><label className="ml-bulk-field">Value{bulkField==="delivery_status"?<select value={bulkValue} onChange={event=>setBulkValue(event.target.value)}><option value="">Choose status</option>{statusOptions.map(value=><option key={value} value={value}>{value}</option>)}</select>:<input type={bulkField==="quantity"?"number":"text"} min={bulkField==="quantity"?0:undefined} value={bulkValue} onChange={event=>setBulkValue(event.target.value)}/>}</label><div><button type="button" onClick={()=>setBulkOpen(false)}>Cancel</button><button type="button" onClick={()=>{const targets=bulkTargets.filter(target=>target.field===bulkField);if(applyEdits(targets.map(({row,field})=>({row,field,value:bulkValue}))))setBulkOpen(false);else addToast({variant:"warning",title:"Choose a valid value"});}} disabled={!bulkField||!bulkValue.trim()&&bulkField!=="remarks"}>Apply to {bulkTargets.filter(target=>target.field===bulkField).length} cells</button></div></div></div>,document.body)}
    {panel&&<div className="ml-panel" role="dialog" aria-modal="false" aria-label={"Edit "+panel.kind} onKeyDown={event=>{if(event.key==="Enter"&&!event.nativeEvent.isComposing&&["INPUT","SELECT"].includes((event.target as HTMLElement).tagName)){event.preventDefault();savePanel();}}}>
      <div className="ml-panel-head"><div><small>{panel.kind==="dispatch"?"DISPATCH":"DELIVERY RECORD"}</small><h2>Edit {panel.kind}</h2><p>{panel.label}</p></div><button type="button" aria-label="Close editor" onClick={()=>{setPanel(null);setEditError("");}}><X size={18}/></button></div>
      {panelFields.map(field=><label key={field}>{columns.find(col=>col.key===field)?.title}{field==="delivery_status"?<select value={panelDrafts[field]??""} onFocus={()=>{panelLiveDraft.current?.close();const target=masterDraftTarget(panel,field);panelLiveDraft.current=target?beginCellDraft(target,panelDrafts[field]??""):null;}} onChange={event=>{setPanelDrafts(current=>({...current,[field]:event.target.value}));panelLiveDraft.current?.update(event.target.value);}} onBlur={()=>{panelLiveDraft.current?.close();panelLiveDraft.current=null;}}>{(statusOptions.length?statusOptions:["PENDING","COMPLETED","IN PROGRESS"]).map(value=><option key={value} value={value}>{value}</option>)}</select>:<input value={panelDrafts[field]??""} onFocus={()=>{panelLiveDraft.current?.close();const target=masterDraftTarget(panel,field);panelLiveDraft.current=target?beginCellDraft(target,panelDrafts[field]??""):null;}} onChange={event=>{setPanelDrafts(current=>({...current,[field]:event.target.value}));panelLiveDraft.current?.update(event.target.value);}} onBlur={()=>{panelLiveDraft.current?.close();panelLiveDraft.current=null;}}/>}</label>)}
      {editError&&<p className="ml-panel-error" role="alert">{editError}</p>}
      <div className="ml-panel-note">{panel.kind==="dispatch"?"Trucker and plate apply to all "+panel.drCount+" DRs in this dispatch.":"Changing the status here updates the delivered count on the dispatch row."}</div><small>Added by {panel.addedBy||"—"}</small><button type="button" className="ml-panel-done" onClick={savePanel}>Done</button>
    </div>}
  </div>;
}







