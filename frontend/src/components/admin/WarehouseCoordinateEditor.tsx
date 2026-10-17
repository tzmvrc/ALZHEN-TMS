import {useEffect,useState} from "react";
import {useAuth} from "../../context/AuthContext";
import {fetchMasterData,getCachedMasterData,type MasterDataPage} from "../../services/master-data.service";
import {coordinateDraft} from "../../services/coordinate-draft";
import type {RoadTrip,Point} from "../../services/road-routing";
import RoadRouteMap from "./RoadRouteMap";

export default function WarehouseCoordinateEditor({offlineStyle=false}:{offlineStyle?:boolean}){
 const {accessToken,profile}=useAuth(),allowed=profile&&["ADMIN","STAFF"].includes(profile.role);
 const [page,setPage]=useState(1),[snapshot,setSnapshot]=useState<{token:string;page:number;data:MasterDataPage}|null>(null),[error,setError]=useState("");
 const [draft,setDraft]=useState<{token:string;id:string;latitude:string;longitude:string}|null>(null);
 const data=accessToken&&allowed?(snapshot?.token===accessToken&&snapshot.page===page?snapshot.data:getCachedMasterData(accessToken,"warehouses","",page)):null;
 const rows=data?.rows??[],selected=rows.find(r=>r.id===(draft?.token===accessToken?draft.id:null))??rows[0];
 const latitude=draft?.token===accessToken&&draft.id===selected?.id?draft.latitude:String(selected?.latitude??""),longitude=draft?.token===accessToken&&draft.id===selected?.id?draft.longitude:String(selected?.longitude??"");
 const point=coordinateDraft(latitude,longitude),saved=coordinateDraft(String(selected?.latitude??""),String(selected?.longitude??""));
 const choose=(id:string)=>{const row=rows.find(r=>r.id===id);if(accessToken&&row)setDraft({token:accessToken,id,latitude:String(row.latitude??""),longitude:String(row.longitude??"")});};
 const pick=(p:Point)=>{if(selected&&accessToken)setDraft({token:accessToken,id:selected.id,latitude:p.latitude.toFixed(6),longitude:p.longitude.toFixed(6)});};
 useEffect(()=>{if(!accessToken||!allowed)return;let current=true;void fetchMasterData(accessToken,"warehouses","",page).then(data=>{if(current){setSnapshot({token:accessToken,page,data});setError("");}}).catch(()=>{if(current)setError("Warehouses could not load. Existing data is retained.");});return()=>{current=false;};},[accessToken,allowed,page]);
 if(!allowed)return null;
 const mapRows:RoadTrip[]=selected?[{key:selected.id,assignmentId:null,tripId:"",dispatchNumber:null,plateNumber:null,driverName:null,warehouse:{id:selected.id,name:String(selected.name??selected.code??"Warehouse"),point:saved},stops:[],position:null,cache:null}]:[];
 return <section className="space-y-3 rounded border bg-white p-3" aria-label="Warehouse coordinate preparation"><h3 className="font-semibold">Warehouse coordinate preparation</h3><p className="text-sm text-amber-800">Local preview only. Saving coordinates requires separate approval. Existing values remain unchanged.</p>
  {error&&<p role="alert">{error}</p>}{!data&&!error&&<p role="status">Loading warehouses…</p>}
  {data&&<><label className="block text-sm">Warehouse<select aria-label="Warehouse coordinates record" className="ml-2 rounded border p-2" value={selected?.id??""} onChange={e=>choose(e.target.value)}>{rows.map(r=><option key={r.id} value={r.id}>{String(r.name??r.code??r.id)} — {coordinateDraft(String(r.latitude??""),String(r.longitude??""))?"Coordinates present":"Coordinates missing"}</option>)}</select></label><p className="text-sm">Saved: {saved?`${saved.latitude}, ${saved.longitude}`:"No verified coordinate pair"}</p>
  <div className="flex flex-wrap gap-3"><label>Latitude<input aria-label="Draft latitude" className="ml-2 w-36 rounded border p-2" inputMode="decimal" value={latitude} onChange={e=>accessToken&&selected&&setDraft({token:accessToken,id:selected.id,latitude:e.target.value,longitude})}/></label><label>Longitude<input aria-label="Draft longitude" className="ml-2 w-36 rounded border p-2" inputMode="decimal" value={longitude} onChange={e=>accessToken&&selected&&setDraft({token:accessToken,id:selected.id,latitude,longitude:e.target.value})}/></label></div>
  <p role="status" className="text-sm">{point?`Preview before saving: latitude ${point.latitude}, longitude ${point.longitude}. GeoJSON order: [${point.longitude}, ${point.latitude}].`:"Choose a pin or enter latitude −90 to 90 and longitude −180 to 180."}</p>
  <RoadRouteMap rows={mapRows} mode="planned" selected={selected?.id??""} onSelect={choose} onCoordinatePick={pick} draftPoint={point} offlineStyle={offlineStyle} height={300}/>
  <p className="text-sm">Click the map to place the Draft pin. W shows the existing saved location; map navigation does not assign coordinates.</p><button type="button" disabled className="rounded border px-3 py-2 text-sm opacity-50">Save coordinates (approval required)</button>
  <div className="flex items-center gap-2 text-sm"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page} of {data.pagination.totalPages||1}</span><button disabled={page>=data.pagination.totalPages} onClick={()=>setPage(p=>p+1)}>Next</button></div></>}
 </section>;
}
