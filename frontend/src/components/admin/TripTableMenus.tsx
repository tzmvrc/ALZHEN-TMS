import {useState,type ReactNode} from "react";
import {TripTableFullFormatToolbar} from "./TripTableFullFormatToolbar";
import type {ReportCellFormat} from "./ReportSpreadsheetUtils";
import {TripTableContextMenu,TripTableMenuItem,TripTableActions,TripTableFormatDialog,type TripTableAction} from "./TripTableShared";

let copiedFormat:ReportCellFormat|null=null;
type FormattingSelection={count:number;format:ReportCellFormat;canFormat:boolean;onApply:(change:Partial<ReportCellFormat>)=>void};
function SelectionFormatToolbar({selection}:{selection:FormattingSelection}){
 const {count,format,canFormat,onApply}=selection;
 const [copied,setCopied]=useState(copiedFormat);
 return <TripTableFullFormatToolbar selectedFontSize={format.fontSize??13} selectedCellCount={canFormat?count:0} selectionIsUnderlined={Boolean(format.underline)} selectionIsBold={Boolean(format.bold)} selectionIsItalic={Boolean(format.italic)} selectedTextColor={format.color??null} selectedBackgroundColor={format.backgroundColor??null} onApply={onApply} fontFamily={format.fontFamily??"Inter"} copied={Boolean(copied)} onCopy={()=>{copiedFormat={...format};setCopied(copiedFormat);}} onPaste={()=>{if(copied)onApply({...copied});}} onClear={()=>onApply({bold:false,italic:false,underline:false,color:"",backgroundColor:"",fontSize:13,fontFamily:"Inter",alignment:null})}/>;
}

export function TripTableFormatActions({count,canFormat,copied,onFormat,onCopy,onPaste,onClear,onClose}:{count:number;canFormat:boolean;copied:boolean;onFormat:()=>void;onCopy:()=>void;onPaste:()=>void;onClear:()=>void;onClose:()=>void}){
  return <TripTableActions onClose={onClose} items={[
    {label:"Format selection…",disabled:!canFormat||!count,onClick:onFormat},
    {label:"Copy formatting",disabled:!count,onClick:onCopy},
    {label:"Paste formatting",disabled:!canFormat||!count||!copied,onClick:onPaste},
    {label:"Clear formatting",disabled:!canFormat||!count,onClick:onClear},
  ]}/>;
}
export function TripTableCellMenu({x,y,count,format,canFormat,onApply,onSelectRow,onSelectColumn,onClose,actions,dangerActions}:{x:number;y:number;count:number;format:ReportCellFormat;canFormat:boolean;onApply:(change:Partial<ReportCellFormat>)=>void;onSelectRow:()=>void;onSelectColumn:()=>void;onClose:()=>void;actions?:ReactNode;dangerActions?:ReactNode}){
  const [formatOpen,setFormatOpen]=useState(false);
  return <>{!formatOpen&&<TripTableContextMenu x={x} y={y} onClose={onClose} label="Table selection actions">
    {actions}
    <TripTableMenuItem label="Select row" onClick={()=>{onSelectRow();onClose();}}/>
    <TripTableMenuItem label="Select column" onClick={()=>{onSelectColumn();onClose();}}/>
    <TripTableFormatActions count={count} canFormat={canFormat} copied={Boolean(copiedFormat)} onFormat={()=>setFormatOpen(true)} onCopy={()=>{copiedFormat={...format};onClose();}} onPaste={()=>{if(copiedFormat)onApply({...copiedFormat});onClose();}} onClear={()=>{onApply({bold:false,italic:false,underline:false,color:"",backgroundColor:"",fontSize:13,fontFamily:"Inter",alignment:null});onClose();}} onClose={()=>{ /* Format opens a dialog; other actions close through the host below. */ }}/>
    {dangerActions}
  </TripTableContextMenu>}
  {formatOpen&&<TripTableFormatDialog onClose={onClose}><SelectionFormatToolbar selection={{count,format,canFormat,onApply}}/></TripTableFormatDialog>}
  </>;
}
export type TripTableSortAction={label:"Sort ascending"|"Sort descending";active:boolean;onClick:()=>void};
/** Report capabilities add to the Master List actions; no report has its own menu event loop. */
export function TripTableColumnMenu({title,position,onClose,sortActions,pinned,onTogglePin,onEditColumn,onFilter,canManageOptions,onManageOptions,onRename,onRestoreTitle,onConfigureInput,onHide,canHide=true,extraActions=[],selection}:{title:string;position:{left:number;top:number};onClose:()=>void;sortActions?:TripTableSortAction[];pinned:boolean;onTogglePin:()=>void;onEditColumn:()=>void;onFilter?:()=>void;canManageOptions?:boolean;onManageOptions?:()=>void;onRename?:()=>void;onRestoreTitle?:()=>void;onConfigureInput?:()=>void;onHide:()=>void;canHide?:boolean;extraActions?:TripTableAction[];viewportBounded?:boolean;selection?:FormattingSelection}){
  const [formatOpen,setFormatOpen]=useState(false);
  const select=extraActions.filter(action=>action.label==="Select column");
  const rest=extraActions.filter(action=>action.label!=="Select column"&&(!selection||!action.label.startsWith("Format selection")));
  const actions:TripTableAction[]=[...select,...(sortActions??[]),...(canHide?[{label:"Hide column",onClick:onHide}]:[]),...rest,
    ...(pinned?[{label:"Unpin column",onClick:onTogglePin}]:extraActions.some(action=>action.label==="Pin left")?[]:[{label:"Pin left",onClick:onTogglePin}]),
    ...(onFilter?[{label:"Filter this column",onClick:onFilter}]:[]),
    ...(onRename?[{label:"Rename column",onClick:onRename}]:[]),...(onRestoreTitle?[{label:"Restore default column title",onClick:onRestoreTitle}]:[]),
    ...(onConfigureInput?[{label:"Configure input type / option colors",onClick:onConfigureInput}]:[]),
    {label:"Edit column appearance",onClick:onEditColumn},...(canManageOptions&&onManageOptions?[{label:"Manage options",onClick:onManageOptions}]:[])
  ];
  return <>{!formatOpen&&<TripTableContextMenu x={position.left} y={position.top} label={title+" column actions"} onClose={onClose}><TripTableActions items={actions} onClose={onClose}/>{selection&&<TripTableFormatActions count={selection.count} canFormat={selection.canFormat} copied={Boolean(copiedFormat)} onFormat={()=>setFormatOpen(true)} onCopy={()=>{copiedFormat={...selection.format};onClose();}} onPaste={()=>{if(copiedFormat)selection.onApply({...copiedFormat});onClose();}} onClear={()=>{selection.onApply({bold:false,italic:false,underline:false,color:"",backgroundColor:"",fontSize:13,fontFamily:"Inter",alignment:null});onClose();}} onClose={()=>{}}/>}</TripTableContextMenu>}{formatOpen&&selection&&<TripTableFormatDialog onClose={onClose}><SelectionFormatToolbar selection={selection}/></TripTableFormatDialog>}</>;
}
