import {useEffect,useState,type InputHTMLAttributes} from "react";

/** Shared CSV-preview/request cell: Enter commits, Escape restores, Tab stays native. */
export default function ImportPreviewInput({value,onCommit,onDraftChange,onKeyDown,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,"value"|"onChange"|"onBlur">&{value:string;onCommit:(value:string)=>void;onDraftChange?:(changed:boolean)=>void}) {
  const [draft,setDraft]=useState(value);
  useEffect(()=>setDraft(value),[value]);
  return <input {...props} data-preview-value={value} value={draft} onChange={event=>{const next=event.target.value;setDraft(next);onDraftChange?.(next!==value);}} onBlur={()=>{if(draft!==value)onCommit(draft);onDraftChange?.(false);}} onKeyDown={event=>{
    if(event.key==="Enter"){event.preventDefault();event.currentTarget.blur();}
    if(event.key==="Escape"&&draft!==value){event.stopPropagation();setDraft(value);onDraftChange?.(false);}
    if(event.key==="ArrowDown"||event.key==="ArrowUp"){
      const cell=event.currentTarget.closest("td"),row=cell?.parentElement;
      const next=event.key==="ArrowDown"?row?.nextElementSibling:row?.previousElementSibling;
      const target=cell&&next?.children[cell.cellIndex]?.querySelector<HTMLInputElement>("input:not(:disabled)");
      if(cell)event.preventDefault();
      target?.focus();
    }
    onKeyDown?.(event);
  }}/>;
}
