// src/pages/Admin/views/AddTripForm.tsx
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ChevronLeft,
  Plus,
  Trash2,
  X,
  Package,
  Truck,
  MapPin,
  Store,
  Calendar,
  Hash,
  FileText,
  CheckCircle2,
  Circle,
  Check,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { searchRelationshipOptions, type RelationshipOption } from "../../services/lookup.service";

/* What the backend needs to create a trip */
export type NewTripPayload = {
  trip: {
    dispatch_number: string;
    loading_date: string;
    estimated_delivery_date: string | null;
    status: string;
    trip_type_id: string | null;
    warehouse_id: string;
    truck_id: string;
    driver_id: string | null;
    remarks: string | null;
  };
  stops: Array<{
    stop_sequence: number;
    store_id: string;
    line_items: Array<{
      product_id: string;
      dr_number: string | null;
      quantity: number;
      cbm: number | null;
    }>;
  }>;
};

type Option = RelationshipOption;
type Lookups = Record<"trip-types" | "warehouses" | "trucks" | "drivers" | "stores" | "products", Option[]>;
type ItemDraft = { key: number; productId: string; dr: string; qty: string; cbm: string };
type StopDraft = { key: number; storeId: string; items: ItemDraft[] };

const STATUSES = ["PLANNED", "LOADING", "IN_TRANSIT", "DELIVERED", "CANCELLED"];
const EMPTY_LOOKUPS: Lookups = { "trip-types": [], warehouses: [], trucks: [], drivers: [], stores: [], products: [] };

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-[#2678b9] focus:ring-2 focus:ring-[#2678b9]/10 disabled:bg-slate-50/50";

let uid = 0;
const newItem = (): ItemDraft => ({ key: ++uid, productId: "", dr: "", qty: "", cbm: "" });
const newStop = (): StopDraft => ({ key: ++uid, storeId: "", items: [newItem()] });
const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

const STATUS_STYLES: Record<string, string> = {
  PLANNED: "bg-white text-slate-600 ring-slate-200",
  LOADING: "bg-white text-amber-600 ring-amber-200",
  IN_TRANSIT: "bg-white text-[#2678b9] ring-[#2678b9]/30",
  DELIVERED: "bg-white text-emerald-600 ring-emerald-200",
  CANCELLED: "bg-white text-rose-600 ring-rose-200",
};

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-500">
        {label}
        {required && <span className="text-rose-400">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder: string;
  loading: boolean;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={input} disabled={loading}>
      <option value="">{loading ? "Loading…" : placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.secondary ? `${o.label} · ${o.secondary}` : o.label}
        </option>
      ))}
    </select>
  );
}

/* ---------- Preview helpers ---------- */
function labelOf(options: Option[], id: string): string | null {
  if (!id) return null;
  return options.find((o) => o.id === id)?.label ?? null;
}

function PreviewRow({
  icon: Icon,
  label,
  value,
  empty = "—",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
  empty?: string;
}) {
  const has = value !== null && value !== undefined && value !== "";
  return (
    <div className="flex items-start gap-2.5 py-2.5">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-slate-400 ring-1 ring-slate-100">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className={`truncate text-sm ${has ? "font-medium text-slate-800" : "text-slate-300"}`}>
          {has ? value : empty}
        </p>
      </div>
    </div>
  );
}

function ProgressRing({ value }: { value: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <div className="relative h-11 w-11">
      <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90">
        <circle cx="22" cy="22" r={r} className="fill-none stroke-slate-100" strokeWidth="3" />
        <circle
          cx="22"
          cy="22"
          r={r}
          className="fill-none stroke-[#2678b9] transition-all duration-500"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-slate-600">
        {value}%
      </span>
    </div>
  );
}

const STEPS = [
  { label: "Trip details" },
  { label: "Truck & driver" },
  { label: "Stops & products" },
  { label: "Review" },
];

