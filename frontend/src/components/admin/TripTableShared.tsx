import {forwardRef,useEffect,useLayoutEffect,useRef,useState,type ComponentPropsWithoutRef,type KeyboardEvent,type ReactNode,type Ref} from "react";
import {createPortal} from "react-dom";
import "./MasterListView.css";

export type TripTableAction={label:string;disabled?:boolean;danger?:boolean;onClick:()=>void|Promise<void>};
export function TripTableMenuItem({label,onClick,disabled=false,autoFocus=false,danger=false}:{label:string;onClick:()=>void;disabled?:boolean;autoFocus?:boolean;danger?:boolean}){
  return <button type="button" role="menuitem" disabled={disabled} autoFocus={autoFocus} onClick={onClick} className={"ml-menu-item"+(danger?" ml-menu-danger":"")}>{label}</button>;
}
export function TripTableActions({items,onClose}:{items:TripTableAction[];onClose:()=>void}){
  return <>{items.map(item=><TripTableMenuItem key={item.label} {...item} onClick={()=>{void item.onClick();onClose();}}/>)}</>;
}
/** The Master List menu host, shared by every Trips table. Actions never own database operations. */
export function TripTableContextMenu({x,y,onClose,label="Table actions",children}:{x:number;y:number;onClose:()=>void;label?:string;children:ReactNode}){
  const panel=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose;
  const [position,setPosition]=useState({left:x,top:y});
  useLayoutEffect(()=>{
    const element=panel.current;if(!element)return;
    const bounds=element.getBoundingClientRect();
    setPosition({left:Math.max(8,Math.min(x,window.innerWidth-bounds.width-8)),top:Math.max(8,Math.min(y,window.innerHeight-bounds.height-8))});
    element.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')?.focus({preventScroll:true});
  },[x,y]);
  useEffect(()=>{
    const dismiss=(event:Event)=>{if(event.target instanceof Node&&panel.current?.contains(event.target))return;close.current();};
    const escape=(event:globalThis.KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();close.current();}};
    window.addEventListener("resize",dismiss);document.addEventListener("keydown",escape,true);
    let frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>window.addEventListener("scroll",dismiss,true));});
    return()=>{cancelAnimationFrame(frame);window.removeEventListener("resize",dismiss);window.removeEventListener("scroll",dismiss,true);document.removeEventListener("keydown",escape,true);};
  },[]);
  return createPortal(<div className="ml-menu-backdrop" onPointerDown={onClose}><div ref={panel} role="menu" aria-label={label} className="ml-menu" data-spreadsheet-context-menu style={position} onPointerDown={event=>event.stopPropagation()} onContextMenu={event=>event.preventDefault()} onKeyDown={event=>{
    if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)'));
    const current=items.indexOf(document.activeElement as HTMLButtonElement);
    items[event.key==="Home"?0:event.key==="End"?items.length-1:(current+(event.key==="ArrowUp"?-1:1)+items.length)%items.length]?.focus({preventScroll:true});
  }}>{children}</div></div>,document.body);
}
export function TripTableFormatDialog({children,onClose}:{children:ReactNode;onClose:()=>void}){
  return createPortal(<div className="ml-format-backdrop" role="presentation" onPointerDown={()=>onClose()}><div className="ml-format-dialog" role="dialog" aria-modal="true" aria-label="Format selection" data-spreadsheet-formatting onPointerDown={event=>event.stopPropagation()} onKeyDown={event=>{if(event.key==="Escape"){event.stopPropagation();onClose();}}}><div className="ml-format-dialog-head"><strong>Format selection</strong><button type="button" autoFocus aria-label="Close formatting" onClick={onClose}>×</button></div>{children}</div></div>,document.body);
}
/** Same cell host for Master List's virtual grid and report tables' semantic cells. */
type DivCell={as:"div"}&ComponentPropsWithoutRef<"div">;
type DataCell={as?:"td"}&ComponentPropsWithoutRef<"td">;
export const TripTableCell=forwardRef<HTMLDivElement|HTMLTableCellElement,DivCell|DataCell>(function TripTableCell({as="td",...props},ref){
  if(as==="div")return <div {...props as ComponentPropsWithoutRef<"div">} ref={ref as Ref<HTMLDivElement>} data-trip-sheet-cell="true"/>;
  const cell=props as ComponentPropsWithoutRef<"td">&{"data-spreadsheet-selected"?:string;"data-formula-selected"?:string;"data-trip-editable"?:boolean};
  const selected=cell["data-spreadsheet-selected"]==="true"||cell["data-formula-selected"]==="true";
  return <td {...cell} ref={ref as Ref<HTMLTableCellElement>} data-trip-sheet-cell="true"><div style={{minWidth:0,maxWidth:"100%",alignItems:cell.style?.textAlign==="right"?"flex-end":cell.style?.textAlign==="center"?"center":cell.style?.textAlign==="left"?"flex-start":undefined}} className={"ml-cell trip-table-cell-surface"+(selected?" ml-selected-cell":"")+(cell["data-trip-editable"]?" ml-editable":"")+(cell.style?.backgroundColor?" ml-formatted-cell":"")}>{cell.children}</div></td>;
});
/** Master List activation keys. Source-specific validation stays in the commit callback. */
export function tripTableEditorKey(event:KeyboardEvent<HTMLInputElement|HTMLTextAreaElement>,commit:()=>void,cancel:()=>void,multiline=false){
  if(event.nativeEvent.isComposing)return;
  if((event.key==="Enter"&&(!multiline||!event.shiftKey))||event.key==="Tab"){
    if(event.key!=="Tab")event.preventDefault();
    event.stopPropagation();commit();
  }else if(event.key==="Escape"){event.preventDefault();event.stopPropagation();cancel();}
}

