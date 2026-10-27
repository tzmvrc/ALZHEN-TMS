import {useEffect,useRef,useState,type FormEvent} from "react";
import {createPortal} from "react-dom";
import {LoaderCircle,X} from "lucide-react";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import DatabaseLocationSearch from "./DatabaseLocationSearch";
import type {DatabaseField} from "./DatabaseSpreadsheet";
import {saveMasterData,type MasterDataKey,type MasterDataRow} from "../../services/master-data.service";
import type {RelationshipKind} from "../../services/lookup.service";
import {useOptionalToast} from "../ui/toast-context";

type Props={token:string;resource:MasterDataKey;name:string;fields:DatabaseField[];row:MasterDataRow|null;locationSupported:boolean;onClose:()=>void;onSaved:(row:MasterDataRow)=>void};
const groupFor=(key:string)=>["address","province","city","postal_code","latitude","longitude","region","location_verified"].includes(key)?"Location":["code","name","sku","model_code","category","customer_id","trucking_company_id","plate_number","store_id"].includes(key)?"Identity":"Details";
const initialLabel=(row:MasterDataRow|null,field:DatabaseField)=>{const related=(field.key==="trucking_company_id"?row?.trucking_companies:field.key==="customer_id"?row?.customers:row?.customer_stores) as Record<string,unknown>|undefined;return String(related?.name??row?.[field.key]??"");};
export default function DatabaseRecordDialog({token,resource,name,fields,row,locationSupported,onClose,onSaved}:Props){
 const [form,setForm]=useState<Record<string,string|boolean>>(()=>Object.fromEntries(fields.map(field=>[field.key,field.kind==="boolean"?Boolean(row?.[field.key]):String(row?.[field.key]??(field.key==="status"?"ACTIVE":""))])));
 const [labels,setLabels]=useState(()=>Object.fromEntries(fields.filter(field=>field.kind==="relation").map(field=>[field.key,initialLabel(row,field)])));
 const [errors,setErrors]=useState<Record<string,string>>({}),[error,setError]=useState(""),[saving,setSaving]=useState(false);
 const lock=useRef(false),panel=useRef<HTMLFormElement>(null),alive=useRef(true),toast=useOptionalToast();
 useEffect(()=>{alive.current=true;const previous=document.activeElement as HTMLElement|null;panel.current?.querySelector<HTMLInputElement>('input:not([type="checkbox"])')?.focus();return()=>{alive.current=false;previous?.focus();};},[]);
 const change=(field:string,value:string|boolean)=>{if(lock.current)return;setErrors(current=>({...current,[field]:""}));setError("");setForm(current=>({...current,[field]:value,...(["address","province","city","latitude","longitude"].includes(field)?{location_verified:false}:{})}));};
 const close=()=>{if(!lock.current)onClose();};
 const submit=async(event:FormEvent)=>{
  event.preventDefault();if(lock.current)return;
  const issues:Record<string,string>={};
  for(const field of fields){const value=String(form[field.key]??"").trim();if(field.required&&!value)issues[field.key]=`${field.label} is required.`;
   if(field.kind==="number"&&value){const number=Number(value);if(!Number.isFinite(number))issues[field.key]="Enter a valid number.";else if(field.key==="latitude"&&(number< -90||number>90)||field.key==="longitude"&&(number< -180||number>180))issues[field.key]="Coordinates are outside the valid range.";else if(!["latitude","longitude"].includes(field.key)&&number<0)issues[field.key]="Enter zero or a positive number.";}
   if(field.kind==="select"&&value&&!field.options?.includes(value))issues[field.key]="Choose an available option.";
   if(field.key==="email"&&value&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))issues.email="Enter a valid email address.";
  }
  if(!row&&resource==="products"&&!String(form.sku??"").trim()&&!String(form.model_code??"").trim())issues.sku="Enter a SKU or model code.";
  if(!row&&resource==="stores"&&!String(form.code??"").trim()&&(!String(form.province??"").trim()||!String(form.city??"").trim()))issues.code="Provide a store code, or both province and city.";
  const latitude=String(form.latitude??"").trim(),longitude=String(form.longitude??"").trim();
  if(Boolean(latitude)!==Boolean(longitude)){issues.latitude="Enter both coordinates, or leave both blank.";issues.longitude=issues.latitude;}
  if(form.location_verified===true&&(!latitude||!longitude||!form.address||!form.province||!form.city))issues.location_verified="Complete and review the address, province, city and coordinates first.";
  setErrors(issues);if(Object.keys(issues).length){panel.current?.querySelector<HTMLElement>(`[data-database-field="${Object.keys(issues)[0]}"] input`)?.focus();return;}
  const payload:Record<string,unknown>={};for(const field of fields){if(field.kind==="images"||field.key==="location_verified"&&!locationSupported)continue;const value=form[field.key];payload[field.key]=field.kind==="boolean"?Boolean(value):field.kind==="number"?(String(value??"").trim()?Number(value):null):String(value??"").trim()||null;}
  lock.current=true;setSaving(true);setError("");
  let canonical:MasterDataRow;
  try{canonical=await saveMasterData(token,resource,payload,row?.id);}
  catch(cause){if(alive.current){setError(cause instanceof Error?cause.message:"Unable to save. Your entries are preserved.");setSaving(false);}lock.current=false;return;}
  if(!alive.current)return;lock.current=false;setSaving(false);
  // Only confirmed server values enter the sheet. Joined names are display hints,
  // never foreign-key payloads, until the next authoritative snapshot arrives.
  for(const field of fields.filter(field=>field.kind==="relation")){
   if(canonical[field.key]!==form[field.key])continue;const key=field.key==="customer_id"?"customers":field.key==="trucking_company_id"?"trucking_companies":"customer_stores";
   if(!canonical[key]&&labels[field.key])canonical={...canonical,[key]:{name:labels[field.key]}};
  }
  toast?.addToast({title:row?`${name} updated.`:`${name} saved.`,variant:"success"});onSaved(canonical);
 };
 const inputClass="h-9 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#2678b9] focus:ring-1 focus:ring-[#2678b9]/20 disabled:bg-slate-50";
 return createPortal(<div className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-5 al-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}>
  <form ref={panel} noValidate onSubmit={event=>void submit(event)} role="dialog" aria-modal="true" aria-labelledby="database-record-title" aria-busy={saving} onKeyDown={event=>{if(event.defaultPrevented)return;if(event.key==="Escape"){event.stopPropagation();close();}if(event.key!=="Tab")return;const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]'));const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}} className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
   <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 id="database-record-title" className="text-lg font-semibold text-[#0b2341]">{row?"Edit":"Add"} {name}</h2><p className="mt-1 text-xs text-slate-500">Required fields are marked *. Optional fields may be left blank.</p></div><button type="button" aria-label="Close record form" disabled={saving} onClick={close} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4"/></button></header>
   <div className="min-h-0 overflow-y-auto px-5 py-4">
    {resource==="products"&&<p className="mb-3 text-xs text-slate-500">Provide a SKU or model code to identify this product.</p>}
    {["Identity","Location","Details"].filter(group=>fields.some(field=>groupFor(field.key)===group)).map(group=><fieldset disabled={saving} key={group} className="mb-4 rounded-lg border border-slate-200 p-3 last:mb-0"><legend className="px-1 text-xs font-semibold text-slate-600">{group}</legend>
     {group==="Location"&&<><DatabaseLocationSearch accessToken={token} onSelect={location=>setForm(current=>({...current,address:location.display_name,latitude:String(location.latitude),longitude:String(location.longitude),location_verified:false}))}/>{!locationSupported&&<p className="my-2 text-xs text-amber-800">Location verification is unavailable. Unverified locations remain excluded from routing.</p>}</>}
     <div className="grid gap-3 sm:grid-cols-2">{fields.filter(field=>groupFor(field.key)===group&&field.kind!=="images").map(field=><div key={field.key} data-database-field={field.key} className={`${field.kind==="textarea"||field.key==="location_verified"?"sm:col-span-2":""}`}>
      <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`database-field-${field.key}`}>{field.label}{field.required&&<span className="ml-1 text-rose-600">*</span>}</label>
      {field.kind==="relation"?<SearchableRelationshipEditor token={token} kind={field.source as RelationshipKind} value={labels[field.key]??""} autoFocus={false} disabled={saving} onSelect={option=>{change(field.key,option.id);setLabels(current=>({...current,[field.key]:option.label}));}} onCommitBlur={()=>{}} onCancel={()=>{}}/>:field.kind==="boolean"?<input id={`database-field-${field.key}`} type="checkbox" checked={Boolean(form[field.key])} disabled={saving||field.key==="location_verified"&&!locationSupported} onChange={event=>change(field.key,event.target.checked)} className="h-3.5 w-3.5 accent-[#2678b9]"/>:field.kind==="select"?<select id={`database-field-${field.key}`} value={String(form[field.key]??"")} onChange={event=>change(field.key,event.target.value)} className={inputClass}><option value="">Choose {field.label.toLowerCase()}</option>{field.options?.map(option=><option key={option} value={option}>{option}</option>)}</select>:field.kind==="textarea"?<textarea id={`database-field-${field.key}`} value={String(form[field.key]??"")} onChange={event=>change(field.key,event.target.value)} className={`${inputClass} !h-20 py-2`}/>:<input id={`database-field-${field.key}`} type={field.key==="email"?"email":"text"} inputMode={field.kind==="number"?"decimal":undefined} aria-invalid={!!errors[field.key]} aria-describedby={errors[field.key]?`database-error-${field.key}`:undefined} value={String(form[field.key]??"")} onChange={event=>change(field.key,event.target.value)} className={inputClass}/>}
      {errors[field.key]&&<p id={`database-error-${field.key}`} role="alert" className="mt-1 text-xs text-rose-700">{errors[field.key]}</p>}
     </div>)}</div>
    </fieldset>)}
    {error&&<p role="alert" className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
   </div>
   <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3"><button type="button" disabled={saving} onClick={close} className="h-9 rounded-md border border-slate-200 bg-white px-4 text-xs text-slate-700">Cancel</button><button type="submit" disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-md bg-[#ffd43b] px-4 text-xs font-semibold text-[#0b2341] disabled:opacity-50">{saving&&<LoaderCircle className="h-3.5 w-3.5 animate-spin"/>}{saving?"Saving...":row?"Save changes":"Create record"}</button></footer>
  </form>
 </div>,document.body);
}
