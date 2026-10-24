import { useEffect, useState } from "react";
import { ArrowDownUp, ArrowUpRight, ChevronLeft, ChevronRight, LocateFixed, Search, Truck } from "lucide-react";
import { EmptyState, SectionHeading, StatusPill, TruckPlaceholder } from "./HomePrimitives";
import { shortDay, type HomeStatus, type HomeTrip } from "./home-dashboard-data";

export type HomeTripFilter = "All" | HomeStatus;
export default function HomeTripTable({ trips, filter, onFilter, focusedTrip, onFocus, onOpenTrip, photos, detailsLoading, total, onViewAll }: {
  trips: HomeTrip[]; filter: HomeTripFilter; onFilter: (filter: HomeTripFilter) => void;
  focusedTrip: string | null; onFocus: (id: string) => void; onOpenTrip?: (id: string) => void;
  photos: Record<string, string>; detailsLoading: boolean; total: number; onViewAll: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("priority");
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [query, sort, filter]);
  const needle = query.trim().toLocaleLowerCase();
  const filtered = trips.filter(trip => (filter === "All" || trip.status === filter) && (!needle || [trip.reference, trip.origin, trip.destination, trip.driver, trip.plates.join(" "), trip.rawStatus].join(" ").toLocaleLowerCase().includes(needle))).sort((a, b) => {
    if (sort === "reference") return a.reference.localeCompare(b.reference, undefined, { numeric: true });
    if (sort === "due") return (a.dueDay ?? "9999").localeCompare(b.dueDay ?? "9999");
    return Number(Boolean(b.issue)) - Number(Boolean(a.issue)) || Number(b.status === "In progress") - Number(a.status === "In progress") || (a.dueDay ?? "9999").localeCompare(b.dueDay ?? "9999");
  });
  const lastPage = Math.max(0, Math.ceil(filtered.length / 8) - 1);
  const current = Math.min(page, lastPage), rows = filtered.slice(current * 8, current * 8 + 8);
  return <section className="home-panel home-dispatch-panel" aria-labelledby="home-dispatch-title" id="home-dispatch-board">
    <SectionHeading eyebrow="02 / Dispatch workspace" title="Every movement, accounted for" description="Search, focus a trip on the map, or open its operational record."><button type="button" className="home-text-button" onClick={onViewAll}>Open Master List <ArrowUpRight size={15} aria-hidden="true"/></button></SectionHeading>
    <h3 id="home-dispatch-title" className="sr-only">Recent dispatch board</h3>
    <div className="home-table-tools"><div className="home-filter-list" role="group" aria-label="Filter monitored trips">{(["All", "In progress", "Delayed", "Planned", "Completed"] as HomeTripFilter[]).map(status => <button type="button" key={status} aria-pressed={filter === status} onClick={() => onFilter(status)}>{status}<span>{status === "All" ? trips.length : trips.filter(trip => trip.status === status).length}</span></button>)}</div><div className="home-table-inputs"><label className="home-search"><Search size={15} aria-hidden="true"/><span className="sr-only">Search recent trips</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search dispatch, route, plate..." type="search"/></label><label className="home-sort"><ArrowDownUp size={15} aria-hidden="true"/><span className="sr-only">Sort recent trips</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="priority">Priority first</option><option value="due">Delivery date</option><option value="reference">Dispatch No.</option></select></label></div></div>
    {rows.length ? <div className="home-table-scroll"><table className="home-dispatch-table"><caption className="sr-only">Recent operational trips. Click a dispatch reference to open its record.</caption><thead><tr><th scope="col">Dispatch / route</th><th scope="col" className="home-column-truck">Truck &amp; driver</th><th scope="col">Status</th><th scope="col" className="home-column-progress">Delivery progress</th><th scope="col" className="home-column-due">Due</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map(trip => <tr key={trip.id} aria-selected={focusedTrip === trip.id}>
      <td><div className="home-trip-identity">{photos[trip.id] ? <img className="home-trip-thumbnail" src={photos[trip.id]} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = "none"; }}/> : <TruckPlaceholder/>}<div><button type="button" className="home-trip-reference" disabled={!onOpenTrip} onClick={() => onOpenTrip?.(trip.id)}>{trip.reference}{trip.demonstration && <span className="home-demo-label">Demo</span>}<ArrowUpRight size={12} aria-hidden="true"/></button><span className="home-route-label" title={`${trip.origin} ? ${trip.destination}`}>{trip.origin} <span aria-hidden="true">→</span> {trip.destination}</span>{trip.progress !== null && <div className="home-inline-progress"><span>{trip.delivered}/{trip.stops} recorded stops</span><div><i style={{ transform: `scaleX(${trip.progress / 100})` }}/></div></div>}</div></div></td>
      <td className="home-column-truck"><span className="home-plate">{trip.plates.join(", ") || (detailsLoading ? "Loading truck details..." : "Not recorded")}</span><span className="home-cell-secondary">{trip.driver}</span></td>
      <td><StatusPill status={trip.status} label={trip.status === "Other" ? trip.rawStatus : undefined}/>{trip.issue && <span className="home-cell-warning">{trip.issue}</span>}</td>
      <td className="home-column-progress">{trip.progress === null ? <span className="home-cell-secondary">{detailsLoading ? "Loading stops..." : "Stops not recorded"}</span> : <div className="home-stop-progress"><span>{trip.delivered} / {trip.stops} recorded stops</span><div role="progressbar" aria-label={`Recorded stop completion for ${trip.reference}`} aria-valuenow={trip.progress} aria-valuemin={0} aria-valuemax={100}><i style={{ transform: `scaleX(${trip.progress / 100})` }}/></div></div>}</td>
      <td className="home-column-due"><time dateTime={trip.dueDay ?? undefined}>{shortDay(trip.dueDay)}</time></td>
      <td><button type="button" className="home-icon-button" aria-label={`Focus ${trip.reference} on map`} aria-pressed={focusedTrip === trip.id} disabled={["Completed", "Other"].includes(trip.status)} onClick={() => onFocus(trip.id)}><LocateFixed size={17} aria-hidden="true"/></button></td>
    </tr>)}</tbody></table></div> : <EmptyState title="No matching trips in this monitoring window" icon={Truck}>Try another filter or search, or open Master List for all records.</EmptyState>}
    <footer className="home-table-footer"><p>{filtered.length ? `${current * 8 + 1}–${Math.min((current + 1) * 8, filtered.length)} of ${filtered.length}` : "0 matching"} loaded trips <span>· {trips.length} loaded / {total.toLocaleString()} non-archived</span></p><div><button type="button" className="home-icon-button" aria-label="Previous monitored trips" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft size={16} aria-hidden="true"/></button><span>{current + 1} / {lastPage + 1}</span><button type="button" className="home-icon-button" aria-label="Next monitored trips" disabled={current === lastPage} onClick={() => setPage(current + 1)}><ChevronRight size={16} aria-hidden="true"/></button></div></footer>
  </section>;
}
