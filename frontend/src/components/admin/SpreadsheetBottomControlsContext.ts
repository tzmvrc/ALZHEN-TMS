import {createContext,type ReactNode} from "react";

export const SpreadsheetBottomControlsContext=createContext<{
  activeSheet:string;
  registerHiddenColumns:(sheet:string,control:ReactNode)=>()=>void;
  registerPaging:(sheet:string,status:ReactNode,pagination:ReactNode,autoFit:boolean|null)=>()=>void;
}|null>(null);
