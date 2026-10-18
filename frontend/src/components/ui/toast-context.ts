import {createContext,useContext} from "react";
import type {ToastItem} from "./Toast";

type ToastContextValue={addToast:(toast:Omit<ToastItem,"id">)=>void;dismissToast:(id:number)=>void};
export const ToastContext=createContext<ToastContextValue|undefined>(undefined);
/** Optional notification access for dialogs also used in isolated fixtures. */
export function useOptionalToast(){return useContext(ToastContext);}
