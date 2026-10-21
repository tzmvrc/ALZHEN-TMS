export type CargoLine = { key: string; dr: string; stop: string; label: string; quantity: string; cbm: string };
export type CargoTruck = { id: string; label: string; capacity: string; driverId: string; driverLabel: string };
export type CargoPlacement = { line_key: string; truck_id: string; quantity: string; allocated_cbm: string };
export type CargoPlan = { trucks: CargoTruck[]; placements: CargoPlacement[]; signature: string; confirmed: boolean; schedule?: { loading_date: string; estimated_delivery_date: string; unreserved_confirmed: boolean } };
export const emptyCargoPlan = (): CargoPlan => ({ trucks: [], placements: [], signature: "", confirmed: false });
const parts = (value: string) => {
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) throw Error("Cargo quantities, Total CBM and truck capacities must be non-negative decimals.");
  const [whole, fraction = ""] = value.trim().split(".");
  return { units: BigInt(whole + fraction), scale: fraction.length };
};
const units = (value: string, scale: number) => { const p = parts(value); return p.units * 10n ** BigInt(scale - p.scale); };
const text = (value: bigint, scale: number): string => {
  if (value < 0n) return `-${text(-value, scale)}`;
  const digits = value.toString().padStart(scale + 1, "0");
  return scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, "") || "0" : digits;
};
export const cargoSignature = (lines: CargoLine[], trucks: CargoTruck[]) => JSON.stringify([lines.map(line=>[line.key,line.dr,line.stop,line.quantity,line.cbm]),trucks.map(truck=>[truck.id,truck.capacity,truck.driverId])]);
export function cargoCapacity(capacity: string, placements: CargoPlacement[]) {
  try {
    const scale = Math.max(0, ...placements.map(p => parts(p.allocated_cbm).scale), ...(capacity ? [parts(capacity).scale] : []));
    const assigned = placements.reduce((sum, p) => sum + units(p.allocated_cbm, scale), 0n);
    const maximum = capacity ? units(capacity, scale) : null;
    return { assigned: text(assigned, scale), remaining: maximum === null ? "unknown" : text(maximum - assigned, scale), exceeded: maximum !== null && assigned > maximum, full: maximum !== null && assigned === maximum };
  } catch { return { assigned: "Check values", remaining: "unknown", exceeded: false, full: false }; }
}
/** Best-fit decreasing DR groups, then intact lines, then exactly representable whole units. */
export function suggestCargo(lines: CargoLine[], trucks: CargoTruck[]): CargoPlacement[] {
  if (!trucks.length) throw Error("Add a truck before suggesting cargo.");
  const scale = Math.max(0, ...lines.map(line => parts(line.cbm).scale), ...trucks.map(truck => parts(truck.capacity).scale));
  const remaining = new Map(trucks.map(truck => [truck.id, units(truck.capacity, scale)]));
  if ([...remaining.values()].some(capacity => capacity <= 0n)) throw Error("Configure a positive maximum CBM for every truck.");
  const result: CargoPlacement[] = [];
  const best = (cbm: bigint) => [...remaining].filter(([, space]) => space >= cbm).sort((a, b) => a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)[0]?.[0];
  const put = (line: CargoLine, truck: string, quantity: string, cbm: bigint) => {
    remaining.set(truck, remaining.get(truck)! - cbm);
    result.push({ line_key: line.key, truck_id: truck, quantity, allocated_cbm: text(cbm, scale) });
  };
  const groups = new Map<string, CargoLine[]>();
  for (const line of lines) { const key = line.dr.trim() || line.key; groups.set(key, [...(groups.get(key) ?? []), line]); }
  const total = (group: CargoLine[]) => group.reduce((sum, line) => sum + units(line.cbm, scale), 0n);
  for (const group of [...groups.values()].sort((a, b) => total(a) > total(b) ? -1 : total(a) < total(b) ? 1 : 0)) {
    const whole = best(total(group));
    if (whole) { for (const line of group) put(line, whole, line.quantity, units(line.cbm, scale)); continue; }
    for (const line of group) {
      const cbm = units(line.cbm, scale), target = best(cbm);
      if (target) { put(line, target, line.quantity, cbm); continue; }
      const quantity = parts(line.quantity), divisor = 10n ** BigInt(quantity.scale);
      if (quantity.units % divisor !== 0n) throw Error(`${line.label}: fractional quantities cannot be split automatically.`);
      let qty = quantity.units / divisor;
      if (!qty || cbm % qty !== 0n) throw Error(`${line.label}: cannot split whole units exactly. Move another DR group or add capacity.`);
      const perUnit = cbm / qty;
      for (const [truck, available] of [...remaining].sort((a, b) => a[1] > b[1] ? -1 : a[1] < b[1] ? 1 : 0)) {
        const count = perUnit ? (available / perUnit < qty ? available / perUnit : qty) : qty;
        if (count > 0n) { put(line, truck, count.toString(), count * perUnit); qty -= count; }
        if (!qty) break;
      }
      if (qty) throw Error(`More capacity is required for ${line.label}. Add another truck or change the proposed distribution.`);
    }
  }
  return result;
}
export function validateCargo(lines: CargoLine[], trucks: CargoTruck[], placements: CargoPlacement[]): string | null {
  try {
    if (new Set(trucks.map(t => t.id)).size !== trucks.length) return "The same truck cannot be assigned twice.";
    const drivers = trucks.map(t => t.driverId).filter(Boolean);
    if (new Set(drivers).size !== drivers.length) return "Choose different drivers for the trucks in this trip.";
    if (trucks.length > 1 && drivers.length !== trucks.length) return "Select a driver for each truck before confirming multi-truck cargo.";
    const scale = Math.max(0, ...lines.map(l => parts(l.cbm).scale), ...trucks.map(t => parts(t.capacity).scale), ...placements.map(p => parts(p.allocated_cbm).scale));
    const quantityScale = Math.max(0, ...lines.map(l => parts(l.quantity).scale), ...placements.map(p => parts(p.quantity).scale));
    const pairs = new Set<string>();
    for (const placement of placements) {
      const line = lines.find(l => l.key === placement.line_key);
      if (!line || !trucks.some(t => t.id === placement.truck_id)) return "Cargo refers to a removed product or truck. Recalculate the proposal.";
      if(units(placement.quantity,quantityScale)===0n&&units(placement.allocated_cbm,scale)===0n&&(units(line.quantity,quantityScale)>0n||units(line.cbm,scale)>0n))return `${line.label}: complete or remove the empty split before confirming.`;
      const pair = `${line.key}:${placement.truck_id}`;
      if (pairs.has(pair)) return "Merge duplicate product allocations for the same truck.";
      pairs.add(pair);
      if (units(placement.quantity, quantityScale) * units(line.cbm, scale) !== units(line.quantity, quantityScale) * units(placement.allocated_cbm, scale)) return `${line.label}: quantity and CBM proportions differ from the source.`;
      if (placements.filter(p => p.line_key === line.key).length > 1 && units(placement.quantity, quantityScale) % (10n ** BigInt(quantityScale)) !== 0n) return `${line.label}: only whole units may be split.`;
    }
    for (const line of lines) {
      const allocated = placements.filter(p => p.line_key === line.key);
      if (allocated.reduce((n, p) => n + units(p.quantity, quantityScale), 0n) !== units(line.quantity, quantityScale) || allocated.reduce((n, p) => n + units(p.allocated_cbm, scale), 0n) !== units(line.cbm, scale)) return `${line.label}: allocate exactly the original quantity and Total CBM.`;
    }
    for (const truck of trucks) {
      const capacity = units(truck.capacity, scale);
      if (capacity <= 0n) return `${truck.label}: configure its maximum CBM first.`;
      if (placements.filter(p => p.truck_id === truck.id).reduce((n, p) => n + units(p.allocated_cbm, scale), 0n) > capacity) return `${truck.label}: maximum CBM exceeded.`;
    }
    return null;
  } catch (error) { return error instanceof Error ? error.message : "Check cargo values."; }
}

/** Exact decimal multiplication, used only when a total is missing or explicitly recalculated. */
export function calculatedCbm(quantity:string,unit:string){const q=parts(quantity),u=parts(unit);return text(q.units*u.units,q.scale+u.scale);}
