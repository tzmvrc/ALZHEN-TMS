import { useEffect, useState, type ReactNode } from "react";
import { subscribeCollaborationEvents } from "../../services/collaboration.service";
import { TripPingContext } from "./live-trip-pings";

export default function LiveTripPingsProvider({ children }: { children: ReactNode }) {
  const [recent, setRecent] = useState<Record<string, number>>({});
  useEffect(() => {
    const stop = subscribeCollaborationEvents(event => {
      if (event.kind !== "commit" || event.commit.source !== "trip_events" || !event.commit.tripId || event.commit.operation === "DELETE") return;
      setRecent(current => ({ ...current, [event.commit.tripId!]: Date.now() }));
    });
    const timer = window.setInterval(() => {
      setRecent(current => {
        const next = Object.fromEntries(Object.entries(current).filter(([, at]) => Date.now() - at < 15_000));
        return Object.keys(next).length === Object.keys(current).length ? current : next;
      });
    }, 5_000);
    return () => { stop(); window.clearInterval(timer); };
  }, []);
  return <TripPingContext.Provider value={new Set(Object.keys(recent))}>{children}</TripPingContext.Provider>;
}
