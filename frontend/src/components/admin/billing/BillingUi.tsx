import {useEffect,useId,useRef,type ReactNode} from "react";
import {X} from "lucide-react";

export const billingButton="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#e4e9f0] bg-white px-3 text-xs font-medium text-[#0b2343] hover:bg-[#f0f5fc] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[#0b2343]";
export const billingPrimary=`${billingButton} !border-[#0b2343] !bg-[#0b2343] !text-white hover:!bg-[#17385f]`;
export const billingInput="h-9 w-full rounded-lg border border-[#e4e9f0] bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#0b2343] focus:ring-2 focus:ring-[#0b2343]/15";
export function BillingStatus({value}:{value:string}){
 const tone=value==="Paid"||value==="Matched"?"bg-emerald-50 text-emerald-700 ring-emerald-200":value==="Overdue"||value==="Missing rate"?"bg-rose-50 text-rose-700 ring-rose-200":value==="For Review"||value==="Partial payment"?"bg-amber-50 text-amber-800 ring-amber-200":value==="Submitted"?"bg-blue-50 text-blue-700 ring-blue-200":"bg-slate-100 text-slate-600 ring-slate-200";
 return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tone}`}><span aria-hidden className="h-1 w-1 rounded-full bg-current"/>{value}</span>;
}
export function BillingField({label,children}:{label:string;children:ReactNode}){return <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">{label}{children}</label>;}
export function BillingDialog({title,description,children,onClose,wide=false}:{title:string;description?:string;children:ReactNode;onClose:()=>void;wide?:boolean}){
 const ref=useRef<HTMLDialogElement>(null),titleId=useId(),descriptionId=useId();
 useEffect(()=>{const element=ref.current;if(element&&!element.open)element.showModal();return()=>element?.close();},[]);
 return <dialog ref={ref} aria-labelledby={titleId} aria-describedby={description?descriptionId:undefined} onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===event.currentTarget){const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)onClose();}}} className={`m-auto max-h-[90vh] w-[calc(100%_-_2rem)] overflow-auto rounded-[20px] border border-[#e9edf4] bg-white p-0 text-slate-800 shadow-xl ${wide?"max-w-5xl":"max-w-lg"}`}>
  <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4"><div><h2 id={titleId} className="text-base font-bold text-[#0b2341]">{title}</h2>{description&&<p id={descriptionId} className="mt-1 text-xs text-slate-500">{description}</p>}</div><button autoFocus type="button" aria-label="Close dialog" onClick={onClose} className="rounded p-1 hover:bg-slate-100"><X className="h-4 w-4"/></button></header>
  <div className="space-y-4 p-5">{children}</div>
 </dialog>;
}
