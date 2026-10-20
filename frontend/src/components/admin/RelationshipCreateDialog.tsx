import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { saveMasterData, type MasterDataKey } from "../../services/master-data.service";
import { searchRelationshipOptions, toRelationshipOption, type RelationshipKind, type RelationshipOption } from "../../services/lookup.service";

export const creatableRelationship = (kind:RelationshipKind):kind is "warehouses"|"stores"|"products"|"customers" => ["warehouses","stores","products","customers"].includes(kind);
export const normalizeRelationship = (value:string) => value.normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase();

/** Explicit creation through the existing authorized master-data API, never typed FK values. */
export default function RelationshipCreateDialog({token,kind,initialValue,customerId,onCreated,onCancel,defaults={},zIndex=2200}:{
 token:string;kind:MasterDataKey;initialValue:string;customerId?:string;defaults?:Record<string,string>;zIndex?:number;
 onCreated:(option:RelationshipOption)=>void;onCancel:()=>void;
}){
 const [values,setValues]=useState<Record<string,string>>(()=>({name:initialValue,code:kind==="warehouses"?initialValue:"",sku:"",model_code:"",customer_id:customerId??"",...defaults}));
 const [customers,setCustomers]=useState<RelationshipOption[]>([]),[query,setQuery]=useState("");
 const [addingCustomer,setAddingCustomer]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");const saving=useRef(false),root=useRef<HTMLDivElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;root.current?.querySelector<HTMLInputElement>("input")?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[]);
 useEffect(()=>{if(kind!=="stores")return;let live=true;const timer=setTimeout(()=>{void searchRelationshipOptions(token,"customers",query).then(rows=>{if(live)setCustomers(rows);}).catch(()=>{if(live)setError("Unable to load customers. Please try again.");});},150);return()=>{live=false;clearTimeout(timer);};},[kind,query,token]);
 async function submit(event:FormEvent){event.preventDefault();if(saving.current)return;saving.current=true;setBusy(true);setError("");try{
  const payload:Record<string,unknown>={...values,status:"ACTIVE"};
  if(kind!=="products"){delete payload.sku;delete payload.model_code;}
  if(kind!=="stores")delete payload.customer_id;
  if(kind==="products")delete payload.code;
  const saved=await saveMasterData(token,kind,payload);
  const option=toRelationshipOption(kind,saved);if(!option)throw Error("The saved record could not be selected. Search for it again.");onCreated(option);
 }catch{setError("Unable to create this record. Check the required details and try again.");}finally{saving.current=false;setBusy(false);}}
 const field=(key:string,label:string,required=false)=><label key={key} className="grid gap-1 text-xs text-slate-600">{label}<input required={required} disabled={busy} value={values[key]??""} onChange={event=>setValues(current=>({...current,[key]:event.target.value}))} className="h-8 rounded border border-slate-300 px-2 text-sm text-slate-800"/></label>;
 return createPortal(<div data-relationship-create style={{zIndex}} className="fixed inset-0 flex items-center justify-center bg-slate-900/30 p-4" onMouseDown={event=>event.stopPropagation()} onKeyDown={event=>{event.stopPropagation();if(event.key==="Escape"){event.stopPropagation();if(!busy)onCancel();}if(event.key==="Tab"){const controls=Array.from(root.current?.querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),button:not(:disabled)')??[]);if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus();}}}}>
  <div ref={root} role="dialog" aria-modal="true" aria-label={`Add ${kind}`} className="w-full max-w-sm rounded-md border border-slate-200 bg-white p-4 shadow-xl"><h2 className="mb-3 text-sm font-semibold">Add {kind==="stores"?"destination":kind.replace(/s$/,"")}</h2>
   <form onSubmit={event=>{event.stopPropagation();void submit(event);}} className="grid gap-3">
    {field("name","Name",true)}
    {kind!=="products"&&field("code","Code",kind==="warehouses"||kind==="customers")}
    {kind==="stores"&&<><label className="grid gap-1 text-xs">Customer search<input value={query} disabled={busy||Boolean(customerId)} onChange={event=>setQuery(event.target.value)} placeholder="Search customers" className="h-8 rounded border px-2"/></label><label className="grid gap-1 text-xs">Customer<select required disabled={busy||Boolean(customerId)} value={values.customer_id} onChange={event=>setValues(current=>({...current,customer_id:event.target.value}))} className="h-8 rounded border px-2"><option value="">Select customer</option>{customerId&&!customers.some(option=>option.id===customerId)&&<option value={customerId}>Current trip customer</option>}{customers.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>{!customerId&&<button type="button" disabled={busy} onClick={()=>setAddingCustomer(true)} className="text-left text-xs text-blue-700">+ Add customer</button>}{field("address","Address")}{field("city","City")}{field("province","Province")}</>}
    {kind==="products"&&<>{field("sku","SKU",true)}{field("model_code","Model code",true)}{field("category","Category")}</>}
    {error&&<p role="alert" className="text-xs text-rose-700">{error}</p>}<div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={onCancel} className="px-3 py-1 text-xs">Cancel</button><button type="submit" disabled={busy} className="rounded bg-blue-700 px-3 py-1.5 text-xs text-white disabled:opacity-50">{busy?"Creating...":"Create and select"}</button></div>
   </form>
  </div>{addingCustomer&&<RelationshipCreateDialog token={token} kind="customers" zIndex={zIndex+20} initialValue={query} onCancel={()=>setAddingCustomer(false)} onCreated={option=>{setCustomers(current=>[option,...current.filter(row=>row.id!==option.id)]);setValues(current=>({...current,customer_id:option.id}));setAddingCustomer(false);}}/>}</div>,document.body);
}
