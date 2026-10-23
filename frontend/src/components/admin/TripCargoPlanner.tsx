import { CapacityBar, EmptyState, TruckCard, StatusChip, StatChip, SectionCard } from "./shared";
import { fieldControl, secondaryAction } from "./shared/styles";
import { useEffect, useRef, useState } from "react";
import { fetchTruckAvailability, fetchDriverAvailability, getCachedRelationshipOptions, type TruckAvailability, type DriverAvailability } from "../../services/lookup.service";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import CargoAllocationBoard from "./CargoAllocationBoard";
import { setDefaultTripDriver } from "../../services/trip-import.service";
import { cargoCapacity, cargoSignature, cargoTotal, suggestCargo, validateCargo, type CargoLine, type CargoPlan, type CargoTruck } from "../../services/cargo-planning";

const exactTotal = (values: string[]) => { try { return cargoTotal(values); } catch { return "Check values"; } };

export default function TripCargoPlanner({ token, lines, plan, onChange, fixedTrucks, existingTripId, scheduleManaged = false, onEditSchedule, truckTypes, onAddTruck, disabled = false }: { token: string; lines: CargoLine[]; plan: CargoPlan; onChange: (plan: CargoPlan) => void; fixedTrucks?: CargoTruck[]; existingTripId?: string; scheduleManaged?: boolean; onEditSchedule?: () => void; disabled?: boolean; truckTypes?: Record<string, string>; onAddTruck?: () => void }) {
  const [error, setError] = useState("");
  const addTruck = useRef<HTMLDivElement>(null);
  const [chosenTypes, setChosenTypes] = useState<Record<string, string>>({});
  const [defaultSaving, setDefaultSaving] = useState(false), [defaultNotice, setDefaultNotice] = useState("");
  const [schedules, setSchedules] = useState<{ trucks: TruckAvailability[]; drivers: DriverAvailability[] }>({ trucks: [], drivers: [] });
  const [checkingSchedule, setCheckingSchedule] = useState(false), [scheduleError, setScheduleError] = useState("");
  const trucks = fixedTrucks ?? plan.trucks;
  const signature = cargoSignature(lines, trucks), stale = plan.signature !== signature;
  const problem = validateCargo(lines, trucks, plan.placements);
  const schedule = plan.schedule ?? { loading_date: "", estimated_delivery_date: "", unreserved_confirmed: false };
  const manual = Boolean(fixedTrucks);

  useEffect(() => {
    if (manual || disabled) return; let current = true;
    const timer = setTimeout(() => {
      setCheckingSchedule(true); setScheduleError("");
      void Promise.all([
        fetchTruckAvailability(token, schedule.loading_date, schedule.estimated_delivery_date, existingTripId),
        fetchDriverAvailability(token, schedule.loading_date, schedule.estimated_delivery_date, existingTripId),
      ]).then(([trucks, drivers]) => { if (current) setSchedules({ trucks, drivers }); })
        .catch(cause => { if (current) setScheduleError(cause instanceof Error ? cause.message : "Unable to check schedules."); })
        .finally(() => { if (current) setCheckingSchedule(false); });
    }, 200);
    return () => { current = false; clearTimeout(timer); };
  }, [token, manual, disabled, schedule.loading_date, schedule.estimated_delivery_date, existingTripId]);

  const conflictingTrucks = schedules.trucks.filter(truck => truck.availability === "CONFLICT").map(truck => truck.id);
  const conflictingDrivers = schedules.drivers.filter(driver => driver.availability === "CONFLICT").map(driver => driver.id);
  const conflict = !manual && trucks.some(truck => conflictingTrucks.includes(truck.id) || conflictingDrivers.includes(truck.driverId));
  const scheduleProblem = !fixedTrucks && (!schedule.loading_date || !schedule.estimated_delivery_date) && !schedule.unreserved_confirmed
    ? "Choose loading and delivery dates or confirm this is an unreserved planned assignment."
    : !fixedTrucks && schedule.loading_date && schedule.estimated_delivery_date && schedule.estimated_delivery_date < schedule.loading_date
      ? "Delivery date cannot precede loading date."
      : "";

  const update = (patch: Partial<CargoPlan>) => onChange({ ...plan, trucks, ...patch, confirmed: false });

  const sourceGroups = [...new Set(lines.map(line => line.phTruckReference).filter((reference): reference is string => Boolean(reference)))];
  const handleSuggest = () => {
    try {
      update({ placements: suggestCargo(lines, trucks), signature });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to suggest cargo.");
    }
  };

  const confirmBlocked = disabled || stale || Boolean(problem) || Boolean(scheduleProblem) || checkingSchedule || Boolean(scheduleError) || conflict;
  const reviewed = plan.confirmed && !stale && !problem && !scheduleProblem && !conflict;
  const proposalState = !plan.placements.length ? "Not proposed" : stale ? "Stale" : reviewed ? "Confirmed" : "Proposed (needs review)";
  const fleetCapacity = trucks.every(truck => Boolean(truck.capacity.trim())) ? exactTotal(trucks.map(truck => truck.capacity)) : "";
  const capacity = fleetCapacity === "Check values" ? "" : fleetCapacity;
  const sourceTotal = exactTotal(lines.map(line => line.cbm));
  const fleetUsage = cargoCapacity(capacity, lines.map(line => ({ line_key: line.key, truck_id: "source", quantity: line.quantity, allocated_cbm: line.cbm })));
  const addAnother = () => { if (manual) onAddTruck?.(); else { addTruck.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); addTruck.current?.querySelector<HTMLInputElement>("input")?.focus(); } };
  return <section aria-label="Truck and cargo assignment" className="min-w-0 space-y-5">
    <header><h3 className="text-sm font-semibold text-[#0b2341]">Truck, driver &amp; cargo assignment</h3><p className="mt-1 text-xs text-slate-500">Select physical trucks and review every source product. DR cards keep related lines together; use Move to menus or drag cards between columns.</p></header>
    <SectionCard title="Fleet capacity" actions={(!manual || onAddTruck) && <button type="button" className={secondaryAction} disabled={disabled} onClick={addAnother}>Add another truck</button>}>
      <CapacityBar assigned={sourceTotal} capacity={capacity} usage={fleetUsage} label="Source cargo / fleet capacity" />
      <div className="mt-3 flex flex-wrap gap-2"><StatChip label="Source lines" value={lines.length} /><StatChip label="Allocated CBM" value={exactTotal(plan.placements.map(item => item.allocated_cbm))} /><StatChip label="Trucks" value={trucks.length} /></div>
    </SectionCard>
    {!fixedTrucks && <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><legend className="px-1 text-xs font-semibold text-slate-700">Schedule</legend>
      {scheduleManaged ? <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs tabular-nums text-slate-600">Loading: {schedule.loading_date || "Not set"} / Delivery: {schedule.estimated_delivery_date || "Not set"}</p>{onEditSchedule && <button type="button" disabled={disabled} onClick={onEditSchedule} className={secondaryAction}>Edit trip dates</button>}</div> : <div className="grid gap-3 sm:grid-cols-2">{(["loading_date", "estimated_delivery_date"] as const).map(field => <label key={field} className="text-xs text-slate-600">{field === "loading_date" ? "Loading date" : "Estimated delivery date"}<input type="date" disabled={disabled} value={schedule[field]} onChange={event => update({ schedule: { ...schedule, [field]: event.target.value, unreserved_confirmed: false } })} className={`${fieldControl} mt-1`} /></label>)}</div>}
      <p className="text-xs text-slate-500">Overlapping active truck and driver schedules are checked again by the database when saving.</p>
      {(!schedule.loading_date || !schedule.estimated_delivery_date) && <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><input type="checkbox" disabled={disabled} checked={schedule.unreserved_confirmed} onChange={event => update({ schedule: { ...schedule, unreserved_confirmed: event.target.checked } })} />Keep this planned assignment unreserved until its loading and delivery dates are completed.</label>}
      <p role="status" className={`text-xs ${scheduleError || conflict ? "text-rose-700" : "text-slate-500"}`}>{checkingSchedule ? "Checking truck and driver schedules..." : scheduleError || (conflict ? "A selected truck or driver has an overlapping active trip. Change the selection or dates." : "Known schedule conflicts are excluded from the selectors.")}</p>
    </fieldset>}
    {!fixedTrucks && !disabled && <div ref={addTruck}><p className="mb-2 text-xs font-semibold text-slate-600">Add a truck</p><div className="rounded-xl border border-slate-200 bg-white p-3"><SearchableRelationshipEditor presentation="form" token={token} kind="trucks" unavailableIds={[...trucks.map(truck => truck.id), ...conflictingTrucks]} value="" autoFocus={false} onSelect={option => {
      if (trucks.some(truck => truck.id === option.id)) { setError("That truck is already selected for this trip."); return; }
      const defaultDriver = option.values?.default_driver_id ?? "";
      const driverId = trucks.some(truck => truck.driverId === defaultDriver) || conflictingDrivers.includes(defaultDriver) ? "" : defaultDriver;
      setChosenTypes(current => ({ ...current, [option.id]: option.values?.truck_type || "" }));
      update({ trucks: [...trucks, { id: option.id, label: option.label, capacity: option.values?.capacity_cbm ?? "", driverId, driverLabel: driverId ? option.values?.default_driver_name ?? "" : "", companyId: option.values?.trucking_company_id || "", companyLabel: option.values?.trucking_company_name || "" }] });
    }} onCommitBlur={() => {}} onCancel={() => {}} /></div></div>}
    {!trucks.length && <EmptyState title="Add a truck to start distributing cargo." description="Trucks and drivers can be assigned later." />}
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">{trucks.map(truck => {
      const usage = cargoCapacity(truck.capacity, plan.placements.filter(item => item.truck_id === truck.id));
      const available = schedules.trucks.find(item => item.id === truck.id);
      const type = truckTypes?.[truck.id] || chosenTypes[truck.id] || available?.truck_type || getCachedRelationshipOptions(token, "trucks")?.find(item => item.id === truck.id)?.values?.truck_type || "Truck type unavailable";
      return <TruckCard key={truck.id} title={truck.label} description={type} assigned={usage.assigned} capacity={truck.capacity} usage={usage}
        availability={<StatusChip label={manual ? "Schedule managed in assignments" : checkingSchedule ? "Checking availability" : scheduleError ? "Availability unavailable" : available?.availability === "AVAILABLE" ? "Available" : available?.availability === "CONFLICT" ? "Schedule conflict" : "Availability needs review"} tone={!manual && available?.availability === "CONFLICT" ? "danger" : !manual && available?.availability === "AVAILABLE" && !scheduleError ? "success" : "warning"} />}
        actions={!fixedTrucks && <button type="button" disabled={disabled} className={secondaryAction} onClick={() => update({ trucks: trucks.filter(item => item.id !== truck.id), placements: plan.placements.filter(item => item.truck_id !== truck.id) })}>Remove truck</button>}>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2"><div className="min-w-0"><p className="mb-2 text-xs font-medium text-slate-600">Driver</p>{!fixedTrucks ? <SearchableRelationshipEditor presentation="form" token={token} kind="drivers" unavailableIds={[...trucks.filter(other => other.id !== truck.id).map(other => other.driverId).filter(Boolean), ...conflictingDrivers]} value={truck.driverLabel} disabled={disabled} autoFocus={false} onSelect={option => {
          if (trucks.some(item => item.id !== truck.id && item.driverId === option.id)) { setError("That driver is already assigned to another truck in this trip."); return; }
          update({ trucks: trucks.map(item => item.id === truck.id ? { ...item, driverId: option.id, driverLabel: option.label } : item) });
        }} onCommitBlur={() => {}} onCancel={() => {}} /> : <p className="text-xs text-slate-500">{truck.driverLabel || "Driver unassigned"}</p>}</div>
        <div className="min-w-0"><p className="mb-2 text-xs font-medium text-slate-600">Trucking company</p>{!fixedTrucks ? <SearchableRelationshipEditor presentation="form" token={token} kind="trucking-companies" value={truck.companyLabel ?? ""} disabled={disabled} autoFocus={false} onSelect={option => update({ trucks: trucks.map(item => item.id === truck.id ? { ...item, companyId: option.id, companyLabel: option.label } : item) })} onCommitBlur={() => {}} onCancel={() => {}} /> : <p className="text-xs text-slate-500">{truck.companyLabel || "Company unassigned"}</p>}</div></div>
        {truck.driverId && <button type="button" className={`${secondaryAction} mt-3`} disabled={disabled || defaultSaving} onClick={async () => {
          setDefaultSaving(true); setDefaultNotice("");
          try { await setDefaultTripDriver(token, truck.id, truck.driverId); setDefaultNotice(`Default driver saved for ${truck.label}.`); }
          catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save default driver."); }
          finally { setDefaultSaving(false); }
        }}>Set as truck default driver</button>}
        {(usage.exceeded || usage.full) && <p role="status" className={`mt-3 text-xs ${usage.exceeded ? "text-rose-700" : "text-amber-800"}`}>{usage.exceeded ? "Capacity exceeded. Move cargo or add another truck." : "Truck is full. Add another truck for additional cargo."}</p>}
      </TruckCard>;
    })}</div>
    {defaultNotice && <p role="status" className="text-xs text-emerald-700">{defaultNotice}</p>}
    {sourceGroups.length > 0 && <section aria-label="Original PH truck groups" className="space-y-2"><h4 className="text-xs font-semibold text-slate-600">Original PH truck groups</h4><div className="flex gap-3 overflow-x-auto pb-2">{sourceGroups.map(reference => {
      const grouped = lines.filter(line => line.phTruckReference === reference), keys = new Set(grouped.map(line => line.key)), allocated = plan.placements.filter(item => keys.has(item.line_key));
      return <div key={reference} className="min-w-64 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"><strong className="break-words text-[#0b2341]">{reference}</strong><p className="mt-1 tabular-nums">{grouped.length} source lines / Expected {exactTotal(grouped.map(line => line.cbm))} / Allocated {exactTotal(allocated.map(item => item.allocated_cbm))} CBM</p><p className="mt-1 text-slate-500">Physical trucks: {[...new Set(allocated.map(item => trucks.find(truck => truck.id === item.truck_id)?.label ?? "Removed truck"))].join(", ") || "Unassigned"}</p></div>;
    })}</div></section>}
    <section aria-label="Cargo proposal review" className={`space-y-3 rounded-xl border p-4 ${reviewed ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><StatusChip label={proposalState} tone={reviewed ? "success" : stale && plan.placements.length ? "danger" : "warning"} /><div className="flex flex-wrap gap-2"><button type="button" disabled={disabled || !lines.length || !trucks.length} className={secondaryAction} onClick={handleSuggest}>{plan.placements.length ? "Recalculate proposal" : "Suggest DR distribution"}</button><button type="button" className={`${secondaryAction} !bg-[#0b2341] !text-white`} disabled={confirmBlocked || !plan.placements.length} onClick={() => onChange({ ...plan, trucks, confirmed: true })}>Confirm</button></div></div>
      {stale && plan.placements.length > 0 && <><p className="text-xs text-amber-800">Cargo or trucks changed. Recalculate and review the proposal.</p><button type="button" className={secondaryAction} disabled={disabled || Boolean(problem)} onClick={() => update({ signature })}>Keep current allocations and review</button></>}
      {problem && (trucks.length > 0 || plan.placements.length > 0) && <p role="status" className="break-words text-xs text-amber-900">{problem}</p>}
      {scheduleProblem && <p role="status" className="text-xs text-amber-900">{scheduleProblem}</p>}
      {plan.placements.length > 0 && <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" disabled={confirmBlocked} checked={Boolean(reviewed)} onChange={event => onChange({ ...plan, trucks, confirmed: event.target.checked })} />I reviewed this distribution. Preserve these quantities, trucks and destinations when saving.</label>}
    </section>
    <CargoAllocationBoard lines={lines} trucks={trucks} placements={plan.placements} disabled={disabled} update={update} onError={setError} />
    {error && <p role="alert" className="break-words rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
  </section>;
}
