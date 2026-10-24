import type { ReactNode } from "react";
import { focusRing, secondaryAction } from "./styles";
import { formatStoreNumber, storeStatusLabels, type StoreNavigationItem, type StoreWorkspaceMemory } from "./storeWorkspace";
export type StoreRailItem = { id: string; title: string; description?: string; trailing?: ReactNode } & Partial<StoreNavigationItem>;
export default function StoreRail({ items, selectedId, onSelect, disabled = false }: { items: readonly StoreRailItem[]; selectedId: string; onSelect: (id: string) => void; disabled?: boolean; memory?: StoreWorkspaceMemory }) {
  const size = 8, page = Math.floor(Math.max(0, items.findIndex(item => item.id === selectedId)) / size);
  return <><nav aria-label="Delivery stores">{items.slice(page * size, (page + 1) * size).map(item => <button key={item.id} type="button" disabled={disabled} aria-current={item.id === selectedId ? "true" : undefined} onClick={() => onSelect(item.id)} className={`trip-store-item ${focusRing}`}>
    <span className="min-w-0 flex-1"><strong title={item.title}>{item.title}</strong><small>{item.description ?? [item.city || "Missing city", item.province || "Missing province"].join(", ")}</small>{item.products != null && <small className="mt-1 tabular-nums">{item.products} products · {formatStoreNumber(item.qty ?? 0)} qty</small>}{item.trailing}</span>
    {item.status && <span className={`trip-status-dot mt-2 ${item.status === "ready" ? "is-ready" : "is-pending"}`} title={storeStatusLabels[item.status]}><span className="sr-only">{storeStatusLabels[item.status]}</span></span>}
  </button>)}</nav>{items.length > size && <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500"><button type="button" className={secondaryAction} disabled={!page} onClick={() => onSelect(items[(page - 1) * size].id)}>Previous stores</button><span>{page + 1}/{Math.ceil(items.length / size)}</span><button type="button" className={secondaryAction} disabled={(page + 1) * size >= items.length} onClick={() => onSelect(items[(page + 1) * size].id)}>Next stores</button></div>}</>;
}
