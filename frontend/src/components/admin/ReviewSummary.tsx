import { useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { GroupTab } from "./GroupRail";
import type { ReviewCheck } from "./shared/ReviewChecklist";
import { tripPrimaryAction } from "./shared/TripModalUI";

export type ReviewAttention = { key: string; label: string; group: string; tab: GroupTab; store?: string };
type TripRow = { key: string; stores: number; lines: number; cbm: string; trucks: number; status: string; detail: ReactNode };
function AttentionList({ label, items, onFix, action }: { label: string; items: ReviewAttention[]; onFix: (item: ReviewAttention) => void; action?: ReactNode }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  return <details className="review-attention-group"><summary><span>{label} ({items.length})</span></summary>{action}<ul>{items.slice(0, all ? undefined : 5).map(item => <li key={item.key}><span>{item.label}</span><button type="button" aria-label={`Fix ${item.label}`} onClick={() => onFix(item)}>Fix</button></li>)}</ul>{items.length > 5 && <button type="button" onClick={() => setAll(value => !value)}>{all ? "Show fewer" : `Show all (${items.length})`}</button>}</details>;
}

export default function ReviewSummary({ trips, totals, unverified, historical, cargo, blockers, reviewed, confirmationNotes, onReviewed, onApproveHistory, onFix, onFixBlocker, onSave, disabled, busy, finished, advanced }: {
  trips: TripRow[]; totals: { stops: number; lines: number; cbm: string; trucks: number }; unverified: ReviewAttention[]; historical: ReviewAttention[]; cargo: ReviewAttention[]; blockers: ReviewCheck[];
  reviewed: boolean; confirmationNotes: string[]; onReviewed: (value: boolean) => void; onApproveHistory: () => void; onFix: (item: ReviewAttention) => void; onFixBlocker: (id: string) => void;
  onSave: () => void; disabled: boolean; busy: boolean; finished: boolean; advanced: ReactNode;
}) {
  const pending = blockers.filter(item => !item.checked), attentionCount = unverified.length + historical.length + cargo.length + pending.filter(item => !["history", "cargo"].includes(item.id)).length;
  const reason = busy ? "Saving your trip…" : historical.length ? "Approve the missing products below." : pending.length ? `Resolve ${pending.length} save checks below.` : !reviewed ? "Confirm that you reviewed the summary." : "";
  return <section aria-label="Review trip" className="review-summary">
    <div id="review-summary" className={`review-headline ${disabled && !finished || attentionCount ? "needs-attention" : "is-ready"}`}>
      {disabled && !finished || attentionCount ? <AlertCircle aria-hidden="true" size={20} /> : <CheckCircle2 aria-hidden="true" size={20} />}<div><h3>{finished ? "Trip saved" : attentionCount ? `${attentionCount} items need attention` : disabled ? "One final check" : "Ready to save"}</h3>{reason && <p>{reason}</p>}</div>
      <div className="review-save-controls">{!finished && <label title={confirmationNotes.join("\n")}><input type="checkbox" checked={reviewed} disabled={busy || pending.some(item => !item.checked && item.id === "groups")} onChange={event => onReviewed(event.target.checked)} />I reviewed the above</label>}<button type="button" className={tripPrimaryAction} disabled={disabled} onClick={onSave}>{finished ? "Trip saved" : busy ? "Saving…" : "Save trip"}</button></div>
    </div>
    <dl className="trip-review-stats">{[["Trips", trips.length], ["Stops", totals.stops], ["Lines", totals.lines], ["CBM", totals.cbm], ["Trucks", totals.trucks]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <section id="import-save-readiness" aria-label="Needs attention" className="review-attention"><h3>Needs attention</h3>
      {!attentionCount && !pending.length && <p className="text-xs text-emerald-700">No outstanding items.</p>}
      <AttentionList label="Unverified locations" items={unverified} onFix={onFix} />
      <AttentionList label="Missing historical products" items={historical} onFix={onFix} action={<button type="button" className="review-approve" disabled={busy} onClick={onApproveHistory}>Review and approve all ({historical.length})</button>} />
      <AttentionList label="Cargo not assigned" items={cargo} onFix={onFix} />
      <ul className="review-save-checks">{pending.filter(item => !["history", "cargo"].includes(item.id)).map(item => <li key={item.id}><span>{item.label}</span><button type="button" onClick={() => onFixBlocker(item.id)}>Fix</button></li>)}</ul>
      {unverified.length > 0 && <p className="text-[11px] text-slate-500">Unverified locations can be saved without coordinates.</p>}
    </section>
    <section aria-label="Trips to be created"><h3>Trips to be created</h3><div className="trip-horizontal-table"><table className="review-trips-table"><thead><tr>{["Trip group", "Stores", "Lines", "CBM", "Trucks", "Status"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{trips.map(trip => <tr key={trip.key}><td><details><summary title={trip.key}>{trip.key}</summary><div>{trip.detail}<button type="button" onClick={() => onFix({ key: trip.key, group: trip.key, tab: "details", label: trip.key })}>Edit trip</button></div></details></td><td>{trip.stores}</td><td>{trip.lines}</td><td>{trip.cbm}</td><td>{trip.trucks}</td><td>{trip.status.replaceAll("_", " ")}</td></tr>)}</tbody></table></div></section>
    {confirmationNotes.length > 0 && <p id="import-save-confirmations" className="review-confirmation-notes">The final confirmation covers: {confirmationNotes.join("; ")}</p>}
    <details className="review-advanced"><summary>Advanced details</summary>{advanced}</details>
  </section>;
}
