import {useEffect,useRef,useState} from "react";
export function useSpreadsheetSelectAll(scope:string,onError:(message:string)=>void){
 const version=useRef(0),lock=useRef(false);const [busy,setBusy]=useState(false);
 useEffect(()=>{version.current++;lock.current=false;setBusy(false);return()=>{version.current++;};},[scope]);
 return {busy,run:async<T,>(load:(current:()=>boolean)=>Promise<T>,apply:(value:T)=>void)=>{
  if(lock.current)return;lock.current=true;setBusy(true);const generation=++version.current,current=()=>version.current===generation;
  try{const value=await load(current);if(current())apply(value);}catch(error){if(current())onError(error instanceof Error?error.message:"Unable to select matching rows.");}
  finally{if(current()){lock.current=false;setBusy(false);}}
 }};
}
