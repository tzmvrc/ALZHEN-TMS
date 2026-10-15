// src/pages/Admin/views/AddTripForm.tsx
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ChevronLeft, ChevronDown, Plus, Trash2, X, Truck,
  Store, Calendar, Hash, FileText, CheckCircle2, Circle, Check,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { searchRelationshipOptions, type RelationshipOption } from "../../services/lookup.service";

export type NewTripPayload = {
  trip: {
    dispatch_number: string;
    loading_date: string;
    estimated_delivery_date: string | null;
    status: string;
    trip_type_id: string | null;
    warehouse_id: string;
    truck_id: string | null;
    driver_id: string | null;
    remarks: string | null;
  };
  stops: Array<{
    stop_sequence: number;
    store_id: string;
    customer_id: string | null;
    remarks: string | null;
    line_items: Array<{
      product_id: string;
      dr_number: string | null;
      sap_so_number: string | null;
      customer_po_number: string | null;
      internal_po_number: string | null;
      remarks: string | null;
      quantity: number;
      cbm: number | null;
    }>;
  }>;
};

type Option = RelationshipOption;
type Lookups = Record<"trip-types" | "warehouses" | "trucks" | "drivers" | "stores" | "products" | "customers", Option[]>;
type ItemDraft = { key: number; productId: string; dr: string; dn: string; sp: string; so: string; sapSo: string; customerPo: string; po: string; category: string; unitCbm: string; itemStatus: string; warehouse: string; qty: string; cbm: string };
type StopDraft = { key: number; storeId: string; customer: string; city: string; province: string; address: string; items: ItemDraft[] };

const STATUSES = ["PLANNED", "LOADING", "IN_TRANSIT", "DELIVERED", "CANCELLED"];
const EMPTY_LOOKUPS: Lookups = { "trip-types": [], warehouses: [], trucks: [], drivers: [], stores: [], products: [], customers: [] };

/* Shared input styling — same height, same radius, same border */
const inputBase =
  "w-full rounded-lg border border-slate-200 bg-white text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-[#2678b9] focus:ring-2 focus:ring-[#2678b9]/10 disabled:bg-slate-50/50";
const input = `${inputBase} px-3.5 py-2.5`;
const selectButton = `${inputBase} flex items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:border-slate-300`;

let uid = 0;
const newItem = (): ItemDraft => ({ key: ++uid, productId: "", dr: "", dn: "", sp: "", so: "", sapSo: "", customerPo: "", po: "", category: "", unitCbm: "", itemStatus: "", warehouse: "", qty: "", cbm: "" });
const newStop = (): StopDraft => ({ key: ++uid, storeId: "", customer: "", city: "", province: "", address: "", items: [newItem()] });
const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

const STATUS_STYLES: Record<string, string> = {
  PLANNED: "bg-white text-slate-600 ring-slate-200",
  LOADING: "bg-white text-amber-600 ring-amber-200",
  IN_TRANSIT: "bg-white text-[#2678b9] ring-[#2678b9]/30",
  DELIVERED: "bg-white text-emerald-600 ring-emerald-200",
  CANCELLED: "bg-white text-rose-600 ring-rose-200",
};

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-500">
        {label}
        {required && <span className="text-rose-400">*</span>}
      </span>
      {children}
    </label>
  );
}

