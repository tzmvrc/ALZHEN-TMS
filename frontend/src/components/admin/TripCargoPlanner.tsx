import { useEffect, useState } from "react";
import { fetchTruckAvailability, fetchDriverAvailability, type TruckAvailability, type DriverAvailability } from "../../services/lookup.service";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import { setDefaultTripDriver } from "../../services/trip-import.service";
import { cargoCapacity, cargoSignature, suggestCargo, validateCargo, type CargoLine, type CargoPlan, type CargoTruck } from "../../services/cargo-planning";

export default function TripCargoPlanner({ token, lines, plan, onChange, fixedTrucks, existingTripId, disabled = false }: { token: string; lines: CargoLine[]; plan: CargoPlan; onChange: (plan: CargoPlan) => void; fixedTrucks?: CargoTruck[]; existingTripId?: string; disabled?: boolean }) {
  const [error, setError] = useState("");
  const [movingDr, setMovingDr] = useState("");
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

  const handleSuggest = () => {
    try {
      update({ placements: suggestCargo(lines, trucks), signature });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to suggest cargo.");
    }
  };

  return (
    <section aria-label="Truck and cargo assignment" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">

      {/* ── Header ───────────────────────────────────────────────── */}
      <header>
        <h3 className="text-sm font-semibold text-[#0b2341]">Truck, driver &amp; cargo assignment</h3>
        <p className="mt-1 text-xs text-slate-500">
          Add every truck on the trip, pick a driver per truck, then distribute cargo. DR groups stay together when capacity allows. Unassigned cargo may remain on a planned trip.
        </p>
      </header>

      {/* ── Section 1: Schedule ──────────────────────────────────── */}
      {!fixedTrucks && (
        <fieldset className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/40 p-3">
          <legend className="px-1 text-xs font-semibold text-slate-700">Schedule</legend>

          <div className="grid gap-2 sm:grid-cols-2">
            {(["loading_date", "estimated_delivery_date"] as const).map(field => (
              <label key={field} className="text-xs">
                {field === "loading_date" ? "Loading date" : "Estimated delivery date"}
                <input
                  type="date"
                  disabled={disabled}
                  value={schedule[field]}
                  onChange={event => update({ schedule: { ...schedule, [field]: event.target.value, unreserved_confirmed: false } })}
                  className="mt-1 block w-full rounded border border-slate-200 bg-white p-2"
                />
              </label>
            ))}
          </div>

          <p className="text-xs text-slate-500">
            Overlapping active truck and driver schedules are checked again by the database when saving.
          </p>

          {(!schedule.loading_date || !schedule.estimated_delivery_date) && (
            <label className="flex gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              <input
                type="checkbox"
                disabled={disabled}
                checked={schedule.unreserved_confirmed}
                onChange={event => update({ schedule: { ...schedule, unreserved_confirmed: event.target.checked } })}
              />
              Keep this planned assignment unreserved until its loading and delivery dates are completed.
            </label>
          )}

          {!manual && (
            <p role="status" className={`text-xs ${scheduleError || conflict ? "text-rose-700" : "text-slate-500"}`}>
              {checkingSchedule
                ? "Checking truck and driver schedules..."
                : scheduleError ||
                  (conflict
                    ? "A selected truck or driver has an overlapping active trip. Change the selection or dates."
                    : "Known schedule conflicts are excluded from the selectors.")}
            </p>
          )}
        </fieldset>
      )}

      {/* ── Section 2: Trucks & drivers ──────────────────────────── */}
      <fieldset className="space-y-2">
        <legend className="px-1 text-xs font-semibold text-slate-700">Trucks &amp; drivers</legend>

        {!fixedTrucks && !disabled && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600">Add a truck</p>
            <div className="rounded-lg border border-slate-200 bg-white p-2.5">
              <SearchableRelationshipEditor
                presentation="form"
                token={token}
                kind="trucks"
                unavailableIds={[...trucks.map(truck => truck.id), ...conflictingTrucks]}
                value=""
                autoFocus={false}
                onSelect={option => {
                  if (trucks.some(t => t.id === option.id)) {
                    setError("That truck is already selected for this trip.");
                    return;
                  }
                  const defaultDriver = option.values?.default_driver_id ?? "";
                  const driverId = trucks.some(t => t.driverId === defaultDriver) || conflictingDrivers.includes(defaultDriver) ? "" : defaultDriver;
                  update({
                    trucks: [...trucks, {
                      id: option.id,
                      label: option.label,
                      capacity: option.values?.capacity_cbm ?? "",
                      driverId,
                      driverLabel: driverId ? option.values?.default_driver_name ?? "" : "",
                      companyId: option.values?.trucking_company_id || "",
                      companyLabel: option.values?.trucking_company_name || "",
                    }],
                  });
                }}
                onCommitBlur={() => {}}
                onCancel={() => {}}
              />
            </div>
          </div>
        )}

        {trucks.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
            No trucks added yet. Add at least one truck to distribute cargo.
          </p>
        )}

        <div className="space-y-2">
          {trucks.map(truck => {
            const usage = cargoCapacity(truck.capacity, plan.placements.filter(p => p.truck_id === truck.id));
            const tone = usage.exceeded
              ? "border-rose-200 bg-rose-50"
              : usage.full
                ? "border-amber-200 bg-amber-50"
                : "border-slate-100 bg-slate-50";
            return (
              <article key={truck.id} className={`grid items-start gap-3 rounded-lg border p-3 lg:grid-cols-[1.3fr_1fr_1fr_auto] ${tone}`}>
                {/* Truck identity + capacity */}
                <div className="min-w-0 text-xs">
                  <strong className="block truncate text-slate-800">{truck.label}</strong>
                  <p className="mt-0.5 text-slate-600">
                    Max {truck.capacity || "not configured"} · Assigned {usage.assigned} CBM · Remaining {usage.remaining}
                  </p>
                  {(usage.exceeded || usage.full) && (
                    <p role="status" className={`mt-1 text-xs ${usage.exceeded ? "text-rose-700" : "text-amber-800"}`}>
                      {usage.exceeded ? "Capacity exceeded. Move cargo or add another truck." : "Truck is full. Add another truck for additional cargo."}
                    </p>
                  )}
                </div>

                {/* Driver */}
                {!fixedTrucks ? (
                  <div className="min-w-0">
                    <p className="mb-1.5 text-xs font-medium text-slate-600">Driver</p>
                    <div className="rounded-lg border border-slate-200 bg-white p-2">
                      <SearchableRelationshipEditor
                        presentation="form"
                        token={token}
                        kind="drivers"
                        unavailableIds={[
                          ...trucks.filter(other => other.id !== truck.id).map(other => other.driverId).filter(Boolean),
                          ...conflictingDrivers,
                        ]}
                        value={truck.driverLabel}
                        disabled={disabled}
                        autoFocus={false}
                        onSelect={option => {
                          if (trucks.some(t => t.id !== truck.id && t.driverId === option.id)) {
                            setError("That driver is already assigned to another truck in this trip.");
                            return;
                          }
                          update({ trucks: trucks.map(t => t.id === truck.id ? { ...t, driverId: option.id, driverLabel: option.label } : t) });
                        }}
                        onCommitBlur={() => {}}
                        onCancel={() => {}}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="min-w-0">
                    <p className="mb-1.5 text-xs font-medium text-slate-600">Driver</p>
                    <span className="text-xs text-slate-500">{truck.driverLabel || "Driver unassigned"}</span>
                  </div>
                )}

                {/* Trucking company */}
                {!fixedTrucks ? (
                  <div className="min-w-0">
                    <p className="mb-1.5 text-xs font-medium text-slate-600">Trucking company</p>
                    <div className="rounded-lg border border-slate-200 bg-white p-2">
                      <SearchableRelationshipEditor
                        presentation="form"
                        token={token}
                        kind="trucking-companies"
                        value={truck.companyLabel ?? ""}
                        disabled={disabled}
                        autoFocus={false}
                        onSelect={option => update({ trucks: trucks.map(item => item.id === truck.id ? { ...item, companyId: option.id, companyLabel: option.label } : item) })}
                        onCommitBlur={() => {}}
                        onCancel={() => {}}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="min-w-0">
                    <p className="mb-1.5 text-xs font-medium text-slate-600">Trucking company</p>
                    <span className="text-xs text-slate-500">{truck.companyLabel || "Company unassigned"}</span>
                  </div>
                )}

                {/* Truck actions */}
                <div className="flex flex-col items-start gap-1 lg:items-end">
                  {truck.driverId && (
                    <button
                      type="button"
                      disabled={disabled || defaultSaving}
                      onClick={async () => {
                        setDefaultSaving(true); setDefaultNotice("");
                        try {
                          await setDefaultTripDriver(token, truck.id, truck.driverId);
                          setDefaultNotice(`Default driver saved for ${truck.label}.`);
                        } catch (cause) {
                          setError(cause instanceof Error ? cause.message : "Unable to save default driver.");
                        } finally {
                          setDefaultSaving(false);
                        }
                      }}
                      className="text-xs text-blue-700 hover:underline disabled:opacity-60"
                    >
                      Set this driver as truck default
                    </button>
                  )}
                  {!fixedTrucks && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => update({
                        trucks: trucks.filter(t => t.id !== truck.id),
                        placements: plan.placements.filter(p => p.truck_id !== truck.id),
                      })}
                      className="text-xs text-rose-700 hover:underline disabled:opacity-60"
                    >
                      Remove truck
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {defaultNotice && <p role="status" className="text-xs text-emerald-700">{defaultNotice}</p>}
      </fieldset>

      {/* ── Section 3: Cargo distribution ────────────────────────── */}
      <fieldset className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <legend className="px-1 text-xs font-semibold text-slate-700">Cargo distribution</legend>
          <button
            type="button"
            disabled={disabled || !lines.length || !trucks.length}
            onClick={handleSuggest}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-60"
          >
            {plan.placements.length ? "Recalculate proposal" : "Suggest DR distribution"}
          </button>
        </div>

        {plan.placements.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
            {!trucks.length
              ? "Add a truck above to start distributing cargo."
              : !lines.length
                ? "No product lines to distribute."
                : "No distribution yet. Click “Suggest DR distribution” to build a proposal, or continue with cargo unassigned."}
          </p>
        )}

        {plan.placements.length > 0 && (
          <>
            {/* Move an entire DR group */}
            <details className="rounded-lg border border-slate-100 bg-slate-50/40 px-3 py-2 text-xs">
              <summary className="cursor-pointer text-blue-700">Move an entire DR group</summary>
              <div className="mt-2 flex flex-wrap gap-2">
                <select
                  aria-label="DR group to move"
                  disabled={disabled}
                  value={movingDr}
                  onChange={e => setMovingDr(e.target.value)}
                  className="rounded border border-slate-200 bg-white p-2"
                >
                  <option value="">Choose DR</option>
                  {[...new Set(lines.map(line => line.dr).filter(Boolean))].map(dr => (
                    <option key={dr} value={dr}>{dr}</option>
                  ))}
                </select>
                <select
                  aria-label="Truck for DR group"
                  value=""
                  disabled={disabled || !movingDr}
                  className="rounded border border-slate-200 bg-white p-2"
                  onChange={e => {
                    const grouped = lines.filter(line => line.dr === movingDr);
                    const keys = new Set(grouped.map(line => line.key));
                    update({
                      placements: [
                        ...plan.placements.filter(placement => !keys.has(placement.line_key)),
                        ...grouped.map(line => ({ line_key: line.key, truck_id: e.target.value, quantity: line.quantity, allocated_cbm: line.cbm })),
                      ],
                    });
                  }}
                >
                  <option value="">Choose destination truck</option>
                  {trucks.map(truck => <option key={truck.id} value={truck.id}>{truck.label}</option>)}
                </select>
              </div>
            </details>

            {/* Placements table */}
            <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100">
                  <tr>
                    {["DR / destination / product", "Truck", "Quantity", "Total CBM", ""].map((title, i) => (
                      <th key={i} className="px-2 py-2 font-medium text-slate-600">{title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plan.placements.map((placement, index) => {
                    const line = lines.find(l => l.key === placement.line_key);
                    return (
                      <tr key={index} className="border-b border-slate-100">
                        <td className="px-2 py-2">
                          {line?.dr || "No DR"} · {line?.stop} · {line?.label}
                        </td>
                        <td className="px-2 py-2">
                          <select
                            disabled={disabled}
                            value={placement.truck_id}
                            onChange={e => update({ placements: plan.placements.map((p, i) => i === index ? { ...p, truck_id: e.target.value } : p) })}
                            className="max-w-44 rounded border border-slate-200 p-1"
                          >
                            {trucks.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                          </select>
                        </td>
                        {(["quantity", "allocated_cbm"] as const).map(key => (
                          <td key={key} className="px-2 py-2">
                            <input
                              aria-label={`${key} allocation ${index + 1}`}
                              disabled={disabled}
                              value={placement[key]}
                              onChange={e => update({ placements: plan.placements.map((p, i) => i === index ? { ...p, [key]: e.target.value } : p) })}
                              className="w-24 rounded border border-slate-200 p-1 tabular-nums"
                            />
                          </td>
                        ))}
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => update({
                                placements: [
                                  ...plan.placements,
                                  { ...placement, truck_id: trucks.find(truck => truck.id !== placement.truck_id)?.id ?? placement.truck_id, quantity: "0", allocated_cbm: "0" },
                                ],
                              })}
                              className="text-blue-700 hover:underline disabled:opacity-60"
                            >
                              Split
                            </button>
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => update({ placements: plan.placements.filter((_, i) => i !== index) })}
                              className="text-rose-700 hover:underline disabled:opacity-60"
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {(stale || problem) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p>{stale ? "Cargo or trucks changed. Recalculate and review the proposal." : problem}</p>
                {stale && (
                  <button
                    type="button"
                    disabled={disabled || Boolean(problem)}
                    onClick={() => update({ signature })}
                    className="mt-1.5 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                  >
                    Keep current allocations and review
                  </button>
                )}
              </div>
            )}

            {scheduleProblem && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{scheduleProblem}</p>
            )}

            <label className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
              <input
                type="checkbox"
                disabled={disabled || stale || Boolean(problem) || Boolean(scheduleProblem) || checkingSchedule || Boolean(scheduleError) || conflict}
                checked={plan.confirmed && !stale && !problem && !scheduleProblem && !conflict}
                onChange={e => onChange({ ...plan, trucks, confirmed: e.target.checked })}
                className="mt-0.5"
              />
              <span>I reviewed this distribution. Preserve these quantities, trucks and destinations when saving.</span>
            </label>
          </>
        )}
      </fieldset>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
    </section>
  );
}