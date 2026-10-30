import {createContext,useContext,useEffect} from "react";
export const WorkspaceTripLabelContext=createContext<((id:string,number:string)=>void)|null>(null);
export function useWorkspaceTripLabel(id:string,number:unknown){
 const publish=useContext(WorkspaceTripLabelContext);
 useEffect(()=>{if(typeof number==="string"&&number.trim())publish?.(id,number.trim());},[id,number,publish]);
}
