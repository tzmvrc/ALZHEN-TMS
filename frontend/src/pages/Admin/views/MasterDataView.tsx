import {Activity,useEffect,useRef,useState} from "react";
import {useAuth} from "../../../context/AuthContext";
import {SPREADSHEET_PANEL_CLASS} from "../../../components/admin/SpreadsheetPresentation";
import DatabaseSpreadsheet from "../../../components/admin/DatabaseSpreadsheet";
import DatabaseRecordDialog from "../../../components/admin/DatabaseRecordDialog";
import {SpreadsheetSheetHeader,SpreadsheetBottomToolbar} from "../../../components/admin/SpreadsheetWorkspace";
import {setPageSection} from "../../../components/admin/pageSection";
import {useRegisterTopbarSearch} from "../../../components/admin/topbarSearch";
import {useRegisterTopbarAction} from "../../../components/admin/topbarActions";
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
 useEffect(()=>setPageSection("database",config.label),[config.label]);
 useRegisterTopbarSearch(`database:${config.label}`,{kind:"field",value:searches[section]??"",placeholder:`Search ${config.label.toLowerCase()}...`,label:`Search ${config.label.toLowerCase()}`,onChange:value=>setSearches(current=>({...current,[section]:value}))});
 const formConfig=recordDialog?databaseResources.find(resource=>resource.key===recordDialog.resource):null;
 const canEdit=["ADMIN","STAFF"].includes(profile?.role??"");
 const openForm=(resource:MasterDataKey,row:MasterDataRow|null=null)=>setRecordDialog({resource,row,key:++saveSequence.current});
 useRegisterTopbarAction(`database:${config.label}`,"add",canEdit?{label:`Add ${singular[section]}`,onClick:()=>openForm(section)}:null);
 if(!accessToken||!canEdit)return null;
 return <div ref={workspace} data-database-workspace className="database-workspace flex min-h-0 min-w-0 flex-1 flex-col gap-2">
  <SpreadsheetSheetHeader title={config.label} description="Manage shared records and reviewed locations"/>
  <section className={`${SPREADSHEET_PANEL_CLASS} database-sheet-panel flex min-h-0 flex-1 flex-col`}>
   {databaseResources.filter(resource=>visited.has(resource.key)).map(resource=><Activity key={resource.key} mode={section===resource.key?"visible":"hidden"}><DatabaseSpreadsheet resource={resource.key} fields={resource.fields} hiddenColumnsTarget={hiddenColumnsTarget} token={accessToken??""} profileId={profile?.id} canEdit={canEdit} active={section===resource.key} search={searches[resource.key]??""} revision={0} confirmedRecord={confirmed?.resource===resource.key?confirmed:undefined} onEdit={row=>openForm(resource.key,row)} onMetadata={supported=>setMetadata(current=>current[resource.key]===supported?current:{...current,[resource.key]:supported})} onImage={resource.key==="trucks"?setImagesTruck:resource.key==="products"?setPhotoProduct:undefined}/></Activity>)}
   <SpreadsheetBottomToolbar workspace={workspace} sheet={`db-${section}`} onHiddenColumnsTarget={setHiddenColumnsTarget}>
    <nav role="tablist" aria-label="Database sheets" className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{databaseResources.map(resource=><button key={resource.key} type="button" role="tab" aria-selected={section===resource.key} onClick={()=>{setVisited(current=>new Set([...current,resource.key]));setSection(resource.key);}} className={`shrink-0 cursor-pointer whitespace-nowrap border-r border-slate-200 px-3 py-1.5 text-[11px] ${section===resource.key?"relative -mt-px border-t border-t-white bg-white text-[#0b2341]":"bg-slate-100 text-slate-500 hover:bg-slate-50"}`}>{resource.label}</button>)}</nav>
   </SpreadsheetBottomToolbar>
  </section>
  {accessToken&&recordDialog&&formConfig&&<DatabaseRecordDialog key={recordDialog.key} token={accessToken} resource={recordDialog.resource} name={singular[recordDialog.resource]} fields={formConfig.fields} row={recordDialog.row} locationSupported={metadata[recordDialog.resource]??false} onClose={()=>setRecordDialog(null)} onSaved={row=>{setConfirmed({resource:recordDialog.resource,row,sequence:++saveSequence.current});setRecordDialog(null);}}/>}
  {accessToken&&imagesTruck&&<TruckImageManager token={accessToken} truckId={imagesTruck.id} truckLabel={String(imagesTruck.plate_number??"Truck")} onClose={()=>setImagesTruck(null)}/>}
  {accessToken&&photoProduct&&<ProductPhotoManager token={accessToken} productId={photoProduct.id} productLabel={String(photoProduct.name??"Product")} onClose={()=>setPhotoProduct(null)}/>}
 </div>;
}
