import { cargoCapacity, type CargoLine, type CargoPlacement, type CargoTruck } from "./cargo-planning.ts";

export const allocationGroupKey = (line: CargoLine) => line.dr.trim() ? `dr:${line.dr.trim()}` : `line:${line.key}`;
export type AllocationLocks = Readonly<Record<string, readonly CargoPlacement[]>>;
export type AllocationWarning = { group?: string; code: "capacity" | "unknown" | "split" | "fragmented" | "locked" | "invalid"; message: string };
export type AllocationProposal = { assignments: CargoPlacement[]; unassigned: CargoLine[]; warnings: AllocationWarning[]; assignedCbm: string; capacityCbm: string; overflowCbm: string };
const decimal = /^\d+(?:\.\d+)?$/;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Pure best-fit decreasing over whole DRs. Locks and exact source decimals are preserved. */
export function proposeAllocation({ lines, trucks, locked = {}, excludedTruckIds = [] }: {
  lines: readonly CargoLine[]; trucks: readonly CargoTruck[]; locked?: AllocationLocks; excludedTruckIds?: readonly string[];
}): AllocationProposal {
  const warnings: AllocationWarning[] = [], assignments: CargoPlacement[] = [], unassigned: CargoLine[] = [];
  const values = [...lines.map(line => line.cbm), ...trucks.map(truck => truck.capacity), ...Object.values(locked).flatMap(items => items.map(item => item.allocated_cbm))];
  const scale = Math.max(0, ...values.filter(value => decimal.test(value.trim())).map(value => value.trim().split(".")[1]?.length ?? 0));
  const units = (value: string) => { const [whole, fraction = ""] = value.trim().split("."); return BigInt(whole + fraction.padEnd(scale, "0")); };
  const format = (value: bigint) => { const digits = value.toString().padStart(scale + 1, "0"); return scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, "") || "0" : digits; };
  const available = [...trucks].sort((a, b) => compare(a.id, b.id)).filter(truck => {
    if (excludedTruckIds.includes(truck.id)) return false;
    if (!decimal.test(truck.capacity.trim()) || units(truck.capacity) <= 0n) { warnings.push({ code: "unknown", message: `${truck.label}: Capacity unknown. This truck will not receive automatic cargo.` }); return false; }
    return true;
  });
  const remaining = new Map(available.map(truck => [truck.id, units(truck.capacity)]));
  const capacity = available.reduce((total, truck) => total + units(truck.capacity), 0n);
  const maximum = available.reduce((total, truck) => units(truck.capacity) > total ? units(truck.capacity) : total, 0n);
  const groups = new Map<string, CargoLine[]>();
  for (const line of lines) { const key = allocationGroupKey(line); groups.set(key, [...(groups.get(key) ?? []), line]); }
  const valid = (line: CargoLine) => decimal.test(line.cbm.trim()) && decimal.test(line.quantity.trim());
  const total = (items: readonly CargoLine[]) => items.filter(valid).reduce((sum, line) => sum + units(line.cbm), 0n);
  for (const [key, items] of groups) {
    if (!Object.hasOwn(locked, key)) continue;
    const placements = locked[key].filter(item => items.some(line => line.key === item.line_key)).map(item => ({ ...item }));
    assignments.push(...placements);
    for (const item of placements) {
      if (!decimal.test(item.allocated_cbm.trim())) { warnings.push({ group: key, code: "invalid", message: "A locked DR has an incomplete allocation. Check its quantities." }); continue; }
      if (!remaining.has(item.truck_id)) warnings.push({ group: key, code: "locked", message: "A locked DR uses an unavailable truck. Move or unlock it before saving." });
      else remaining.set(item.truck_id, remaining.get(item.truck_id)! - units(item.allocated_cbm));
    }
    for (const line of items) {
      const placed = placements.filter(item => item.line_key === line.key);
      if (!placed.length) { unassigned.push(line); continue; }
      const cbm = cargoCapacity(line.cbm, placed).remaining;
      const quantity = cargoCapacity(line.quantity, placed.map(item => ({ ...item, allocated_cbm: item.quantity }))).remaining;
      if (/^\d+(?:\.\d+)?$/.test(cbm) && /^\d+(?:\.\d+)?$/.test(quantity) && (/[1-9]/.test(cbm) || /[1-9]/.test(quantity))) unassigned.push({ ...line, cbm, quantity });
    }
  }
  const best = (amount: bigint) => [...remaining].filter(([, room]) => room >= amount).sort((a, b) => a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : compare(a[0], b[0]))[0]?.[0];
  const place = (items: readonly CargoLine[], truck: string) => { for (const line of items) assignments.push({ line_key: line.key, truck_id: truck, quantity: line.quantity, allocated_cbm: line.cbm }); remaining.set(truck, remaining.get(truck)! - total(items)); };
  const unlocked = [...groups].filter(([key]) => !Object.hasOwn(locked, key)).sort(([a, x], [b, y]) => total(x) > total(y) ? -1 : total(x) < total(y) ? 1 : compare(a, b));
  for (const [key, items] of unlocked) {
    if (items.some(line => !valid(line))) { unassigned.push(...items); warnings.push({ group: key, code: "invalid", message: "Complete the quantities and CBM for this DR before allocating it." }); continue; }
    const amount = total(items), truck = best(amount);
    if (truck) { place(items, truck); continue; }
    if (amount <= maximum || !available.length) {
      unassigned.push(...items);
      if (available.length && amount <= [...remaining.values()].reduce((sum, room) => sum + room, 0n)) warnings.push({ group: key, code: "fragmented", message: "Keep this DR together: move another DR or add a truck with enough free capacity." });
      continue;
    }
    // Only a DR larger than every truck may be divided, and only at product boundaries.
    const destinations = new Set<string>();
    for (const line of [...items].sort((a, b) => units(a.cbm) > units(b.cbm) ? -1 : units(a.cbm) < units(b.cbm) ? 1 : compare(a.key, b.key))) {
      const together = [...destinations].filter(id => remaining.get(id)! >= units(line.cbm)).sort((a, b) => remaining.get(a)! < remaining.get(b)! ? -1 : remaining.get(a)! > remaining.get(b)! ? 1 : compare(a, b))[0];
      const target = together ?? best(units(line.cbm));
      if (target) { place([line], target); destinations.add(target); } else unassigned.push(line);
    }
    if (destinations.size > 1) warnings.push({ group: key, code: "split", message: "DR split across trucks" });
    if (items.some(line => units(line.cbm) > maximum)) warnings.push({ group: key, code: "capacity", message: "A product line is larger than every truck. Add a larger truck or split that line manually." });
  }
  const demand = total(lines), overflow = demand > capacity ? demand - capacity : 0n;
  if (overflow > 0n) warnings.unshift({ code: "capacity", message: `Over capacity by ${format(overflow)} CBM. Add a truck to distribute the rest.` });
  for (const [key, items] of groups) {
    const ids = new Set(assignments.filter(item => items.some(line => line.key === item.line_key)).map(item => item.truck_id));
    if (ids.size > 1 && !warnings.some(warning => warning.group === key && warning.code === "split")) warnings.push({ group: key, code: "split", message: "DR split across trucks" });
  }
  const assigned = assignments.filter(item => decimal.test(item.allocated_cbm.trim())).reduce((sum, item) => sum + units(item.allocated_cbm), 0n);
  return { assignments, unassigned, warnings, assignedCbm: format(assigned), capacityCbm: format(capacity), overflowCbm: format(overflow) };
}
