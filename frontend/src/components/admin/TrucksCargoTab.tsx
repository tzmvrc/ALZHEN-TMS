import TruckPicker from "./TruckPicker";
import { useCallback, useEffect, useState } from "react";
import { Plus, X, Undo2 } from "lucide-react";
import { fetchTruckAvailability, fetchDriverAvailability, getCachedRelationshipOptions, searchRelationshipOptions, type TruckAvailability, type DriverAvailability } from "../../services/lookup.service";
import { validateCargo, type CargoLine, type CargoPlan, type CargoTruck } from "../../services/cargo-planning";
import { setDefaultTripDriver } from "../../services/trip-import.service";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import CargoAllocationBoard from "./CargoAllocationBoard";
import TripPopover from "./shared/TripPopover";
import { fieldControl, secondaryAction } from "./shared/styles";
import { useAutoAllocation, type AllocationSession } from "./useAutoAllocation";

export type TrucksCargoTabProps = { token: string; lines: CargoLine[]; plan: CargoPlan; onChange: (plan: CargoPlan) => void; fixedTrucks?: CargoTruck[]; existingTripId?: string; scheduleManaged?: boolean; onEditSchedule?: () => void; disabled?: boolean; truckTypes?: Record<string, string>; onAddTruck?: () => void; session?: AllocationSession; excludedTruckIds?: string[]; onCapacity?: (cbm: string) => void; simple?: boolean };

