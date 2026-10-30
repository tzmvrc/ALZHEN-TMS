import {useEffect,useMemo,useRef,useState,type MouseEvent} from "react";
import ModernCellControls from "./ModernCellControls";
import {readReportCellFormats,reportCellFormatKey,reportColumnAppearance,writeReportCellFormats,type ReportCellFormat} from "./ReportSpreadsheetUtils";
import "./OperationalCellFormatting.css";

type Column={key:string;title:string};
type Cell={row:string;column:string};
type Options<Row>={scope:string;userId:string;canFormat:boolean;rows:readonly Row[];columns:readonly Column[];keyOf:(row:Row)=>string;valueOf:(row:Row,column:string)=>string};
/** Compact tables keep row-click details; Format cells mode changes clicks to selection. */
export function useOperationalCellFormatting<Row>({scope,userId,canFormat,rows,columns,keyOf,valueOf}:Options<Row>){
 const storageKey=`alzhen:operational-cell-format:${userId}:${scope}`;
 const [enabled,setEnabled]=useState(false);
 const [formats,setFormats]=useState<Record<string,ReportCellFormat>>(()=>readReportCellFormats(storageKey));
 const [selected,setSelected]=useState<Set<string>>(()=>new Set());
 const [focus,setFocus]=useState<Cell|null>(null);
 const anchor=useRef<Cell|null>(null);
 useEffect(()=>{setFormats(readReportCellFormats(storageKey));setSelected(new Set());setFocus(null);anchor.current=null;},[storageKey]);
 const rowKeys=rows.map(keyOf),columnKeys=columns.map(column=>column.key);
 const value=focus?rows.find(row=>keyOf(row)===focus.row):undefined;
 const focusValue=value&&focus?valueOf(value,focus.column):"";
 const pick=(row:string,column:string,event:MouseEvent<HTMLElement>)=>{
  if(!enabled)return false;
  event.preventDefault();event.stopPropagation();
  const target={row,column};const key=reportCellFormatKey(row,column);
  if(event.shiftKey&&anchor.current){
   const a=anchor.current,fromRow=rowKeys.indexOf(a.row),toRow=rowKeys.indexOf(row),fromCol=columnKeys.indexOf(a.column),toCol=columnKeys.indexOf(column);
   if(fromRow>=0&&toRow>=0&&fromCol>=0&&toCol>=0){const next=event.ctrlKey||event.metaKey?new Set(selected):new Set<string>();for(let r=Math.min(fromRow,toRow);r<=Math.max(fromRow,toRow);r++)for(let c=Math.min(fromCol,toCol);c<=Math.max(fromCol,toCol);c++)next.add(reportCellFormatKey(rowKeys[r],columnKeys[c]));setSelected(next);}else setSelected(new Set([key]));
  }else if(event.ctrlKey||event.metaKey){const next=new Set(selected);if(next.has(key))next.delete(key);else next.add(key);setSelected(next);anchor.current=target;}
  else{setSelected(new Set([key]));anchor.current=target;}
  setFocus(target);return true;
 };
 const selectColumn=(column:string,event:MouseEvent<HTMLElement>)=>{
  if(!enabled)return;
  event.preventDefault();const members=rowKeys.map(row=>reportCellFormatKey(row,column));const next=event.ctrlKey||event.metaKey?new Set(selected):new Set<string>();if((event.ctrlKey||event.metaKey)&&members.every(key=>next.has(key)))members.forEach(key=>next.delete(key));else members.forEach(key=>next.add(key));setSelected(next);const row=rowKeys[0];if(row){setFocus({row,column});anchor.current={row,column};}
 };
 const chosen=useMemo(()=>[...selected].map(key=>formats[key]??{}),[selected,formats]);
 const common=<K extends keyof ReportCellFormat>(field:K,defaultValue:ReportCellFormat[K])=>chosen.length&&chosen.every(item=>(item[field]??defaultValue)===(chosen[0][field]??defaultValue))?chosen[0][field]??defaultValue:undefined;
 const apply=(change:Partial<ReportCellFormat>)=>{
  if(!enabled||!canFormat||!selected.size)return;
  setFormats(current=>{const next={...current};for(const key of selected)next[key]={...next[key],...change};writeReportCellFormats(storageKey,next);return next;});
 };
 const toggle=()=>{setEnabled(value=>!value);setSelected(new Set());setFocus(null);anchor.current=null;};
 const toolbar=<div className="operational-format-controls"><ModernCellControls modern active={enabled&&selected.size>0} cellSelected={Boolean(focus)} label={focus?`${columns.find(column=>column.key===focus.column)?.title??focus.column} - selected cell`:"Selected cell"} formulaBar={<input readOnly aria-label="Selected cell value" value={focusValue} title="Edit data from the row details panel"/>} selectedFormat={chosen[0]} selectedFontFamily={common("fontFamily","Inter")??""} selectedFontSize={common("fontSize",13)??13} selectionIsBold={chosen.length>0&&chosen.every(item=>item.bold===true)} selectionIsItalic={chosen.length>0&&chosen.every(item=>item.italic===true)} selectionIsUnderlined={chosen.length>0&&chosen.every(item=>item.underline===true)} selectedTextColor={common("color","")??null} selectedBackgroundColor={common("backgroundColor","")??null} selectedCellCount={selected.size} selectionLabel={`${selected.size} cell${selected.size===1?"":"s"} selected`} canFormat={canFormat} onApply={apply}/></div>;
 return {enabled,toggle,toolbar,cell:(row:string,column:string)=>{const key=reportCellFormatKey(row,column),format=formats[key];return {onClick:(event:MouseEvent<HTMLTableCellElement>)=>{pick(row,column,event);},"data-operational-selected":enabled&&selected.has(key)?"true":undefined,"data-operational-formatted":format?"true":undefined,style:format?reportColumnAppearance(undefined,format):undefined};},header:(column:string)=>({onClick:(event:MouseEvent<HTMLTableCellElement>)=>selectColumn(column,event),"data-operational-selectable":enabled?"true":undefined})};
}
