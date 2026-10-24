import { allocationGroupKey, type AllocationWarning } from "../../services/propose-allocation";
import { useId, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ChevronDown, GripVertical, LockKeyhole } from "lucide-react";
import { CargoBoard, CapacityBar, StatusChip } from "./shared";
import { fieldControl, secondaryAction } from "./shared/styles";
import { cargoCapacity, cargoTotal, cargoLineContext, cargoCbmForQuantity, splitCargoPlacement, type CargoLine, type CargoPlacement, type CargoPlan, type CargoTruck } from "../../services/cargo-planning";

const MIME = "application/x-alzhen-cargo";
const UNASSIGNED = "unassigned";
const pairKey = (placement: CargoPlacement) => JSON.stringify([placement.line_key, placement.truck_id]);
const groupKey = allocationGroupKey;
const sum = (values: string[]) => { try { return cargoTotal(values); } catch { return "Check values"; } };
const nonnegative = (value: string) => /^\d+(?:\.\d+)?$/.test(value);
const zero = (value: string) => /^0+(?:\.0+)?$/.test(value);
type Entry = { key: string; line?: CargoLine; placement: CargoPlacement; copies: CargoPlacement[]; unassigned: boolean; movable: boolean };
type DragPayload = { board: string; kind: "line" | "group"; key: string; from: string };

