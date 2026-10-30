import {useMemo,useState,type CSSProperties} from "react";
import {useToast} from "../ui/Toast";
import {useSharedTableDesign} from "./useSharedTableDesign";
import {reportColumnAppearance,reportHeaderAppearance} from "./ReportSpreadsheetUtils";
import type {CellDesign} from "../../services/shared-table-design";

type Selection={cells:Set<string>;rows:Set<string>;columns:Set<string>};
type Scope="cells"|"rows"|"columns"|null;
const rowFormatColumn=(row:string)=>{let hash=0;for(const character of row)hash=(hash*31+character.charCodeAt(0))>>>0;return `__rows_${(hash%16).toString(16)}`;};
const EMPTY_FORMAT:CellDesign={bold:false,italic:false,underline:false,color:null,backgroundColor:null,fontSize:null,fontFamily:null,alignment:null};
const present=(format?:CellDesign|null):CellDesign=>Object.fromEntries(Object.entries(format??{}).filter(([,value])=>value!==null&&value!==undefined));
const splitCell=(key:string)=>{const at=key.lastIndexOf("|");return at<0?null:{row:key.slice(0,at),column:key.slice(at+1)};};
const same=<T,>(items:T[])=>items.length>0&&items.every(item=>item===items[0]);

export function useMasterListFormatting(token:string|null,role:string|undefined,selection:Selection,widthFor:(column:string)=>number){
  const {addToast}=useToast();
  const design=useSharedTableDesign("master-list",token,["ADMIN","STAFF"].includes(role??""));
  const [copied,setCopied]=useState<CellDesign|null>(null);
  const scope:Scope=selection.cells.size?"cells":selection.rows.size?"rows":selection.columns.size?"columns":null;
  const count=scope==="cells"?selection.cells.size:scope==="rows"?selection.rows.size:scope==="columns"?selection.columns.size:0;
  const rowFormat=(row:string)=>design.columns[rowFormatColumn(row)]?.cells?.[row]??undefined;
  const cellFormat=(row:string,column:string)=>design.columns[column]?.cells?.[row]??undefined;
  const effective=(row:string,column:string):CellDesign=>({...present(design.columns[column]?.format),...present(rowFormat(row)),...present(cellFormat(row,column))});
  const appearance=(row:string,column:string):CSSProperties=>reportColumnAppearance(design.columns[column],{...present(rowFormat(row)),...present(cellFormat(row,column))});
  const identityAppearance=(row:string):CSSProperties=>reportColumnAppearance({format:rowFormat(row)??undefined});
  const headerAppearance=(column:string):CSSProperties=>{
    const header=design.columns[column]?.header;
    return header&&Object.values(header).some(value=>value!==null&&value!==undefined&&value!==false)?reportHeaderAppearance({header}):{};
  };
  const formats=useMemo(()=>{
    if(scope==="rows")return [...selection.rows].map(row=>present(design.columns[rowFormatColumn(row)]?.cells?.[row]));
    if(scope==="columns")return [...selection.columns].map(column=>present(design.columns[column]?.format));
    if(scope==="cells")return [...selection.cells].flatMap(key=>{const cell=splitCell(key);return cell?[{...present(design.columns[cell.column]?.format),...present(design.columns[rowFormatColumn(cell.row)]?.cells?.[cell.row]),...present(design.columns[cell.column]?.cells?.[cell.row])}]:[];});
    return [];
  },[scope,selection.cells,selection.rows,selection.columns,design.columns]);
  const selected=formats[0]??{};
  const color=same(formats.map(format=>format.color??""))?selected.color??"":null;
  const backgroundColor=same(formats.map(format=>format.backgroundColor??""))?selected.backgroundColor??"":null;
  const fontSize=same(formats.map(format=>format.fontSize??13))?selected.fontSize??13:13;
  const fontFamily=same(formats.map(format=>format.fontFamily??"Inter"))?selected.fontFamily??"Inter":"";
  const selectionLabel=scope==="rows"?`${count} row${count===1?"":"s"} selected`:scope==="columns"?`${count} column${count===1?"":"s"} selected`:undefined;

  const apply=(change:Partial<CellDesign>)=>{
    if(!design.canEdit||!scope||!count)return;
    const patch:CellDesign={...change,...(change.color===""?{color:null}:{}),...(change.backgroundColor===""?{backgroundColor:null}:{})};
    if(scope==="rows"){
      const grouped:Record<string,Record<string,CellDesign>>={};
      for(const row of selection.rows)(grouped[rowFormatColumn(row)]??={})[row]=patch;
      if(Object.entries(grouped).some(([column,cells])=>new Set([...Object.keys(design.columns[column]?.cells??{}),...Object.keys(cells)]).size>1000)){
        addToast({variant:"warning",title:"Too many row formats",description:"This layout supports up to 1,000 formatted rows in each of its 16 storage groups."});return;
      }
      for(const [column,cells] of Object.entries(grouped))void design.save(column,{cells},280);
      return;
    }
    if(scope==="columns"){
      for(const column of selection.columns)void design.save(column,{format:patch,header:patch},widthFor(column));
      return;
    }
    const grouped:Record<string,Record<string,CellDesign>>={};
    for(const key of selection.cells){const cell=splitCell(key);if(cell)(grouped[cell.column]??={})[cell.row]=patch;}
    if(Object.entries(grouped).some(([column,cells])=>new Set([...Object.keys(design.columns[column]?.cells??{}),...Object.keys(cells)]).size>1000)){
      addToast({variant:"warning",title:"Too many cell formats",description:"Format up to 1,000 cells per column; use row or column formatting for larger selections."});return;
    }
    for(const [column,cells] of Object.entries(grouped))void design.save(column,{cells},widthFor(column));
  };
  const clear=()=>{
    if(!design.canEdit||!scope||!count)return;
    if(scope==="rows"){
      const grouped:Record<string,Record<string,null>>={};
      for(const row of selection.rows)(grouped[rowFormatColumn(row)]??={})[row]=null;
      for(const [column,cells] of Object.entries(grouped))void design.save(column,{cells},280);
      return;
    }
    if(scope==="columns"){
      for(const column of selection.columns)void design.save(column,{format:EMPTY_FORMAT,header:EMPTY_FORMAT,color:null},widthFor(column));return;
    }
    const grouped:Record<string,Record<string,null>>={};
    for(const key of selection.cells){const cell=splitCell(key);if(cell)(grouped[cell.column]??={})[cell.row]=null;}
    for(const [column,cells] of Object.entries(grouped))void design.save(column,{cells},widthFor(column));
  };
  const copy=()=>{
    if(!scope||!count)return;
    const visible=reportColumnAppearance({format:selected});
    setCopied({bold:selected.bold??false,italic:selected.italic??false,underline:selected.underline??false,
      color:selected.color??(typeof visible.color==="string"?visible.color:"#111827"),backgroundColor:selected.backgroundColor??"#ffffff",
      fontSize:selected.fontSize??13,fontFamily:selected.fontFamily??"Inter",alignment:selected.alignment??"left"});
  };
  const paste=()=>{if(copied)apply(copied);};
  return {design,scope,count,selectionLabel,selected,color,backgroundColor,fontSize,fontFamily,copied,
    bold:formats.length>0&&formats.every(format=>format.bold===true),
    italic:formats.length>0&&formats.every(format=>format.italic===true),
    underline:formats.length>0&&formats.every(format=>format.underline===true),
    appearance,identityAppearance,headerAppearance,effective,apply,clear,copy,paste};
}

export type MasterListFormatting=ReturnType<typeof useMasterListFormatting>;
