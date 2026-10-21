import {useState} from "react";
import {createPortal} from "react-dom";
import {ImagePlus,X} from "lucide-react";
import {useTruckImages,refreshTruckImages} from "../../services/truck-image-cache";
import type {TruckImage} from "../../services/master-data.service";
export default function TruckImagesCell({token,truckId,canEdit,onManage}:{token:string;truckId:string;canEdit:boolean;onManage:()=>void}){
 const gallery=useTruckImages(token,truckId),[preview,setPreview]=useState<TruckImage|null>(null),[broken,setBroken]=useState(()=>new Set<string>());
 return <div className="flex min-h-8 max-w-full flex-wrap items-center gap-1" onClick={event=>event.stopPropagation()}>
  {gallery.images.slice(0,3).map(image=><button key={image.id} type="button" aria-label={`Preview ${image.file_name}`} title={image.file_name} className="h-7 w-9 shrink-0 overflow-hidden rounded border border-slate-200 bg-slate-50" onClick={()=>setPreview(image)}>{broken.has(image.signed_url)?<span className="text-[9px] text-slate-400">Image</span>:<img src={image.signed_url} alt={image.file_name} loading="lazy" className="h-full w-full object-cover" onError={()=>setBroken(current=>new Set([...current,image.signed_url]))}/>}</button>)}
  {gallery.images.length>3&&<button type="button" title="View all truck images" onClick={onManage} className="text-[10px] text-slate-500">+{gallery.images.length-3}</button>}
  {canEdit&&<button type="button" aria-label="Manage truck images" title="Upload or manage images" onClick={onManage} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#2678b9] hover:bg-blue-50"><ImagePlus className="h-3.5 w-3.5"/></button>}
  {gallery.loading&&!gallery.images.length&&<span aria-label="Loading truck images" className="h-5 w-8 animate-pulse rounded bg-slate-100"/>}
  {gallery.error&&<button type="button" title={gallery.error} onClick={()=>void refreshTruckImages(token,truckId,true)} className="text-[10px] text-rose-700">Retry images</button>}
  {preview&&createPortal(<div role="presentation" className="fixed inset-0 z-[2600] flex items-center justify-center bg-slate-900/60 p-5" onClick={()=>setPreview(null)} onKeyDown={event=>{if(event.key==="Escape"){event.stopPropagation();setPreview(null);}}}><section role="dialog" aria-modal="true" aria-label={`Preview ${preview.file_name}`} className="relative max-h-full max-w-full" onClick={event=>event.stopPropagation()}><button autoFocus type="button" onClick={()=>setPreview(null)} aria-label="Close truck image preview" className="absolute right-2 top-2 rounded-full bg-white p-2 text-slate-700"><X className="h-4 w-4"/></button><img src={preview.signed_url} alt={preview.file_name} className="max-h-[80vh] max-w-[90vw] rounded-lg object-contain"/><p className="mt-2 text-center text-xs text-white">{preview.file_name}</p></section></div>,document.body)}
 </div>;
}