export default function TrucksCargoTab({ token, lines, plan, onChange, fixedTrucks, existingTripId, onEditSchedule, scheduleManaged = false, disabled = false, truckTypes, onAddTruck, session, excludedTruckIds = [], onCapacity, simple = false }: TrucksCargoTabProps) {
  const trucks = fixedTrucks ?? plan.trucks, manual = Boolean(fixedTrucks);
  const schedule = plan.schedule ?? { loading_date: "", estimated_delivery_date: "", unreserved_confirmed: false };
  const [popover, setPopover] = useState<string | null>(null), [error, setError] = useState("");
  const [schedules, setSchedules] = useState<{ trucks: TruckAvailability[]; drivers: DriverAvailability[]; key: string }>({ trucks: [], drivers: [], key: "" });
  const [scheduleError, setScheduleError] = useState("");
  const [defaultSaving, setDefaultSaving] = useState(false), [defaultNotice, setDefaultNotice] = useState("");
  const scheduleKey = JSON.stringify([schedule.loading_date, schedule.estimated_delivery_date, existingTripId]);
  useEffect(() => {
    if (manual || disabled) return;
    let current = true;
    const timer = setTimeout(() => {
      setScheduleError("");
      void Promise.all([fetchTruckAvailability(token, schedule.loading_date, schedule.estimated_delivery_date, existingTripId), fetchDriverAvailability(token, schedule.loading_date, schedule.estimated_delivery_date, existingTripId)])
        .then(([trucks, drivers]) => { if (current) setSchedules({ trucks, drivers, key: scheduleKey }); })
        .catch(() => { if (current) setScheduleError("Availability could not be checked. Try again before saving."); });
    }, 150);
    return () => { current = false; clearTimeout(timer); };
  }, [manual, disabled, token, schedule.loading_date, schedule.estimated_delivery_date, existingTripId, scheduleKey]);
  const conflictingDrivers = schedules.drivers.filter(item => item.availability === "CONFLICT").map(item => item.id);
  const conflictingTrucks = [...excludedTruckIds, ...schedules.trucks.filter(item => item.availability === "CONFLICT").map(item => item.id), ...trucks.filter(truck => conflictingDrivers.includes(truck.driverId)).map(truck => truck.id)];
  const unavailableDriversKey = JSON.stringify([...conflictingDrivers, ...trucks.filter(truck => truck.id !== popover).map(truck => truck.driverId).filter(Boolean)].sort());
  const driverOptions = useCallback(async (query: string) => { const unavailable: string[] = JSON.parse(unavailableDriversKey); return (await searchRelationshipOptions(token, "drivers", query)).filter(option => !unavailable.includes(option.id)); }, [token, unavailableDriversKey]);
  const scheduleProblem = !manual && ((!schedule.loading_date || !schedule.estimated_delivery_date) ? !schedule.unreserved_confirmed : schedule.estimated_delivery_date < schedule.loading_date);
  const ready = manual || (schedules.key === scheduleKey && !scheduleError);
  const allocation = useAutoAllocation({ lines, trucks, plan, onChange, excluded: conflictingTrucks, ready, disabled, session, canConfirm: simple || !scheduleProblem });
  const selected = trucks.find(truck => truck.id === popover);
  const updateTrucks = (next: CargoTruck[]) => onChange({ ...plan, trucks: next, confirmed: false });
  const updateSchedule = (patch: Partial<typeof schedule>) => onChange({ ...plan, trucks, schedule: { ...schedule, ...patch }, confirmed: false });
  const capacity = allocation.proposal.capacityCbm;
  useEffect(() => { onCapacity?.(capacity); }, [capacity, onCapacity]);
  const warning = allocation.proposal.warnings.find(item => !item.group);
  const date = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Not set";
  if (simple && manual) {
    const allocationError = trucks.length ? validateCargo(lines, trucks, plan.placements) : null;
    return <section className="trip-simple-allocation" aria-label="Cargo allocation">
      <div className="trip-simple-heading"><h3>CBM allocation</h3><span>{allocation.proposal.assignedCbm} / {allocation.proposal.capacityCbm} CBM</span></div>
      <p className="text-xs text-slate-500">Products are assigned to the selected trucks automatically by CBM.</p>
      {warning && <p role="alert" className="text-xs text-amber-800">{warning.message}</p>}
      {allocationError && <p role="alert" className="text-xs text-amber-800">{allocationError}</p>}
      {trucks.length > 0 && !plan.confirmed && <button type="button" className={secondaryAction} disabled={disabled} onClick={allocation.run}>Allocate by CBM</button>}
      {allocationError && trucks.length > 0 && <details className="trip-simple-advanced"><summary>Adjust product allocation</summary><CargoAllocationBoard lines={lines} trucks={trucks} placements={plan.placements} disabled={disabled} update={allocation.manual} onError={setError} lockedGroups={Object.keys(allocation.locks)} onUnlock={allocation.unlock} warnings={allocation.proposal.warnings} truckTypes={Object.fromEntries(trucks.map(truck => [truck.id, truckTypes?.[truck.id] || "Truck"]))} onTruckSettings={setPopover} /></details>}
      {error && <p role="alert" className="text-xs text-amber-800">{error}</p>}
    </section>;
  }
  if (simple && !manual) {
    const allocationError = trucks.length ? validateCargo(lines, trucks, plan.placements) : null;
    return <section className="trip-simple-allocation" aria-label="Truck and driver assignments">
      <div className="trip-simple-heading"><h3>Trucks &amp; drivers</h3><button type="button" className={secondaryAction} disabled={disabled} onClick={() => setPopover("add")}><Plus size={14} />Add truck</button></div>
      {trucks.length === 0 && <p className="text-sm text-slate-600">Add a truck. Its CBM capacity will be used to allocate the product rows automatically.</p>}
      {trucks.map(truck => { const assigned = plan.placements.filter(item => item.truck_id === truck.id).reduce((total, item) => total + (Number(item.allocated_cbm) || 0), 0); return <div key={truck.id} className="trip-simple-truck"><div><strong>{truck.label}</strong><p>{assigned.toLocaleString(undefined, { maximumFractionDigits: 4 })} / {truck.capacity || "?"} CBM</p></div><label>Driver<SearchableRelationshipEditor presentation="form" token={token} kind="drivers" optionLoader={driverOptions} value={truck.driverLabel} disabled={disabled} autoFocus={false} unavailableIds={[...conflictingDrivers, ...trucks.filter(item => item.id !== truck.id).map(item => item.driverId).filter(Boolean)]} onSelect={option => updateTrucks(trucks.map(item => item.id === truck.id ? { ...item, driverId: option.id, driverLabel: option.label } : item))} onCommitBlur={() => {}} onCancel={() => {}} /></label><button type="button" aria-label={`Remove ${truck.label}`} disabled={disabled} onClick={() => updateTrucks(trucks.filter(item => item.id !== truck.id))}><X size={16} /></button></div>; })}
      {trucks.length > 0 && <p className="text-xs text-slate-500">{allocation.proposal.assignedCbm} of {allocation.proposal.capacityCbm} CBM allocated{plan.confirmed && !allocationError ? " · Ready" : ""}</p>}
      {scheduleError && <p role="alert" className="text-xs text-amber-800">{scheduleError}</p>}
      {warning && <p role="alert" className="text-xs text-amber-800">{warning.message}</p>}
      {allocationError && <p role="alert" className="text-xs text-amber-800">{allocationError}</p>}
      {trucks.length > 0 && !plan.confirmed && <button type="button" className={secondaryAction} disabled={disabled || !ready} onClick={allocation.run}>Allocate by CBM</button>}
      {allocationError && trucks.length > 0 && <details className="trip-simple-advanced"><summary>Adjust product allocation</summary><CargoAllocationBoard lines={lines} trucks={trucks} placements={plan.placements} disabled={disabled} update={allocation.manual} onError={setError} lockedGroups={Object.keys(allocation.locks)} onUnlock={allocation.unlock} warnings={allocation.proposal.warnings} truckTypes={Object.fromEntries(trucks.map(truck => [truck.id, truckTypes?.[truck.id] || "Truck"]))} onTruckSettings={setPopover} onRemoveTruck={id => updateTrucks(trucks.filter(item => item.id !== id))} /></details>}
      {error && <p role="alert" className="text-xs text-amber-800">{error}</p>}
      {popover === "add" && <TruckPicker token={token} start={schedule.loading_date} end={schedule.estimated_delivery_date} excludeTripId={existingTripId} selectedIds={trucks.map(truck => truck.id)} onClose={() => setPopover(null)} onSelect={option => { const defaultDriver = option.values?.default_driver_id ?? ""; const driverId = conflictingDrivers.includes(defaultDriver) || trucks.some(truck => truck.driverId === defaultDriver) ? "" : defaultDriver; updateTrucks([...trucks, { id: option.id, label: option.label, capacity: option.values?.capacity_cbm ?? "", driverId, driverLabel: driverId ? option.values?.default_driver_name ?? "" : "", companyId: option.values?.trucking_company_id || "", companyLabel: option.values?.trucking_company_name || "" }]); setPopover(null); }} />}
    </section>;
  }
  return <section className="trucks-cargo-tab" aria-label="Truck and cargo assignment">
    <div className="cargo-assignment-toolbar"><h3>Truck allocation</h3>{(!manual || onAddTruck) && <button type="button" disabled={disabled} className={secondaryAction} onClick={() => manual ? onAddTruck?.() : setPopover("add")}><Plus size={12} />Add truck</button>}</div>
    {!manual && <div className="cargo-schedule-line"><span title="Known conflicts are excluded. Availability is checked again when saving.">Loading {date(schedule.loading_date)} → Delivery {date(schedule.estimated_delivery_date)}</span><button type="button" disabled={disabled} onClick={() => scheduleManaged && onEditSchedule ? onEditSchedule() : setPopover("schedule")}>Edit</button>{(!schedule.loading_date || !schedule.estimated_delivery_date) && <label><input type="checkbox" disabled={disabled} checked={schedule.unreserved_confirmed} onChange={event => updateSchedule({ unreserved_confirmed: event.target.checked })} />Plan without reserving dates</label>}</div>}
    {scheduleError ? <p role="alert" className="text-xs text-amber-800">{scheduleError}</p> : !ready && <p role="status" className="text-xs text-slate-500">Checking availability before auto-assigning…</p>}
    {warning && <p role="status" className="cargo-warning">{warning.message}</p>}
    {allocation.notice && <div role="status" className="cargo-auto-notice"><span>{allocation.notice}</span><button type="button" disabled={disabled || !allocation.canUndo} onClick={allocation.undo}><Undo2 size={12} />Undo</button><button type="button" disabled={disabled || !ready} onClick={allocation.run}>Re-run auto-assign</button><button type="button" aria-label="Dismiss allocation summary" onClick={allocation.dismiss}><X size={12} /></button></div>}
    {!allocation.notice && <button type="button" className="text-xs text-[#2678b9]" disabled={disabled || !ready} onClick={allocation.run}>Re-run auto-assign</button>}
    <CargoAllocationBoard lines={lines} trucks={trucks} placements={plan.placements} disabled={disabled} update={allocation.manual} onError={setError} lockedGroups={Object.keys(allocation.locks)} onUnlock={allocation.unlock} warnings={allocation.proposal.warnings} truckTypes={Object.fromEntries(trucks.map(truck => [truck.id, truckTypes?.[truck.id] || schedules.trucks.find(item => item.id === truck.id)?.truck_type || getCachedRelationshipOptions(token, "trucks")?.find(item => item.id === truck.id)?.values?.truck_type || "Truck"]))} onTruckSettings={setPopover} onRemoveTruck={manual ? undefined : id => updateTrucks(trucks.filter(item => item.id !== id))} />
    {error && <p role="alert" className="text-xs text-amber-800">{error}</p>}{defaultNotice && <p role="status" className="text-xs text-emerald-700">{defaultNotice}</p>}
    {popover === "add" && <TruckPicker token={token} start={schedule.loading_date} end={schedule.estimated_delivery_date} excludeTripId={existingTripId} selectedIds={trucks.map(truck => truck.id)} onClose={() => setPopover(null)} onSelect={option => {
      if (trucks.some(truck => truck.id === option.id)) return;
      const defaultDriver = option.values?.default_driver_id ?? "";
      const driverId = conflictingDrivers.includes(defaultDriver) || trucks.some(truck => truck.driverId === defaultDriver) ? "" : defaultDriver;
      updateTrucks([...trucks, { id: option.id, label: option.label, capacity: option.values?.capacity_cbm ?? "", driverId, driverLabel: driverId ? option.values?.default_driver_name ?? "" : "", companyId: option.values?.trucking_company_id || "", companyLabel: option.values?.trucking_company_name || "" }]); setPopover(null);
    }} />}
    {popover === "schedule" && <TripPopover title="Trip schedule" onClose={() => setPopover(null)}><div className="grid gap-4 sm:grid-cols-2">{(["loading_date", "estimated_delivery_date"] as const).map(field => <label key={field}>{field === "loading_date" ? "Loading date" : "Delivery date"}<input type="date" className={fieldControl} value={schedule[field]} disabled={disabled} onChange={event => updateSchedule({ [field]: event.target.value, unreserved_confirmed: false })} /></label>)}</div></TripPopover>}
    {selected && <TripPopover title={`${selected.label} settings`} onClose={() => setPopover(null)}><div className="grid gap-4"><label>Change driver<SearchableRelationshipEditor presentation="form" token={token} kind="drivers" optionLoader={driverOptions} value={selected.driverLabel} disabled={disabled || manual} autoFocus={false} unavailableIds={[...conflictingDrivers, ...trucks.filter(truck => truck.id !== selected.id).map(truck => truck.driverId).filter(Boolean)]} onSelect={option => updateTrucks(trucks.map(truck => truck.id === selected.id ? { ...truck, driverId: option.id, driverLabel: option.label } : truck))} onCommitBlur={() => {}} onCancel={() => {}} /></label>{!manual && selected.driverId && <button type="button" className="text-xs text-[#2678b9]" disabled={disabled} onClick={() => updateTrucks(trucks.map(truck => truck.id === selected.id ? { ...truck, driverId: "", driverLabel: "" } : truck))}>Assign later</button>}<label>Trucking company<SearchableRelationshipEditor presentation="form" token={token} kind="trucking-companies" value={selected.companyLabel ?? ""} disabled={disabled || manual} autoFocus={false} onSelect={option => updateTrucks(trucks.map(truck => truck.id === selected.id ? { ...truck, companyId: option.id, companyLabel: option.label } : truck))} onCommitBlur={() => {}} onCancel={() => {}} /></label>{selected.driverId && <button type="button" className={secondaryAction} disabled={disabled || defaultSaving} onClick={async () => { setDefaultSaving(true); try { await setDefaultTripDriver(token, selected.id, selected.driverId); setDefaultNotice(`Default driver saved for ${selected.label}.`); } catch { setError("Default driver could not be saved. Try again."); } finally { setDefaultSaving(false); } }}>Set as truck default driver</button>}{manual && <p className="text-xs text-slate-500">Edit the truck and driver in Assignments.</p>}</div></TripPopover>}
  </section>;
}