/** Every successful edit returns through the planner's update(), never directly through onChange. */
export default function CargoAllocationBoard({ lines, trucks, placements, disabled, update, onError, lockedGroups = [], onUnlock, warnings = [], truckTypes, onTruckSettings, onRemoveTruck }: {
  lines: CargoLine[]; trucks: CargoTruck[]; placements: CargoPlacement[]; disabled: boolean;
  update: (patch: Partial<CargoPlan>) => void; onError: (message: string) => void;
  lockedGroups?: string[]; onUnlock?: (group: string) => void; warnings?: AllocationWarning[];
  truckTypes?: Record<string, string>; onTruckSettings?: (id: string) => void; onRemoveTruck?: (id: string) => void;
}) {
  const board = useId(), [expanded, setExpanded] = useState<Record<string, boolean>>({}), [errors, setErrors] = useState<Record<string, string>>({});
  const pendingFocus = useRef<string | null>(null), [notice, setNotice] = useState("");
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const [selectedBucket, setSelectedBucket] = useState(UNASSIGNED);
  const selectedId = selectedBucket === UNASSIGNED || trucks.some(truck => truck.id === selectedBucket) ? selectedBucket : UNASSIGNED;
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const column = document.getElementById(`${board}-column-${pendingFocus.current}`);
    column?.scrollIntoView({ block: "nearest", inline: "nearest" });
    column?.focus({ preventScroll: true });
    pendingFocus.current = null;
  }, [placements, board]);
  const linesById = new Map(lines.map(line => [line.key, line]));
  const groupedPairs = new Map<string, CargoPlacement[]>();
  for (const placement of placements) { const key = pairKey(placement); groupedPairs.set(key, [...(groupedPairs.get(key) ?? []), placement]); }
  const allocated: Entry[] = [...groupedPairs].map(([key, copies]) => ({ key, line: linesById.get(copies[0].line_key), placement: copies[0], copies, unassigned: false, movable: copies.length === 1 }));
  const remaining: Entry[] = lines.flatMap(line => {
    const assigned = placements.filter(placement => placement.line_key === line.key);
    // cargoCapacity subtracts exact decimals. Treat quantity as the meter's units,
    // avoiding a second decimal parser or any floating point allocation arithmetic.
    const quantity = cargoCapacity(line.quantity, assigned.map(placement => ({ ...placement, allocated_cbm: placement.quantity }))).remaining;
    const cbm = cargoCapacity(line.cbm, assigned).remaining;
    if (zero(quantity) && zero(cbm)) return [];
    return [{ key: JSON.stringify([line.key, UNASSIGNED]), line, placement: { line_key: line.key, truck_id: UNASSIGNED, quantity, allocated_cbm: cbm }, copies: [], unassigned: true,
      movable: nonnegative(quantity) && nonnegative(cbm) && (!zero(quantity) || zero(line.quantity)) }];
  });
  const orphans = allocated.filter(entry => !entry.line || !trucks.some(truck => truck.id === entry.placement.truck_id));
  const report = (key: string, message: string) => { setErrors(current => ({ ...current, [key]: message })); onError(message); };
  const commit = (next: CargoPlacement[]) => { update({ placements: next }); setErrors({}); onError(""); };
  const entriesFor = (id: string) => id === UNASSIGNED ? [...remaining, ...orphans] : allocated.filter(entry => entry.line && entry.placement.truck_id === id);
  function move(entries: Entry[], destination: string, errorKey: string) {
    if (disabled || !entries.length) return;
    if (destination !== UNASSIGNED && !trucks.some(truck => truck.id === destination)) { report(errorKey, "Choose a physical truck in this trip."); return; }
    if (entries.some(entry => !entry.line || !entry.movable)) { report(errorKey, "Check this source line and merge duplicate product allocations before moving it."); return; }
    if (destination !== UNASSIGNED && entries.some(entry => placements.some(other => other.line_key === entry.placement.line_key && other.truck_id === destination && !entries.some(moving => !moving.unassigned && pairKey(moving.placement) === pairKey(other))))) {
      report(errorKey, "Merge duplicate product allocations. The destination truck already holds part of this source line; move it elsewhere or use Move entire DR group."); return;
    }
    const removed = new Set(entries.filter(entry => !entry.unassigned).map(entry => entry.key));
    const next = placements.filter(placement => !removed.has(pairKey(placement)));
    pendingFocus.current = destination;
    setSelectedBucket(destination);
    setNotice(`Moved ${entries.length} product allocations to ${trucks.find(truck => truck.id === destination)?.label || "Unassigned"}.`);
    commit(destination === UNASSIGNED ? next : [...next, ...entries.map(entry => ({ ...entry.placement, truck_id: destination }))]);
  }
  function moveEntireDr(group: string, destination: string) {
    if (disabled || !trucks.some(truck => truck.id === destination)) return;
    const grouped = lines.filter(line => groupKey(line) === group), keys = new Set(grouped.map(line => line.key));
    pendingFocus.current = destination;
    setSelectedBucket(destination);
    setNotice(`Moved the entire DR group to ${trucks.find(truck => truck.id === destination)?.label}. Original source totals are preserved.`);
    commit([...placements.filter(placement => !keys.has(placement.line_key)), ...grouped.map(line => ({ line_key: line.key, truck_id: destination, quantity: line.quantity, allocated_cbm: line.cbm }))]);
  }
  function startDrag(event: DragEvent<HTMLElement>, payload: Omit<DragPayload, "board">) {
    if (event.target instanceof HTMLElement && event.target.closest("input, select, textarea")) { event.preventDefault(); event.stopPropagation(); return; }
    if (disabled) { event.preventDefault(); return; }
    event.stopPropagation(); event.dataTransfer.setData(MIME, JSON.stringify({ ...payload, board })); event.dataTransfer.effectAllowed = "move";
  }
  function drop(event: DragEvent<HTMLElement>, destination: string) {
    if (disabled || !event.dataTransfer.types.includes(MIME)) return;
    event.preventDefault();
    try {
      const payload = JSON.parse(event.dataTransfer.getData(MIME)) as DragPayload;
      if (!["line", "group"].includes(payload.kind) || typeof payload.key !== "string" || typeof payload.from !== "string") throw Error("Invalid cargo drag");
      if (payload.board !== board) { onError("Move cargo within its own trip group."); return; }
      if (payload.from === destination) return;
      const source = entriesFor(payload.from);
      const entries = source.filter(entry => payload.kind === "line" ? entry.key === payload.key : entry.line && groupKey(entry.line) === payload.key);
      move(entries, destination, payload.key);
    } catch { onError("Unable to move this cargo card. Use its Move to menu instead."); }
  }
  const destinations = (from: string) => [{ id: UNASSIGNED, label: "Unassigned" }, ...trucks.map(truck => ({ id: truck.id, label: truck.label }))].filter(item => item.id !== from);
  function product(entry: Entry) {
    const { line, placement, key } = entry;
    const splitTarget = trucks.find(truck => truck.id !== placement.truck_id && !placements.some(other => other.line_key === placement.line_key && other.truck_id === truck.id));
    return <article key={key} draggable={!disabled && entry.movable} onDragStart={event => startDrag(event, { kind: "line", key, from: entry.unassigned ? UNASSIGNED : placement.truck_id })} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
      <div><strong className="block break-words text-xs text-slate-800">{line?.label || "Removed source product"}</strong><p className="mt-1 break-words text-[11px] text-slate-500">{line?.stop} {line?.sourceRow ? ` / CSV row ${line.sourceRow}` : ""}</p></div>
      {entry.copies.length > 1 && <div className="space-y-2"><StatusChip label="Merge duplicate product allocations" tone="danger" /><p className="text-xs">{entry.copies.length} allocations / Qty {sum(entry.copies.map(item => item.quantity))} / CBM {sum(entry.copies.map(item => item.allocated_cbm))}</p><button type="button" className={secondaryAction} disabled={disabled} onClick={() => {
        try { const quantity = cargoTotal(entry.copies.map(item => item.quantity)), allocated_cbm = cargoTotal(entry.copies.map(item => item.allocated_cbm)); commit([...placements.filter(item => pairKey(item) !== key), { ...placement, quantity, allocated_cbm }]); }
        catch (cause) { report(key, cause instanceof Error ? cause.message : "Check the duplicate allocations."); }
      }}>Merge duplicate product allocations</button></div>}
      {entry.unassigned ? <p className="text-xs tabular-nums">Unassigned Qty {placement.quantity} / CBM {placement.allocated_cbm}</p> : <div className="grid grid-cols-2 gap-2">{(["quantity", "allocated_cbm"] as const).map(field => <label key={field} className="text-[11px] text-slate-500">{field === "quantity" ? "Quantity" : "Total CBM"}<input aria-label={`${field} allocation ${line?.label || placement.line_key}, source ${line?.sourceRow ?? placement.line_key}, on ${trucks.find(truck => truck.id === placement.truck_id)?.label || "removed truck"}`} inputMode="decimal" disabled={disabled || !line || entry.copies.length > 1} value={placement[field]} className={`${fieldControl} mt-1 tabular-nums`} onChange={event => {
        try {
          const value = event.target.value;
          const patch = field === "quantity" && line ? { quantity: value, allocated_cbm: value.trim() && !/^\d*\.$/.test(value) ? cargoCbmForQuantity(line, value) : "" } : { [field]: value };
          commit(placements.map(item => pairKey(item) === key ? { ...item, ...patch } : item));
        } catch (cause) { report(key, `${line ? cargoLineContext(line, placements) : "Allocation"}. ${cause instanceof Error ? cause.message : "Enter an exact split quantity."}`); }
      }} /></label>)}</div>}
      {line && <p className="break-words text-[10px] leading-4 text-slate-500">{cargoLineContext(line, placements)}</p>}
      {entry.unassigned && !entry.movable && <p className="text-xs text-amber-800">Fix existing allocations before moving this remainder. Its quantity/CBM is invalid or overallocated.</p>}
      <label className="block text-[11px] text-slate-600">Move to...<select className={`${fieldControl} mt-1`} aria-label={`Move ${line?.label || placement.line_key}, source ${line?.sourceRow ?? placement.line_key}, from ${entry.unassigned ? "Unassigned" : placement.truck_id} to`} value="" disabled={disabled || !entry.movable} onChange={event => move([entry], event.target.value, key)}><option value="">Choose destination</option>{destinations(entry.unassigned ? UNASSIGNED : placement.truck_id).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      {!entry.unassigned && <div className="flex flex-wrap gap-2"><button type="button" className={secondaryAction} disabled={disabled || !splitTarget || !line || entry.copies.length > 1} onClick={() => {
        if (!line) return;
        if (!splitTarget) { report(key, "Add another physical truck before splitting this source line."); return; }
        try { const split = splitCargoPlacement(line, placement, splitTarget.id); commit(placements.flatMap(item => pairKey(item) === key ? split : [item])); }
        catch (cause) { report(key, `${cargoLineContext(line, placements)}. ${cause instanceof Error ? cause.message : "Unable to split this line."}`); }
      }}>Split</button><button type="button" className={secondaryAction} disabled={disabled} onClick={() => commit(placements.filter(item => pairKey(item) !== key))}>{entry.copies.length > 1 ? "Remove duplicate allocations" : "Remove"}</button></div>}
      {errors[key] && <p role="alert" className="break-words text-xs text-rose-700">{errors[key]}</p>}
    </article>;
  }
  const editors: ReactNode[] = [];
  const columns = [{ id: UNASSIGNED, label: "Unassigned" }, ...trucks.map(truck => ({ id: truck.id, label: truck.label }))].map(column => {
    const entries = entriesFor(column.id), groups = new Map<string, Entry[]>();
    for (const entry of entries) { const key = entry.line ? groupKey(entry.line) : entry.key; groups.set(key, [...(groups.get(key) ?? []), entry]); }
    const truck = trucks.find(item => item.id === column.id);
    const usage = truck ? cargoCapacity(truck.capacity, placements.filter(item => item.truck_id === truck.id)) : undefined;
    const groupEntries = [...groups], visibleCount = visibleCounts[column.id] ?? 10;
    for (const [key, grouped] of groupEntries) {
      const identity = JSON.stringify([column.id, key]), line = grouped[0].line;
      if (!expanded[identity] || column.id !== selectedId) continue;
      editors.push(<section key={identity} id={`${board}-editor-${column.id}-${key}`} className="trip-dr-editor border-t border-slate-200 py-4" aria-label={`DR details ${line?.dr || line?.label || key}`}>
        <div className="mb-3 flex items-center justify-between gap-3"><h4>{column.label} · {line?.dr ? `DR ${line.dr}` : line?.label || "Source needs review"}</h4><button type="button" className={secondaryAction} onClick={() => setExpanded(current => ({ ...current, [identity]: false }))}>Close DR details</button></div>
        {line && <details className="mb-3 text-xs"><summary className="text-[#2678b9]">Move entire DR group</summary><p className="my-2 text-slate-500">Moves every original line, including splits and unassigned remainder, at its original quantity/CBM.</p><select aria-label={`Truck for entire DR group ${line.dr || line.key}`} className={fieldControl} value="" disabled={disabled} onChange={event => moveEntireDr(key, event.target.value)}><option value="">Choose physical truck</option>{trucks.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></details>}
        <div className="grid min-w-0 gap-3">{grouped.map(product)}</div>{errors[key] && <p role="alert" className="mt-2 text-xs text-rose-700">{errors[key]}</p>}
      </section>);
    }
    return { id: column.id, domId: `${board}-column-${column.id}`, title: column.label, count: entries.length, drCount: groups.size,
      description: truck ? `${truckTypes?.[truck.id] || "Truck"} · ${truck.driverLabel || "Assign driver later"}` : "Remaining source cargo",
      actions: truck && (onTruckSettings || onRemoveTruck) ? <>{onTruckSettings && <button type="button" disabled={disabled} aria-label={`Driver and company for ${truck.label}`} onClick={() => onTruckSettings(truck.id)}>Driver / company</button>}{onRemoveTruck && <button type="button" disabled={disabled} aria-label={`Remove ${truck.label}`} onClick={() => onRemoveTruck(truck.id)}>Remove</button>}</> : undefined,
      onDragOver: (event: DragEvent<HTMLElement>) => { if (!disabled && event.dataTransfer.types.includes(MIME)) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } },
      onDrop: (event: DragEvent<HTMLElement>) => drop(event, column.id),
      summary: usage ? <CapacityBar compact label={`${column.label} capacity`} assigned={usage.assigned} capacity={truck?.capacity || ""} usage={usage} /> : <p>{sum(remaining.map(entry => entry.placement.allocated_cbm))} CBM remaining{entries.length > 0 && trucks.length > 0 && <span className="mt-1 block text-amber-800">Allocate all cargo before confirming</span>}</p>,
      children: <>{groupEntries.slice(0, visibleCount).map(([key, grouped]) => {
        const identity = JSON.stringify([column.id, key]), line = grouped[0].line, open = expanded[identity] ?? false;
        return <article key={key} draggable={!disabled && grouped.every(entry => entry.movable)} onDragStart={event => startDrag(event, { kind: "group", key, from: column.id })} className="trip-dr-card">
          <div className="cargo-dr-row"><button type="button" className="trip-dr-title" aria-expanded={open} onClick={() => setExpanded(current => ({ ...current, [identity]: !open }))}><GripVertical aria-hidden="true" size={14} /><span title={line?.dr || line?.label}>{line?.dr ? `DR ${line.dr}` : line?.label || "Source needs review"}</span><small>{grouped.length} lines · Qty {sum(grouped.flatMap(entry => entry.copies.length ? entry.copies.map(item => item.quantity) : [entry.placement.quantity]))} · {sum(grouped.flatMap(entry => entry.copies.length ? entry.copies.map(item => item.allocated_cbm) : [entry.placement.allocated_cbm]))} CBM</small><ChevronDown aria-hidden="true" size={14} /></button>
          <label><span className="sr-only">Move to</span><select className={fieldControl} aria-label={`Move DR allocations ${line?.dr || line?.key || key} from ${column.label}`} value="" disabled={disabled} onChange={event => move(grouped, event.target.value, key)}><option value="">Move to…</option>{destinations(column.id).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div>
          {lockedGroups.includes(key) && <button type="button" className="cargo-unlock" disabled={disabled} onClick={() => onUnlock?.(key)}><LockKeyhole aria-hidden="true" size={12} />Unlock</button>}
          {new Set(placements.filter(item => lines.some(source => groupKey(source) === key && source.key === item.line_key)).map(item => item.truck_id)).size > 1 && <p className="text-[11px] text-amber-800">DR split across trucks</p>}
          {warnings.filter(warning => warning.group === key && warning.code !== "split").slice(0,1).map(warning => <p key={warning.code} className="text-[11px] text-amber-800">{warning.message}</p>)}
          {open && <button type="button" className="cargo-dr-edit text-xs text-[#2678b9]" onClick={() => document.getElementById(`${board}-editor-${column.id}-${key}`)?.scrollIntoView({ block: "nearest" })}>Edit lines / Move entire DR</button>}
          {errors[key] && <p role="alert" className="text-xs text-rose-700">{errors[key]}</p>}
        </article>;
      })}{!entries.length && <p className="py-3 text-xs text-slate-500">{column.id === UNASSIGNED ? "All source cargo is allocated." : "Drop cargo here or use Move to."}</p>}
      {groupEntries.length > visibleCount && <button type="button" className="cargo-show-more" onClick={() => setVisibleCounts(current => ({ ...current, [column.id]: visibleCount + 4 }))}>Show more ({groupEntries.length - visibleCount})</button>}</>,
    };
  });
  return <><p role="status" aria-live="polite" className="sr-only">{notice}</p><CargoBoard columns={columns} selectedId={selectedId} onSelect={setSelectedBucket} />{editors}</>;
}
