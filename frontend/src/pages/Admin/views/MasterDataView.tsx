import {useRef,useState} from "react";
import {Plus,Search} from "lucide-react";
import {useAuth} from "../../../context/AuthContext";
import {tableUi} from "../../../components/admin/dashboardStyles";
import {SPREADSHEET_PANEL_CLASS} from "../../../components/admin/SpreadsheetPresentation";
import DatabaseSpreadsheet from "../../../components/admin/DatabaseSpreadsheet";
import DatabaseRecordDialog from "../../../components/admin/DatabaseRecordDialog";
import {SpreadsheetSheetHeader,SpreadsheetBottomToolbar} from "../../../components/admin/SpreadsheetWorkspace";
import TruckImageManager from "../../../components/admin/TruckImageManager";
import ProductPhotoManager from "../../../components/admin/ProductPhotoManager";
import type {MasterDataKey,MasterDataRow} from "../../../services/master-data.service";
import {databaseResources} from "./database-resources";

const singular:Record<string,string>={warehouses:"warehouse",trucks:"truck","trucking-companies":"trucking company",stores:"store","store-contacts":"store contact",products:"product"};
export default function MasterDataView(){
 const {accessToken,profile}=useAuth(),workspace=useRef<HTMLDivElement|null>(null),saveSequence=useRef(0);
 const [hiddenColumnsTarget,setHiddenColumnsTarget]=useState<HTMLDivElement|null>(null);
 const [section,setSection]=useState<MasterDataKey>(()=>new URLSearchParams(window.location.search).get("database")==="trucks"?"trucks":"warehouses"),[visited,setVisited]=useState(()=>new Set<MasterDataKey>([new URLSearchParams(window.location.search).get("database")==="trucks"?"trucks":"warehouses"]));
 const [searches,setSearches]=useState<Record<string,string>>({}),[metadata,setMetadata]=useState<Record<string,boolean>>({});
 const [recordDialog,setRecordDialog]=useState<{resource:MasterDataKey;row:MasterDataRow|null;key:number}|null>(null);
 const [confirmed,setConfirmed]=useState<{resource:MasterDataKey;row:MasterDataRow;sequence:number}|null>(null);
 const [imagesTruck,setImagesTruck]=useState<MasterDataRow|null>(null),[photoProduct,setPhotoProduct]=useState<MasterDataRow|null>(null);
 const config=databaseResources.find(resource=>resource.key===section)!;
 const formConfig=recordDialog?databaseResources.find(resource=>resource.key===recordDialog.resource):null;
 const canEdit=["ADMIN","STAFF"].includes(profile?.role??"");
 const openForm=(resource:MasterDataKey,row:MasterDataRow|null=null)=>setRecordDialog({resource,row,key:++saveSequence.current});
 if(!accessToken||!canEdit)return null;
 return <div ref={workspace} data-database-workspace className="database-workspace flex min-h-0 min-w-0 flex-1 flex-col gap-2">
  <SpreadsheetSheetHeader title={config.label} description="Manage shared records and reviewed locations">
   <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto"><label className="relative min-w-0 flex-1 sm:w-72 sm:flex-none"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input className={`${tableUi.search} !rounded-md`} value={searches[section]??""} onChange={event=>setSearches(current=>({...current,[section]:event.target.value}))} placeholder="Search records" aria-label="Search database records"/></label>{canEdit&&<button type="button" onClick={()=>openForm(section)} className="inline-flex h-9 items-center gap-2 rounded-md bg-[#ffd43b] px-4 text-xs font-semibold text-[#0b2341] hover:bg-[#f2c200]"><Plus className="h-4 w-4"/>Add {singular[section]}</button>}</div>
  </SpreadsheetSheetHeader>
  <section className={`${SPREADSHEET_PANEL_CLASS} database-sheet-panel flex min-h-0 flex-1 flex-col`}>
   {databaseResources.filter(resource=>visited.has(resource.key)).map(resource=><DatabaseSpreadsheet key={resource.key} resource={resource.key} fields={resource.fields} hiddenColumnsTarget={hiddenColumnsTarget} token={accessToken??""} profileId={profile?.id} canEdit={canEdit} active={section===resource.key} search={searches[resource.key]??""} revision={0} confirmedRecord={confirmed?.resource===resource.key?confirmed:undefined} onEdit={row=>openForm(resource.key,row)} onMetadata={supported=>setMetadata(current=>current[resource.key]===supported?current:{...current,[resource.key]:supported})} onImage={resource.key==="trucks"?setImagesTruck:resource.key==="products"?setPhotoProduct:undefined}/>)}
   <SpreadsheetBottomToolbar workspace={workspace} sheet={`db-${section}`} onHiddenColumnsTarget={setHiddenColumnsTarget}>
    <nav role="tablist" aria-label="Database sheets" className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{databaseResources.map(resource=><button key={resource.key} type="button" role="tab" aria-selected={section===resource.key} onClick={()=>{setVisited(current=>new Set([...current,resource.key]));setSection(resource.key);}} className={`shrink-0 cursor-pointer whitespace-nowrap border-r border-slate-200 px-3 py-1.5 text-[11px] ${section===resource.key?"relative -mt-px border-t border-t-white bg-white text-[#0b2341]":"bg-slate-100 text-slate-500 hover:bg-slate-50"}`}>{resource.label}</button>)}</nav>
   </SpreadsheetBottomToolbar>
  </section>
  {accessToken&&recordDialog&&formConfig&&<DatabaseRecordDialog key={recordDialog.key} token={accessToken} resource={recordDialog.resource} name={singular[recordDialog.resource]} fields={formConfig.fields} row={recordDialog.row} locationSupported={metadata[recordDialog.resource]??false} onClose={()=>setRecordDialog(null)} onSaved={row=>{setConfirmed({resource:recordDialog.resource,row,sequence:++saveSequence.current});setRecordDialog(null);}}/>}
  {accessToken&&imagesTruck&&<TruckImageManager token={accessToken} truckId={imagesTruck.id} truckLabel={String(imagesTruck.plate_number??"Truck")} onClose={()=>setImagesTruck(null)}/>}
  {accessToken&&photoProduct&&<ProductPhotoManager token={accessToken} productId={photoProduct.id} productLabel={String(photoProduct.name??"Product")} onClose={()=>setPhotoProduct(null)}/>}
 </div>;
}
