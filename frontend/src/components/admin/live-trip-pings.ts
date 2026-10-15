import { createContext, useContext } from "react";

export const TripPingContext = createContext<ReadonlySet<string>>(new Set());
export const usePingingTrips = () => useContext(TripPingContext);
