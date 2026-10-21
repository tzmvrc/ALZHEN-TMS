import { useRef,type InputHTMLAttributes } from "react";
import { Pencil } from "lucide-react";
/** Labels edit in place; internal values never appear in this control. */
export function OptionLabelEditor(props:InputHTMLAttributes<HTMLInputElement>){
 const input=useRef<HTMLInputElement>(null);
 return <span className="flex min-w-0 flex-1 items-center gap-1"><input {...props} ref={input}/><button type="button" disabled={props.disabled} title="Rename option" aria-label="Rename option" onClick={()=>{input.current?.focus();input.current?.select();}} className="cursor-pointer p-1 text-slate-500 disabled:opacity-40"><Pencil className="h-3.5 w-3.5"/></button></span>;
}
