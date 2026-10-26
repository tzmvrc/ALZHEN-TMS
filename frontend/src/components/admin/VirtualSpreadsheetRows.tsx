import {memo,type ReactNode,type RefObject} from "react";
import {useVirtualSpreadsheetRows} from "./useVirtualSpreadsheetRows";

const RetainedRow=memo(function RetainedRow({index,renderRow}:{index:number;renderRow:(index:number)=>ReactNode}){return renderRow(index);});

/** Scroll state belongs to the window, not the entire spreadsheet/editor.
 * Rows shared by successive windows retain their render and subscriptions. */
export default function VirtualSpreadsheetRows({viewport,keys,enabled=true,keepAlive=-1,heights,columnCount,renderRow}:{
 viewport:RefObject<HTMLDivElement|null>;keys:string[];enabled?:boolean;keepAlive?:number;heights?:Readonly<Record<string,number>>;columnCount:number;renderRow:(index:number)=>ReactNode;
}){
 const items=useVirtualSpreadsheetRows(viewport,keys,enabled,keepAlive,heights);
 return items.map(item=>item.spacer!==undefined?<tr key={`gap:${item.index}`} data-virtual-spacer aria-hidden="true" style={{height:item.spacer}}><td colSpan={columnCount} style={{height:item.spacer,padding:0,border:0}}/></tr>:<RetainedRow key={keys[item.index]} index={item.index} renderRow={renderRow}/>);
}