/** Commands run against an adapter's selected records, never Master List's sources. */
export function tripTableShortcut(event:KeyboardEvent<HTMLElement>,actions:readonly TripTableAction[],openContext?:()=>void){
  if((event.target as Element).closest('input,textarea,select,[role="combobox"],[contenteditable=true]'))return false;
  const key=event.key.toLowerCase();
  if((key==="contextmenu"||event.shiftKey&&key==="f10")&&openContext){event.preventDefault();event.stopPropagation();openContext();return true;}
  if(key==="delete"||key==="backspace"){
    const action=actions.find(action=>action.label==="Clear selected comments");if(!action)return false;
    event.preventDefault();event.stopPropagation();if(!action.disabled)void action.onClick();return true;
  }
  if(!event.ctrlKey&&!event.metaKey)return false;
  const label=key==="a"?"Select all":key==="x"?"Cut":key==="z"?(event.shiftKey?"Redo":"Undo"):key==="y"?"Redo":null;
  if(!label)return false;
  const action=actions.find(action=>action.label===label);if(!action)return false;
  event.preventDefault();event.stopPropagation();if(!action.disabled)void action.onClick();return true;
}

type GridHeader={as:"div"}&ComponentPropsWithoutRef<"div">;
type TableHeader={as?:"th"}&ComponentPropsWithoutRef<"th">;
const HeaderHost=forwardRef<HTMLDivElement|HTMLTableCellElement,GridHeader|TableHeader>(function TripTableHeader({as="th",...props},ref){
  if(as==="div")return <div {...props as ComponentPropsWithoutRef<"div">} ref={ref as Ref<HTMLDivElement>} data-trip-table-header/>;
  return <th {...props as ComponentPropsWithoutRef<"th">} ref={ref as Ref<HTMLTableCellElement>} data-trip-table-header/>;
});

export const TripTableHeader=HeaderHost as {
 (props:GridHeader&{ref?:Ref<HTMLDivElement>}):ReactNode;
 (props:TableHeader&{ref?:Ref<HTMLTableCellElement>}):ReactNode;
};

/** Fixed column tracks prevent long values and grouped previews from sizing a table. */
export function TripTableColumnTracks({columns}:{columns:readonly {key:string;width:number}[]}){
 return <colgroup>{columns.map(column=><col key={column.key} style={{width:column.width}}/>)}</colgroup>;
}
