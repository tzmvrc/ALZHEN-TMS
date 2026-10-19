import {useContext,useLayoutEffect,useRef} from "react";
import {beginCellDraft} from "../../services/cell-draft.service";
import {CellDraftContext as Context} from "./cell-draft-context";
export function useLiveCellEditor(value:string,saveState?:string){
 const target=useContext(Context),identity=JSON.stringify(target);
 const handle=useRef<ReturnType<typeof beginCellDraft>|null>(null);
 const focused=useRef(false);
 const currentValue=useRef(value);
 useLayoutEffect(()=>{currentValue.current=value;},[value]);
 useLayoutEffect(()=>{if(focused.current&&target&&!handle.current)handle.current=beginCellDraft(target,currentValue.current);return()=>{handle.current?.close();handle.current=null;};},[identity,target]);
 useLayoutEffect(()=>{handle.current?.update(value);},[value]);
 useLayoutEffect(()=>{if(saveState==="error")handle.current?.state("failed");},[saveState]);
 const focus=()=>{focused.current=true;if(target&&!handle.current){const raw=Number(import.meta.env?.VITE_CELL_DRAFT_THROTTLE_MS??50);handle.current=beginCellDraft(target,currentValue.current,Number.isFinite(raw)?raw:50);}};
 return {focus,blur:()=>{focused.current=false;},change:(next:string)=>{focus();handle.current?.update(next);},commit:(action:()=>void|Promise<boolean|void>)=>{
  const saving=handle.current;saving?.state("saving");
  try{const result=action();if(result)void result.then(ok=>{if(handle.current!==saving)return;if(ok===false)saving?.state("failed");else if(ok===true){saving?.close();handle.current=null;}}).catch(()=>{if(handle.current===saving)saving?.state("failed");});}catch{saving?.state("failed");}
 },cancel:()=>{focused.current=false;handle.current?.close();handle.current=null;}};
}