/* ---------- Horizontal circle stepper (navy) ---------- */
function CircleStepper({
  current,
  onJump,
}: {
  current: number;
  onJump: (index: number) => void;
}) {
  return (
    <div className="relative flex items-start justify-between">
      {/* Base connecting line */}
      <div className="absolute left-0 right-0 top-4 mx-7 h-px bg-slate-200" aria-hidden />
      {/* Progress line */}
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
            <span
              className={`text-center text-[11px] font-medium transition-colors ${
                isActive ? "text-[#0b2341]" : isDone ? "text-slate-600" : "text-slate-400"
              }`}
            >
              {s.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function AddTripForm({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (payload: NewTripPayload) => Promise<void>;
}) {
  const { accessToken } = useAuth();
  const [lookups, setLookups] = useState<Lookups>(EMPTY_LOOKUPS);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [lookupError, setLookupError] = useState("");

  const [dispatchNo, setDispatchNo] = useState("");
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
    void Promise.all(
      names.map(async (name) => [name, await searchRelationshipOptions(accessToken, name, "")] as const),
    )
      .then((entries) => active && setLookups(Object.fromEntries(entries) as Lookups))
      .catch((cause) => active && setLookupError(cause instanceof Error ? cause.message : "Could not load the lists."))
      .finally(() => active && setLoadingLookups(false));
    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const totals = useMemo(() => {
    let qty = 0;
    let cbm = 0;
    for (const stop of stops)
      for (const item of stop.items) {
        qty += Number.isFinite(num(item.qty)) ? num(item.qty) : 0;
        cbm += Number.isFinite(num(item.cbm)) ? num(item.cbm) : 0;
      }
    return { qty, cbm };
  }, [stops]);

  const progress = useMemo(() => {
    const checks: boolean[] = [
      !!dispatchNo.trim(),
      !!loadingDate,
      !!warehouseId,
      !!truckId,
      stops.length > 0 && stops.every((s) => !!s.storeId),
      stops.every((s) => s.items.length > 0 && s.items.every((i) => !!i.productId && num(i.qty) > 0)),
    ];
    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
  }, [dispatchNo, loadingDate, warehouseId, truckId, stops]);

  const preview = useMemo(
    () => ({
      dispatchNo: dispatchNo.trim() || null,
      tripType: labelOf(lookups["trip-types"], tripTypeId),
      status,
      loadingDate: loadingDate || null,
      etaDate: etaDate || null,
      warehouse: labelOf(lookups.warehouses, warehouseId),
      truck: labelOf(lookups.trucks, truckId),
      driver: labelOf(lookups.drivers, driverId),
      remarks: remarks.trim() || null,
      stops: stops.map((s, i) => ({
        index: i + 1,
        store: labelOf(lookups.stores, s.storeId),
        items: s.items.map((it) => ({
          product: labelOf(lookups.products, it.productId),
          dr: it.dr.trim() || null,
          qty: num(it.qty),
          cbm: it.cbm.trim() === "" ? null : num(it.cbm),
        })),
      })),
    }),
    [
      dispatchNo, tripTypeId, status, loadingDate, etaDate,
      warehouseId, truckId, driverId, remarks, stops, lookups,
    ],
  );

  const updateStop = (key: number, patch: Partial<StopDraft>) =>
    setStops((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const updateItem = (stopKey: number, itemKey: number, patch: Partial<ItemDraft>) =>
    setStops((list) =>
      list.map((s) =>
        s.key === stopKey
          ? { ...s, items: s.items.map((i) => (i.key === itemKey ? { ...i, ...patch } : i)) }
          : s,
      ),
    );

  function validate(): string {
    if (!dispatchNo.trim()) return "Enter the dispatch number.";
    if (!loadingDate) return "Choose the loading date.";
    if (etaDate && etaDate < loadingDate) return "Estimated delivery cannot be before the loading date.";
    if (!warehouseId) return "Choose the origin warehouse.";
    if (!truckId) return "Choose a truck.";
    for (const [i, stop] of stops.entries()) {
      if (!stop.storeId) return `Stop ${i + 1}: choose a store.`;
      if (stop.items.length === 0) return `Stop ${i + 1}: add at least one product.`;
      for (const item of stop.items) {
        if (!item.productId) return `Stop ${i + 1}: choose a product for every line.`;
        if (!(num(item.qty) > 0)) return `Stop ${i + 1}: enter a quantity above zero for every line.`;
        if (item.cbm.trim() !== "" && !(num(item.cbm) >= 0)) return `Stop ${i + 1}: CBM must be a valid number.`;
      }
    }
    return "";
  }

  function advanceStep() {
    let problem = "";
    if (step === 0) {
      if (!dispatchNo.trim()) problem = "Enter the dispatch number to continue.";
      else if (!loadingDate) problem = "Choose the loading date to continue.";
      else if (etaDate && etaDate < loadingDate) problem = "Estimated delivery cannot be before the loading date.";
    } else if (step === 1) {
      if (!warehouseId) problem = "Choose the origin warehouse to continue.";
      else if (!truckId) problem = "Choose a truck to continue.";
    }
    setError(problem);
    if (!problem) setStep((current) => Math.min(STEPS.length - 1, current + 1));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step < STEPS.length - 1) {
      advanceStep();
      return;
    }
    const problem = validate();
    if (problem) return setError(problem);
    setError("");
    setSaving(true);
    try {
      await onSubmit({
        trip: {
          dispatch_number: dispatchNo.trim(),
          loading_date: loadingDate,
          estimated_delivery_date: etaDate || null,
          status,
          trip_type_id: tripTypeId || null,
          warehouse_id: warehouseId,
          truck_id: truckId,
          driver_id: driverId || null,
          remarks: remarks.trim() || null,
        },
        stops: stops.map((stop, index) => ({
          stop_sequence: index + 1,
          store_id: stop.storeId,
          line_items: stop.items.map((item) => ({
            product_id: item.productId,
            dr_number: item.dr.trim() || null,
            quantity: num(item.qty),
            cbm: item.cbm.trim() === "" ? null : num(item.cbm),
          })),
        })),
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create the trip.");
    } finally {
      setSaving(false);
    }
  }

  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[2000] flex items-start justify-center overflow-y-auto bg-slate-900/20 p-3 backdrop-blur-[2px] sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-trip-title"
        className="grid w-full max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_340px]"
      >
        {/* ============ LEFT CARD: FORM ============ */}
        <form
          onSubmit={submit}
          className="flex max-h-[92vh] flex-col overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-100"
        >
          {/* Header */}
          <header className="border-b border-slate-100 bg-white px-6 py-5 sm:px-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 id="add-trip-title" className="text-base font-semibold text-slate-800">
                  Add trip
                </h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  Step {step + 1} of {STEPS.length} · {STEPS[step].label}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                aria-label="Close"
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Horizontal circle stepper */}
            <div className="mt-5">
              <CircleStepper
                current={step}
                onJump={(index) => {
                  if (index <= step) {
                    setError("");
                    setStep(index);
                  } else {
                    advanceStep();
                  }
                }}
              />
            </div>
          </header>

          {/* Body */}
          <div className="flex-1 space-y-5 overflow-y-auto bg-white px-6 py-6 sm:px-8">
            {lookupError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2.5 text-xs text-amber-700"
              >
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                <span>{lookupError} Some lists may be empty.</span>
              </div>
            )}

            {step === 0 && (
              <section className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-slate-700">Trip details</h4>
                  <p className="mt-0.5 text-xs text-slate-400">Set the trip number, type, and dates.</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Dispatch number" required>
                    <input
                      value={dispatchNo}
                      onChange={(e) => setDispatchNo(e.target.value)}
                      className={input}
                      placeholder="e.g. DSP-2026-0001"
                    />
                  </Field>
                  <Field label="Trip type">
                    <Select
                      value={tripTypeId}
                      onChange={setTripTypeId}
                      options={lookups["trip-types"]}
                      placeholder="Choose trip type"
                      loading={loadingLookups}
                    />
                  </Field>
                  <Field label="Status">
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className={input}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Loading date" required>
                    <input
                      type="date"
                      value={loadingDate}
                      onChange={(e) => setLoadingDate(e.target.value)}
                      className={input}
                    />
                  </Field>
                  <Field label="Estimated delivery date">
                    <input
                      type="date"
                      min={loadingDate || undefined}
                      value={etaDate}
                      onChange={(e) => setEtaDate(e.target.value)}
                      className={input}
                    />
                  </Field>
                </div>
              </section>
            )}

            {step === 1 && (
              <section className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-slate-700">Truck and driver</h4>
                  <p className="mt-0.5 text-xs text-slate-400">Choose where the trip starts and assign a vehicle.</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Origin warehouse" required>
                    <Select
                      value={warehouseId}
                      onChange={setWarehouseId}
                      options={lookups.warehouses}
                      placeholder="Choose warehouse"
                      loading={loadingLookups}
                    />
                  </Field>
                  <Field label="Truck (plate)" required>
                    <Select
                      value={truckId}
                      onChange={setTruckId}
                      options={lookups.trucks}
                      placeholder="Choose truck"
                      loading={loadingLookups}
                    />
                  </Field>
                  <Field label="Driver">
                    <Select
                      value={driverId}
                      onChange={setDriverId}
                      options={lookups.drivers}
                      placeholder="Assign later"
                      loading={loadingLookups}
                    />
                  </Field>
                  <Field label="Remarks">
                    <input
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      className={input}
                      placeholder="Optional"
                    />
                  </Field>
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="space-y-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-medium text-slate-700">Stops and products</h4>
                    <p className="mt-0.5 text-xs text-slate-400">Add each delivery stop and the items going there.</p>
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
                        <div className="min-w-0 flex-1">
                          <Field label="Store" required>
                            <Select
                              value={stop.storeId}
                              onChange={(v) => updateStop(stop.key, { storeId: v })}
                              options={lookups.stores}
                              placeholder="Choose store"
                              loading={loadingLookups}
                            />
                          </Field>
                        </div>
                        {stops.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setStops((l) => l.filter((s) => s.key !== stop.key))}
                            aria-label={`Remove stop ${si + 1}`}
                            className="mt-5 rounded-lg p-2 text-slate-300 transition hover:bg-rose-50/60 hover:text-rose-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      <div className="space-y-3 p-4">
                        {stop.items.map((item, ii) => (
                          <div
                            key={item.key}
                            className="grid grid-cols-2 items-end gap-2.5 sm:grid-cols-[minmax(0,2fr)_1fr_72px_80px_auto]"
                          >
                            <div className="col-span-2 sm:col-span-1">
                              <Field label="Product" required>
                                <Select
                                  value={item.productId}
                                  onChange={(v) => updateItem(stop.key, item.key, { productId: v })}
                                  options={lookups.products}
                                  placeholder="Choose product"
                                  loading={loadingLookups}
                                />
                              </Field>
                            </div>
                            <Field label="DR no.">
                              <input
                                value={item.dr}
                                onChange={(e) => updateItem(stop.key, item.key, { dr: e.target.value })}
                                className={input}
                                placeholder="—"
                              />
                            </Field>
                            <Field label="Qty" required>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={item.qty}
                                onChange={(e) => updateItem(stop.key, item.key, { qty: e.target.value })}
                                className={input}
                                placeholder="0"
                              />
                            </Field>
                            <Field label="CBM">
                              <input
                                type="number"
                                min="0"
                                step="0.001"
                                value={item.cbm}
                                onChange={(e) => updateItem(stop.key, item.key, { cbm: e.target.value })}
                                className={input}
                                placeholder="0"
                              />
                            </Field>
                            <button
                              type="button"
                              disabled={stop.items.length === 1}
                              onClick={() =>
                                updateStop(stop.key, { items: stop.items.filter((i) => i.key !== item.key) })
                              }
                              aria-label={`Remove product line ${ii + 1}`}
                              className="mb-0.5 justify-self-end rounded-lg p-2 text-slate-300 transition hover:bg-rose-50/60 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => updateStop(stop.key, { items: [...stop.items, newItem()] })}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2678b9] transition hover:text-[#1d5f94]"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add product
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setStops((l) => [...l, newStop()])}
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-500 transition hover:border-[#2678b9]/40 hover:text-[#2678b9]"
                >
                  <Plus className="h-3.5 w-3.5" /> Add another stop
                </button>
              </section>
            )}

            {step === 3 && (
              <section className="space-y-5">
                <div>
                  <h4 className="text-sm font-medium text-slate-700">Review</h4>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Check the details on the right, then create the trip.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-white p-4">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Trip
                    </p>
                    <dl className="space-y-1.5 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-400">Dispatch</dt>
                        <dd className="truncate font-medium text-slate-700">{preview.dispatchNo ?? "—"}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-400">Type</dt>
                        <dd className="truncate font-medium text-slate-700">{preview.tripType ?? "—"}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-400">Loading</dt>
                        <dd className="truncate font-medium text-slate-700">{preview.loadingDate ?? "—"}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-400">Delivery</dt>
                        <dd className="truncate font-medium text-slate-700">{preview.etaDate ?? "—"}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-white p-4">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Transport
                    </p>
                    <dl className="space-y-1.5 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-400">Warehouse</dt>
                        <dd className="truncate font-medium text-slate-700">{preview.warehouse ?? "—"}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-400">Truck</dt>
                        <dd className="truncate font-medium text-slate-700">{preview.truck ?? "—"}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-400">Driver</dt>
                        <dd className="truncate font-medium text-slate-700">{preview.driver ?? "Unassigned"}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-400">Status</dt>
                        <dd className="truncate font-medium text-slate-700">
                          {preview.status.replaceAll("_", " ")}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50/60 p-3 text-[11px]">
                  <p className="font-medium text-slate-600">
                    {progress === 100 ? "Ready to create" : "Almost there"}
                  </p>
                  <p className="mt-0.5 text-slate-400">
                    {progress === 100
                      ? "All required fields are filled."
                      : "Fill in the required fields to complete this trip."}
                  </p>
                </div>
              </section>
            )}
          </div>

          {/* Footer */}
          <footer className="border-t border-slate-100 bg-white px-6 py-3 sm:px-8">
            {error && (
              <p role="alert" className="mb-2 flex items-center gap-2 text-xs text-rose-500">
                <span className="h-1 w-1 rounded-full bg-rose-400" />
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {step === 0 ? (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setStep((current) => Math.max(0, current - 1));
                  }}
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                >
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-[#0b2341] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#1d5f94] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : isLast ? "Create trip" : "Next"}
              </button>
            </div>
          </footer>
        </form>

        {/* ============ RIGHT CARD: LIVE PREVIEW ============ */}
        <aside className="flex max-h-[92vh] flex-col overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-100">
          <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
            <div>
              <h4 className="text-sm font-medium text-slate-700">Trip summary</h4>
              <p className="text-[11px] text-slate-400">Live preview</p>
            </div>
            <ProgressRing value={progress} />
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto bg-white px-5 py-4">
            {/* Trip header */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Dispatch</p>
                  <p className={`truncate text-sm font-medium ${preview.dispatchNo ? "text-slate-800" : "text-slate-300"}`}>
                    {preview.dispatchNo ?? "Not set"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ${STATUS_STYLES[status] ?? "bg-white text-slate-600 ring-slate-200"}`}
                >
                  {status.replaceAll("_", " ")}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  {preview.loadingDate ?? "No loading date"}
                  {preview.etaDate ? ` → ${preview.etaDate}` : ""}
                </span>
              </div>
            </div>

            {/* Details */}
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-400">Details</p>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white px-3">
                <PreviewRow icon={Hash} label="Trip type" value={preview.tripType} empty="Not selected" />
                <PreviewRow icon={Store} label="Warehouse" value={preview.warehouse} empty="Not selected" />
                <PreviewRow icon={Truck} label="Truck" value={preview.truck} empty="Not selected" />
                <PreviewRow icon={FileText} label="Driver" value={preview.driver} empty="Unassigned" />
                {preview.remarks && <PreviewRow icon={FileText} label="Remarks" value={preview.remarks} />}
              </div>
            </div>

            {/* Stops */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  Stops & products
                </p>
                <span className="text-[10px] text-slate-400">
                  {preview.stops.length} · {totals.qty.toLocaleString()} qty ·{" "}
                  {totals.cbm.toLocaleString(undefined, { maximumFractionDigits: 2 })} CBM
                </span>
              </div>
              <div className="space-y-2">
                {preview.stops.map((s) => (
                  <div key={s.index} className="rounded-xl border border-slate-100 bg-white p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-50 text-[10px] font-medium text-slate-500 ring-1 ring-slate-100">
                        {s.index}
                      </span>
                      <p className={`truncate text-sm font-medium ${s.store ? "text-slate-700" : "text-slate-300"}`}>
                        {s.store ?? "Store not selected"}
                      </p>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {s.items.map((it, ii) => {
                        const ok = !!it.product && Number.isFinite(it.qty) && it.qty > 0;
                        return (
                          <div key={ii} className="flex items-center gap-2 rounded-md bg-slate-50/60 px-2 py-1.5">
                            {ok ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                            ) : (
                              <Circle className="h-3.5 w-3.5 shrink-0 text-slate-200" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className={`truncate text-xs ${ok ? "font-medium text-slate-600" : "text-slate-300"}`}>
                                {it.product ?? "Product not selected"}
                              </p>
                              {it.dr && <p className="truncate text-[10px] text-slate-400">DR {it.dr}</p>}
                            </div>
                            <span className={`shrink-0 text-xs font-medium ${ok ? "text-slate-600" : "text-slate-300"}`}>
                              {Number.isFinite(it.qty) ? it.qty.toLocaleString() : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Completion hint */}
            <div className="rounded-xl bg-slate-50/60 p-3 text-[11px]">
              <p className="font-medium text-slate-600">{progress === 100 ? "Ready to create" : "Almost there"}</p>
              <p className="mt-0.5 text-slate-400">
                {progress === 100
                  ? "All required fields are filled."
                  : "Fill in the required fields to complete this trip."}
              </p>
            </div>
          </div>

          <footer className="border-t border-slate-100 bg-white px-5 py-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span className="rounded-full border border-slate-100 px-2 py-0.5">
                {stops.length} stop{stops.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-slate-100 px-2 py-0.5">
                {totals.qty.toLocaleString()} qty
              </span>
              <span className="rounded-full border border-slate-100 px-2 py-0.5">
                {totals.cbm.toLocaleString(undefined, { maximumFractionDigits: 2 })} CBM
              </span>
            </div>
          </footer>
        </aside>
      </div>
    </div>
  );
}