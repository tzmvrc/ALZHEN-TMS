import type {ComponentProps,ReactNode} from "react";
import {TripTableFormattingToolbar} from "./TripTableFormattingToolbar";
export type FullFormatProps=ComponentProps<typeof TripTableFormattingToolbar>&{fontFamily:string;copied:boolean;onCopy:()=>void;onPaste:()=>void;onClear:()=>void;saving?:boolean;feedback?:ReactNode;alignment?:"left"|"center"|"right"|null;onSetRowHeight?:(height:number)=>void;onSetColumnWidth?:(width:number)=>void};
/** Full Master List toolbar, used unchanged by the other Trips reports. */
export function TripTableFullFormatToolbar({fontFamily,copied,onCopy,onPaste,onClear,saving,feedback,alignment,onSetRowHeight,onSetColumnWidth,...props}:FullFormatProps){
 const disabled=!props.selectedCellCount;
 return <TripTableFormattingToolbar {...props} advanced customColors actions={<div className="ml-format-actions">
  <label>Font <select aria-label="Font family" disabled={disabled} value={fontFamily} onChange={event=>props.onApply({fontFamily:event.target.value})}>
   {fontFamily===""&&<option value="">Mixed</option>}{[...new Set(["Inter","Arial","Calibri","Verdana","Georgia","monospace",...(fontFamily?[fontFamily]:[])])].map(font=><option key={font} value={font}>{font}</option>)}
  </select></label>
  <label>Align <select aria-label="Text alignment" value={alignment??""} disabled={disabled} onChange={event=>props.onApply({alignment:event.target.value as "left"|"center"|"right"})}><option value="" disabled>Mixed</option><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
  {onSetRowHeight&&<button type="button" disabled={disabled} onClick={()=>{const raw=window.prompt("Selected row height in pixels (24–300)","56");if(raw===null)return;const value=Number(raw);if(Number.isInteger(value)&&value>=24&&value<=300)onSetRowHeight(value);}}>Row height</button>}
  {onSetColumnWidth&&<button type="button" disabled={disabled} onClick={()=>{const raw=window.prompt("Selected column width in pixels (72–600)","160");if(raw===null)return;const value=Number(raw);if(Number.isInteger(value)&&value>=72&&value<=600)onSetColumnWidth(value);}}>Column width</button>}
  <button type="button" disabled={disabled} onClick={onCopy}>Copy format</button>
  <button type="button" disabled={disabled||!copied} onClick={onPaste}>Paste format</button>
  <button type="button" disabled={disabled} onClick={onClear}>Clear format</button>
  {saving&&<span role="status">Saving appearance…</span>}{feedback}
 </div>}/>;
}
