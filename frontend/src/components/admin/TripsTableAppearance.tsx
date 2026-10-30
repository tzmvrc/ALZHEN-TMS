import {createContext,useContext} from "react";

export type TripsTableAppearance="modern"|"excel";

// A missing provider keeps standalone spreadsheets at their original row size.
export const TripsTableAppearanceContext=createContext<TripsTableAppearance>("excel");
export const useTripsTableAppearance=()=>useContext(TripsTableAppearanceContext);
