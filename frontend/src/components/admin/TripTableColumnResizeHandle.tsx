import type {PointerEvent} from "react";
/** Shared draggable header edge; layout changes do not require data Edit Mode. */
export default function TripTableColumnResizeHandle({title,width,enabled,onStart,onResize}:{title:string;width:number;enabled:boolean;onStart:(event:PointerEvent<HTMLSpanElement>)=>void;onResize:(width:number)=>void}){
 if(!enabled)return null;
 return <span role="separator" aria-label={"Resize "+title+" column"} aria-orientation="vertical" aria-valuemin={72} aria-valuemax={600} aria-valuenow={Math.round(width)} tabIndex={0} title="Drag the column edge to resize" className="trip-column-resize-handle" onPointerDown={event=>{event.preventDefault();event.stopPropagation();if(event.button===0)onStart(event);}} onClick={event=>{event.preventDefault();event.stopPropagation();}} onDoubleClick={event=>{event.preventDefault();event.stopPropagation();}} onKeyDown={event=>{if(event.key!=="ArrowLeft"&&event.key!=="ArrowRight")return;event.preventDefault();event.stopPropagation();onResize(Math.max(72,Math.min(600,Math.round(width+(event.key==="ArrowRight"?1:-1)*(event.shiftKey?24:8)))));}}/>;
}
