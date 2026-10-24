import type { StoreNavigationItem } from "./storeWorkspace";
import { storeStatusLabels } from "./storeWorkspace";

export default function StopChip({ item, number, active, panelId, onSelect }: { item: StoreNavigationItem; number: number; active: boolean; panelId: string; onSelect: () => void }) {
  const empty = !item.products && !item.city && !item.province;
  const status = empty ? "Empty stop" : storeStatusLabels[item.status];
  return <button type="button" role="tab" aria-selected={active} aria-controls={panelId} tabIndex={active ? 0 : -1} className={`stop-chip ${active ? "is-active" : ""}`} title={`${number} · ${item.title} — ${status}`} onClick={onSelect}>
    <span className="stop-chip-number">{number} ·</span><span className="stop-chip-name">{empty ? "New stop" : item.title}</span><span aria-hidden="true" className={`stop-chip-dot ${empty ? "is-empty" : item.status === "ready" ? "is-ready" : "needs-attention"}`} /><span className="sr-only">{status}</span>
  </button>;
}