/* Custom dropdown — fixes the chevron hugging the edge */
function Dropdown({
  value, onChange, options, placeholder, loading, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder: string;
  loading: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  const isDisabled = loading || disabled;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest("[data-dropdown-root]")) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" data-dropdown-root>
      <button
        type="button"
        onClick={() => !isDisabled && setOpen((o) => !o)}
        disabled={isDisabled}
        className={`${selectButton} ${isDisabled ? "cursor-not-allowed bg-slate-50/50" : ""}`}
      >
        <span className={`truncate ${selected ? "text-slate-800" : "text-slate-400"}`}>
          {loading ? "Loading…" : selected ? (selected.secondary ? `${selected.label} · ${selected.secondary}` : selected.label) : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-900/5">
          <button
            type="button"
            onClick={() => { onChange(""); setOpen(false); }}
            className={`flex w-full items-center px-3.5 py-2 text-left text-sm transition ${
              !value ? "bg-[#2678b9]/5 text-[#2678b9]" : "text-slate-400 hover:bg-slate-50"
            }`}
          >
            {placeholder}
          </button>
          {options.length === 0 && (
            <p className="px-3.5 py-2 text-xs text-slate-400">No options available</p>
          )}
          {options.map((o) => {
            const active = o.id === value;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false); }}
                className={`flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-sm transition ${
                  active ? "bg-[#2678b9]/5 font-medium text-[#2678b9]" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="truncate">
                  {o.label}
                  {o.secondary && <span className="ml-2 text-xs text-slate-400">{o.secondary}</span>}
                </span>
                {active && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function labelOf(options: Option[], id: string): string | null {
  if (!id) return null;
  return options.find((o) => o.id === id)?.label ?? null;
}

const STEPS = [{ label: "Trip details" }, { label: "Truck & driver" }, { label: "Stops & products" }, { label: "Review" }];

function CircleStepper({ current, onJump }: { current: number; onJump: (i: number) => void }) {
  return (
    <div className="relative flex items-start justify-between">
      <div className="absolute left-0 right-0 top-4 mx-7 h-px bg-slate-200" aria-hidden />
      <div
        className="absolute left-0 top-4 mx-7 h-px bg-[#2678b9] transition-all duration-500"
        style={{ right: `${100 - (current / (STEPS.length - 1)) * 100}%` }}
        aria-hidden
      />
      {STEPS.map((s, index) => {
        const isDone = index < current;
        const isActive = index === current;
        return (
          <button
            key={s.label}
            type="button"
            onClick={() => onJump(index)}
            className="relative z-10 flex flex-1 flex-col items-center gap-2"
            aria-current={isActive ? "step" : undefined}
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-semibold transition-all duration-300 ${
                isDone
                  ? "bg-white text-[#2678b9] ring-2 ring-[#2678b9]"
                  : isActive
                    ? "bg-[#0b2341] text-white ring-2 ring-[#0b2341]"
                    : "bg-white text-slate-400 ring-2 ring-slate-200"
              }`}
            >
              {isDone ? <Check className="h-4 w-4" /> : index + 1}
            </span>
            <span className={`text-center text-[11px] font-medium ${isActive ? "text-[#0b2341]" : isDone ? "text-slate-600" : "text-slate-400"}`}>
              {s.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ProgressRing({ value }: { value: number }) {
  const r = 18, c = 2 * Math.PI * r, offset = c - (value / 100) * c;
  return (
    <div className="relative h-11 w-11">
      <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90">
        <circle cx="22" cy="22" r={r} className="fill-none stroke-slate-100" strokeWidth="3" />
        <circle cx="22" cy="22" r={r} className="fill-none stroke-[#2678b9] transition-all duration-500"
          strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-slate-600">{value}%</span>
    </div>
  );
}

export default function AddTripForm({
  onClose, onSubmit,
}: { onClose: () => void; onSubmit: (payload: NewTripPayload) => Promise<void>; }) {
  const { accessToken } = useAuth();
  const [lookups, setLookups] = useState<Lookups>(EMPTY_LOOKUPS);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [lookupError, setLookupError] = useState("");

  const [dispatchNo, setDispatchNo] = useState("");
  const [requestSubject, setRequestSubject] = useState("");
  const [requestSender, setRequestSender] = useState("");
  const [truckRequirement, setTruckRequirement] = useState("");
  const [loadingDate, setLoadingDate] = useState("");
  const [etaDate, setEtaDate] = useState("");
  const [tripTypeId, setTripTypeId] = useState("");
  const [status, setStatus] = useState("PLANNED");
  const [warehouseId, setWarehouseId] = useState("");
  const [truckId, setTruckId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [remarks, setRemarks] = useState("");
  const [stops, setStops] = useState<StopDraft[]>(() => [newStop()]);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    const names = Object.keys(EMPTY_LOOKUPS) as Array<keyof Lookups>;
    void Promise.all(names.map(async (name) => [name, await searchRelationshipOptions(accessToken, name, "")] as const))
      .then((entries) => active && setLookups(Object.fromEntries(entries) as Lookups))
      .catch((cause) => active && setLookupError(cause instanceof Error ? cause.message : "Could not load the lists."))
      .finally(() => active && setLoadingLookups(false));
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const totals = useMemo(() => {
    let qty = 0, cbm = 0;
    for (const stop of stops) for (const item of stop.items) {
      qty += Number.isFinite(num(item.qty)) ? num(item.qty) : 0;
      cbm += Number.isFinite(num(item.cbm)) ? num(item.cbm) : 0;
    }
    return { qty, cbm };
  }, [stops]);

  const progress = useMemo(() => {
    const checks = [
      !!dispatchNo.trim(), !!loadingDate, !!warehouseId,
      stops.length > 0 && stops.every((s) => !!s.storeId),
      stops.every((s) => s.items.length > 0 && s.items.every((i) => !!i.productId && num(i.qty) > 0)),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [dispatchNo, loadingDate, warehouseId, stops]);

  const updateStop = (key: number, patch: Partial<StopDraft>) =>
    setStops((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const updateItem = (stopKey: number, itemKey: number, patch: Partial<ItemDraft>) =>
    setStops((list) => list.map((s) => s.key === stopKey
      ? { ...s, items: s.items.map((i) => (i.key === itemKey ? { ...i, ...patch } : i)) } : s));

  function validate(): string {
    if (!dispatchNo.trim()) return "Enter the dispatch reference.";
    if (!loadingDate) return "Choose the loading date.";
    if (etaDate && etaDate < loadingDate) return "Estimated delivery cannot be before the loading date.";
    if (!warehouseId) return "Choose the origin warehouse.";
    if (driverId && !truckId) return "Choose a truck before assigning a driver.";
    if (!stops.length) return "Add at least one delivery stop.";
    for (const [i, stop] of stops.entries()) {
      if (!stop.storeId) return `Stop ${i + 1}: choose a store.`;
      if (stop.items.length === 0) return `Stop ${i + 1}: add at least one product.`;
      for (const item of stop.items) {
        if (!item.productId) return `Stop ${i + 1}: choose a product for every line.`;
        if (!Number.isSafeInteger(num(item.qty)) || !(num(item.qty) > 0)) return `Stop ${i + 1}: enter a whole quantity above zero for every line.`;
        if (item.unitCbm.trim() && (!Number.isFinite(num(item.unitCbm)) || num(item.unitCbm) < 0)) return `Stop ${i + 1}: unit CBM must be a non-negative number.`;
        if (item.cbm.trim() !== "" && (!Number.isFinite(num(item.cbm)) || num(item.cbm) < 0)) return `Stop ${i + 1}: CBM must be a valid number.`;
      }
    }
    return "";
  }

  function advanceStep() {
    let problem = "";
    if (step === 0) {
      if (!dispatchNo.trim()) problem = "Enter the dispatch reference to continue.";
      else if (!loadingDate) problem = "Choose the loading date to continue.";
      else if (etaDate && etaDate < loadingDate) problem = "Estimated delivery cannot be before the loading date.";
    } else if (step === 1) {
      if (!warehouseId) problem = "Choose the origin warehouse to continue.";
      else if (driverId && !truckId) problem = "Choose a truck before assigning a driver.";
    } else if (step === 2) {
      problem = validate();
    }
    setError(problem);
    if (!problem) setStep((c) => Math.min(STEPS.length - 1, c + 1));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step < STEPS.length - 1) { advanceStep(); return; }
    const problem = validate();
    if (problem) return setError(problem);
    setError(""); setSaving(true);
    try {
      await onSubmit({
        trip: {
          dispatch_number: dispatchNo.trim(),
          loading_date: loadingDate,
          estimated_delivery_date: etaDate || null,
          status,
          trip_type_id: tripTypeId || null,
          warehouse_id: warehouseId,
          truck_id: truckId || null,
          driver_id: driverId || null,
          remarks: [requestSubject.trim() && `Email subject: ${requestSubject.trim()}`, requestSender.trim() && `Requested by: ${requestSender.trim()}`, truckRequirement.trim() && `Truck requirement: ${truckRequirement.trim()}`, remarks.trim()].filter(Boolean).join(" · ") || null,
        },
        stops: stops.map((stop, index) => ({
          stop_sequence: index + 1,
          store_id: stop.storeId,
          customer_id: lookups.stores.find((option) => option.id === stop.storeId)?.values?.customer_id || null,
          remarks: [stop.customer && `Customer: ${stop.customer}`, stop.province && `Province: ${stop.province}`, stop.city && `City: ${stop.city}`, stop.address && `Ship-to address: ${stop.address}`].filter(Boolean).join(" · ") || null,
          line_items: stop.items.map((item) => ({
            product_id: item.productId,
            dr_number: item.dr.trim() || null,
            sap_so_number: item.sapSo.trim() || null,
            customer_po_number: item.customerPo.trim() || null,
            internal_po_number: item.po.trim() || null,
            remarks: [item.sp && `SP: ${item.sp}`, item.dn && `DN: ${item.dn}`, item.so && `SO: ${item.so}`, item.category && `Category: ${item.category}`, item.unitCbm && `Unit CBM: ${item.unitCbm}`, item.itemStatus && `Item status: ${item.itemStatus}`, item.warehouse && `Source warehouse: ${item.warehouse}`].filter(Boolean).join(" · ") || null,
            quantity: num(item.qty),
            cbm: item.cbm.trim() === "" ? null : num(item.cbm),
          })),
        })),
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create the trip.");
    } finally { setSaving(false); }
  }

  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[2000] flex items-start justify-center overflow-y-auto bg-slate-900/20 p-3 backdrop-blur-[2px] sm:items-center sm:p-6">
      <div className="grid w-full max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* LEFT CARD: FORM */}
        <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="add-trip-title"
          className="flex max-h-[92vh] flex-col overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-100">
          <header className="border-b border-slate-100 bg-white px-6 py-5 sm:px-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 id="add-trip-title" className="text-base font-semibold text-slate-800">Add trip</h3>
                <p className="mt-0.5 text-xs text-slate-400">Step {step + 1} of {STEPS.length} · {STEPS[step].label}</p>
              </div>
              <button type="button" onClick={onClose} disabled={saving} aria-label="Close"
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 disabled:opacity-50">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5">
              <CircleStepper current={step} onJump={(index) => {
                if (index <= step) { setError(""); setStep(index); } else { advanceStep(); }
              }} />
            </div>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto bg-white px-6 py-6 sm:px-8">
            {lookupError && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2.5 text-xs text-amber-700">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                <span>{lookupError} Some lists may be empty.</span>
              </div>
            )}

            {step === 0 && (
              <section className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-slate-700">Trip details</h4>
                  <p className="mt-0.5 text-xs text-slate-400">From the dispatch email — dispatch reference, requested schedule, and email details.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <p className="text-xs text-slate-400 sm:col-span-2">Use one trip per dispatch reference. If the email has no PHTRUCK number, enter an internal dispatch reference. SP and order references belong to each product line.</p>
                  <Field label="PHTRUCK / Dispatch reference" required>
                    <input value={dispatchNo} onChange={(e) => setDispatchNo(e.target.value)} className={input}
                      placeholder="PHTRUCK number or your dispatch reference" />
                  </Field>
                  <Field label="Email subject"><input value={requestSubject} onChange={(e) => setRequestSubject(e.target.value)} className={input} placeholder="e.g. ALZHEN PICK UP @CEBU SQ - ILOILO" /></Field>
                  <Field label="Requested by / Sender"><input value={requestSender} onChange={(e) => setRequestSender(e.target.value)} className={input} placeholder="Sender name or email" /></Field>
                  <Field label="Truck requirement"><input value={truckRequirement} onChange={(e) => setTruckRequirement(e.target.value)} className={input} placeholder="e.g. 1-10W, 6-10W, combined PH01 / PH6G" /></Field>
                  <Field label="Trip type">
                    <Dropdown value={tripTypeId} onChange={setTripTypeId} options={lookups["trip-types"]}
                      placeholder="Choose trip type" loading={loadingLookups} />
                  </Field>
                  <Field label="Status">
                    <Dropdown value={status} onChange={setStatus}
                      options={STATUSES.map((s) => ({ id: s, label: s.replaceAll("_", " ") }))}
                      placeholder="Choose status" loading={false} />
                  </Field>
                  <Field label="Loading date" required>
                    <input type="date" value={loadingDate} onChange={(e) => setLoadingDate(e.target.value)} className={input} />
                  </Field>
                  <Field label="Estimated delivery date">
                    <input type="date" min={loadingDate || undefined} value={etaDate}
                      onChange={(e) => setEtaDate(e.target.value)} className={input} />
                  </Field>
                </div>
              </section>
            )}

            {step === 1 && (
              <section className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-slate-700">Truck and driver</h4>
                  <p className="mt-0.5 text-xs text-slate-400">Warehouse (Dvo SQ, Cebu SQ, SQ CDO…) and vehicle.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Origin warehouse" required>
                    <Dropdown value={warehouseId} onChange={setWarehouseId} options={lookups.warehouses}
                      placeholder="Choose warehouse" loading={loadingLookups} />
                  </Field>
                  <Field label="Truck (plate) - optional while planning">
                    <Dropdown value={truckId} onChange={setTruckId} options={lookups.trucks}
                      placeholder="Assign later" loading={loadingLookups} />
                  </Field>
                  <Field label="Driver">
                    <Dropdown value={driverId} onChange={setDriverId} options={lookups.drivers}
                      placeholder="Assign later" loading={loadingLookups} />
                  </Field>
                  <Field label="Remarks">
                    <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className={input}
                      placeholder="e.g. C/O ALZHEN, sender name" />
                  </Field>
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="space-y-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-medium text-slate-700">Stops and products</h4>
                    <p className="mt-0.5 text-xs text-slate-400">Group by actual delivery address. Keep separate lines for each SP, DR, and model; copy Total CBM from the email.</p>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {stops.length} stop{stops.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="space-y-3">
                  {stops.map((stop, si) => (
                    <div key={stop.key} className="rounded-xl border border-slate-100 bg-white">
                      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-50 text-[11px] font-medium text-slate-500 ring-1 ring-slate-100">
                          {si + 1}
                        </span>
                        <div className="min-w-0 flex-1 grid gap-3 sm:grid-cols-2">
                          <Field label="Ship To / Store" required>
                            <Dropdown value={stop.storeId} onChange={(v) => {
                              const location = lookups.stores.find((option) => option.id === v)?.values;
                              const customer = lookups.customers.find((option) => option.id === location?.customer_id);
                              updateStop(stop.key, {
                                storeId: v,
                                customer: customer?.values?.customer_name ?? "",
                                city: location?.city ?? "",
                                province: location?.province ?? "",
                                address: location?.address ?? "",
                              });
                            }}
                              options={lookups.stores} placeholder="Choose store" loading={loadingLookups} />
                          </Field>
                          <Field label="Customer">
                            <input value={stop.customer} onChange={(e) => updateStop(stop.key, { customer: e.target.value })}
                              className={input} placeholder="e.g. DES MARKETING, INC." />
                          </Field>
                          {([['Province', 'province'], ['City', 'city'], ['Ship-to address / End user', 'address']] as const).map(([label, field]) => (
                            <Field key={field} label={label}>
                              <input value={stop[field]} onChange={(e) => updateStop(stop.key, { [field]: e.target.value })} className={input} />
                            </Field>
                          ))}
                        </div>
                        {stops.length > 1 && (
                          <button type="button" onClick={() => setStops((l) => l.filter((s) => s.key !== stop.key))}
                            aria-label={`Remove stop ${si + 1}`}
                            className="mt-5 rounded-lg p-2 text-slate-300 transition hover:bg-rose-50/60 hover:text-rose-500">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      <div className="space-y-3 p-4">
                        {stop.items.map((item, ii) => (
                          <div key={item.key} className="grid grid-cols-2 items-end gap-2.5 sm:grid-cols-3 rounded-lg border border-slate-100 p-3">
                            <div className="col-span-2 sm:col-span-1">
                              <Field label="Product (Model)" required>
                                <Dropdown value={item.productId} onChange={(v) => updateItem(stop.key, item.key, { productId: v, category: lookups.products.find((option) => option.id === v)?.values?.product_category ?? "" })}
                                  options={lookups.products} placeholder="Choose product" loading={loadingLookups} />
                              </Field>
                            </div>
                            <Field label="DR no.">
                              <input value={item.dr} onChange={(e) => updateItem(stop.key, item.key, { dr: e.target.value })}
                                className={input} placeholder="8910914441" />
                            </Field>
                            <Field label="DN no.">
                              <input value={item.dn} onChange={(e) => updateItem(stop.key, item.key, { dn: e.target.value })}
                                className={input} placeholder="DNPH6091000796" />
                            </Field>
                            <Field label="Qty" required>
                              <input type="number" min="0" step="1" value={item.qty}
                                onChange={(e) => updateItem(stop.key, item.key, { qty: e.target.value })}
                                className={input} placeholder="0" />
                            </Field>
                            <Field label="Total CBM (line)">
                              <input type="number" min="0" step="any" value={item.cbm}
                                onChange={(e) => updateItem(stop.key, item.key, { cbm: e.target.value })}
                                className={input} placeholder="0" />
                            </Field>
                            <button type="button"
                              disabled={!Number.isFinite(num(item.unitCbm)) || num(item.unitCbm) < 0 || !(num(item.qty) > 0)}
                              onClick={() => updateItem(stop.key, item.key, { cbm: String(Number((num(item.unitCbm) * num(item.qty)).toFixed(8))) })}
                              className="text-xs text-[#2678b9] disabled:text-slate-300">
                              Calculate total from unit CBM
                            </button>
                            {([['SP number', 'sp'], ['SO no.', 'so'], ['SAP SO no.', 'sapSo'], ['Customer PO', 'customerPo'], ['PO no.', 'po'], ['Product category', 'category'], ['Unit CBM', 'unitCbm'], ['Item status / Instructions', 'itemStatus'], ['Source warehouse (if different)', 'warehouse']] as const).map(([label, field]) => <Field key={field} label={label}><input value={item[field]} onChange={(e) => updateItem(stop.key, item.key, { [field]: e.target.value })} className={input} /></Field>)}
                            <button type="button" disabled={stop.items.length === 1}
                              onClick={() => updateStop(stop.key, { items: stop.items.filter((i) => i.key !== item.key) })}
                              aria-label={`Remove product line ${ii + 1}`}
                              className="mb-0.5 justify-self-end rounded-lg p-2 text-slate-300 transition hover:bg-rose-50/60 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-30">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}

                        <button type="button" onClick={() => updateStop(stop.key, { items: [...stop.items, newItem()] })}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2678b9] transition hover:text-[#1d5f94]">
                          <Plus className="h-3.5 w-3.5" /> Add product line
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button type="button" onClick={() => setStops((l) => [...l, newStop()])}
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-500 transition hover:border-[#2678b9]/40 hover:text-[#2678b9]">
                  <Plus className="h-3.5 w-3.5" /> Add another stop
                </button>
              </section>
            )}

            {step === 3 && (
              <section className="space-y-5">
                <div>
                  <h4 className="text-sm font-medium text-slate-700">Review</h4>
                  <p className="mt-0.5 text-xs text-slate-400">Confirm everything before creating the trip.</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-white p-4">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Trip</p>
                    <dl className="space-y-1.5 text-sm">
                      {[
                        ["PHTRUCK", dispatchNo || "—"],
                        ["Email", requestSubject || "Not provided"],
                        ["Requested by", requestSender || "Not provided"],
                        ["Truck requirement", truckRequirement || "Not provided"],
                        ["Loading", loadingDate || "—"],
                        ["Delivery", etaDate || "—"],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3">
                          <dt className="text-slate-400">{k}</dt>
                          <dd className="truncate font-medium text-slate-700">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-white p-4">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Transport</p>
                    <dl className="space-y-1.5 text-sm">
                      {[
                        ["Warehouse", labelOf(lookups.warehouses, warehouseId) ?? "—"],
                        ["Truck", labelOf(lookups.trucks, truckId) ?? "—"],
                        ["Driver", labelOf(lookups.drivers, driverId) ?? "Unassigned"],
                        ["Status", status.replaceAll("_", " ")],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-3">
                          <dt className="text-slate-400">{k}</dt>
                          <dd className="truncate font-medium text-slate-700">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>

                <div className="space-y-3">{stops.map((stop, index) => <div key={stop.key} className="rounded-xl border border-slate-100 p-4"><p className="text-sm font-medium text-slate-700">{index + 1}. {labelOf(lookups.stores, stop.storeId)}</p><p className="mt-1 text-xs text-slate-500">{[stop.customer, stop.address, stop.city, stop.province].filter(Boolean).join(", ")}</p>{stop.items.map((item) => <div key={item.key} className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-600"><p>{labelOf(lookups.products, item.productId)} - {item.qty} qty - {item.cbm || "0"} total CBM</p><p className="mt-1 break-words text-slate-400">{[item.sp && `SP: ${item.sp}`, item.dr && `DR: ${item.dr}`, item.dn && `DN: ${item.dn}`, item.so && `SO: ${item.so}`, item.sapSo && `SAP SO: ${item.sapSo}`, item.customerPo && `Customer PO: ${item.customerPo}`, item.po && `PO: ${item.po}`, item.category, item.itemStatus, item.warehouse].filter(Boolean).join(" / ")}</p></div>)}</div>)}</div>
                <div className="rounded-xl bg-slate-50/60 p-3 text-[11px]">
                  <p className="font-medium text-slate-600">{progress === 100 ? "Ready to create" : "Almost there"}</p>
                  <p className="mt-0.5 text-slate-400">
                    {progress === 100 ? "All required fields are filled." : "Fill in the required fields to complete this trip."}
                  </p>
                </div>
              </section>
            )}
          </div>

          <footer className="border-t border-slate-100 bg-white px-6 py-3 sm:px-8">
            {error && (
              <p role="alert" className="mb-2 flex items-center gap-2 text-xs text-rose-500">
                <span className="h-1 w-1 rounded-full bg-rose-400" />{error}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {step === 0 ? (
                <button type="button" onClick={onClose} disabled={saving}
                  className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
                  Cancel
                </button>
              ) : (
                <button type="button" onClick={() => { setError(""); setStep((c) => Math.max(0, c - 1)); }} disabled={saving}
                  className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
              )}
              <button type="submit" disabled={saving}
                className="rounded-full bg-[#0b2341] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#1d5f94] disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? "Saving…" : isLast ? "Create trip" : "Next"}
              </button>
            </div>
          </footer>
        </form>

        {/* RIGHT CARD: LIVE PREVIEW */}
        <aside className="flex max-h-[92vh] flex-col overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-100">
          <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
            <div>
              <h4 className="text-sm font-medium text-slate-700">Trip summary</h4>
              <p className="text-[11px] text-slate-400">Live preview</p>
            </div>
            <ProgressRing value={progress} />
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto bg-white px-5 py-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Dispatch reference</p>
                  <p className={`truncate text-sm font-medium ${dispatchNo ? "text-slate-800" : "text-slate-300"}`}>
                    {dispatchNo || "Not set"}
                  </p>
                  {requestSubject && <p className="mt-0.5 truncate text-[11px] text-slate-400">{requestSubject}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ${STATUS_STYLES[status] ?? "bg-white text-slate-600 ring-slate-200"}`}>
                  {status.replaceAll("_", " ")}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
                <Calendar className="h-3.5 w-3.5" />
                <span>{loadingDate || "No loading date"}{etaDate ? ` → ${etaDate}` : ""}</span>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-400">Details</p>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white px-3">
                {[
                  { icon: Store, label: "Warehouse", value: labelOf(lookups.warehouses, warehouseId), empty: "Not selected" },
                  { icon: Truck, label: "Truck", value: labelOf(lookups.trucks, truckId), empty: "Not selected" },
                  { icon: FileText, label: "Driver", value: labelOf(lookups.drivers, driverId), empty: "Unassigned" },
                  { icon: Hash, label: "Trip type", value: labelOf(lookups["trip-types"], tripTypeId), empty: "Not selected" },
                ].map(({ icon: Icon, label, value, empty }) => (
                  <div key={label} className="flex items-start gap-2.5 py-2.5">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-slate-400 ring-1 ring-slate-100">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
                      <p className={`truncate text-sm ${value ? "font-medium text-slate-800" : "text-slate-300"}`}>
                        {value ?? empty}
                      </p>
                    </div>
                  </div>
                ))}
                {remarks && (
                  <div className="flex items-start gap-2.5 py-2.5">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-slate-400 ring-1 ring-slate-100">
                      <FileText className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Remarks</p>
                      <p className="truncate text-sm font-medium text-slate-800">{remarks}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Stops & products</p>
                <span className="text-[10px] text-slate-400">
                  {stops.length} · {totals.qty.toLocaleString()} qty · {totals.cbm.toLocaleString(undefined, { maximumFractionDigits: 2 })} CBM
                </span>
              </div>
              <div className="space-y-2">
                {stops.map((s, si) => (
                  <div key={s.key} className="rounded-xl border border-slate-100 bg-white p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-50 text-[10px] font-medium text-slate-500 ring-1 ring-slate-100">
                        {si + 1}
                      </span>
                      <p className={`truncate text-sm font-medium ${s.storeId ? "text-slate-700" : "text-slate-300"}`}>
                        {labelOf(lookups.stores, s.storeId) ?? "Store not selected"}
                      </p>
                    </div>
                    {s.customer && <p className="ml-7 mt-0.5 truncate text-[10px] text-slate-400">{s.customer}</p>}
                    <div className="mt-2 space-y-1.5">
                      {s.items.map((it) => {
                        const ok = !!it.productId && Number.isFinite(num(it.qty)) && num(it.qty) > 0;
                        const productLabel = labelOf(lookups.products, it.productId);
                        return (
                          <div key={it.key} className="flex items-center gap-2 rounded-md bg-slate-50/60 px-2 py-1.5">
                            {ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                : <Circle className="h-3.5 w-3.5 shrink-0 text-slate-200" />}
                            <div className="min-w-0 flex-1">
                              <p className={`truncate text-xs ${ok ? "font-medium text-slate-600" : "text-slate-300"}`}>
                                {productLabel ?? "Product not selected"}
                              </p>
                              {(it.dr || it.dn) && (
                                <p className="truncate text-[10px] text-slate-400">
                                  {it.sp && `SP ${it.sp} · `}{it.dr && `DR ${it.dr}`}{it.dr && it.dn && " · "}{it.dn && `DN ${it.dn}`}
                                </p>
                              )}
                            </div>
                            <span className={`shrink-0 text-xs font-medium ${ok ? "text-slate-600" : "text-slate-300"}`}>
                              {Number.isFinite(num(it.qty)) ? num(it.qty).toLocaleString() : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50/60 p-3 text-[11px]">
              <p className="font-medium text-slate-600">{progress === 100 ? "Ready to create" : "Almost there"}</p>
              <p className="mt-0.5 text-slate-400">
                {progress === 100 ? "All required fields are filled." : "Fill in the required fields to complete this trip."}
              </p>
            </div>
          </div>

          <footer className="border-t border-slate-100 bg-white px-5 py-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span className="rounded-full border border-slate-100 px-2 py-0.5">{stops.length} stop{stops.length === 1 ? "" : "s"}</span>
              <span className="rounded-full border border-slate-100 px-2 py-0.5">{totals.qty.toLocaleString()} qty</span>
              <span className="rounded-full border border-slate-100 px-2 py-0.5">{totals.cbm.toLocaleString(undefined, { maximumFractionDigits: 2 })} CBM</span>
            </div>
          </footer>
        </aside>
      </div>
    </div>
  );
}
