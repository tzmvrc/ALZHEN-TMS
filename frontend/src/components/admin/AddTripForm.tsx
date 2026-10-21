import TripCargoPlanner from "./TripCargoPlanner";
import { cargoSignature, calculatedCbm, emptyCargoPlan, validateCargo, type CargoLine, type CargoTruck } from "../../services/cargo-planning";
// src/pages/Admin/views/AddTripForm.tsx
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ChevronLeft, ChevronRight, ChevronDown, Plus, Trash2, X, Check, RefreshCw, Search,
  MapPin, Pencil, SlidersHorizontal, Package, Upload, Loader2, Truck
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import { fetchTruckAvailability, fetchDriverAvailability, type DriverAvailability, type TruckAvailability, searchRelationshipOptions, getNextTripReferences, searchDispatches, type DispatchOption, type RelationshipOption } from "../../services/lookup.service";
import { tripCapacity } from "./tripCsv";
import TripTablePreview, { type TripPreviewRow } from "./TripTablePreview";
import TripFormNotice from "./TripFormNotice";
import BulkTripImport from "./BulkTripImport";

export type NewTripPayload = {
  request_id: string;
  dispatch_mode: "new" | "existing";
  cargo_plan?: ReturnType<typeof emptyCargoPlan>;
  trip: {
    dispatch_number: string | null;
    trip_number: number;
    loading_date: string | null;
    estimated_delivery_date: string | null;
    status: string;
    trip_type_id: string | null;
    trip_type_name: string | null;
    warehouse_id: string | null;
    new_warehouse_code?: string | null;
    truck_id: string | null;
    driver_id: string | null;
    remarks: string | null;
  };
  assignments: Array<{
    truck_id: string;
    driver_id: string | null;
    assignment_type: "PRIMARY" | "ADDITIONAL";
  }>;
  stops: Array<{
    stop_sequence: number;
    destination?: Record<string, string>;
    store_id: string | null;
    customer_id: string | null;
    remarks: string | null;
    line_items: Array<{
      product_id: string | null;
      new_product_code: string | null;
      new_product_category: string | null;
      dr_number: string | null;
      sap_so_number: string | null;
      customer_po_number: string | null;
      internal_po_number: string | null;
      remarks: string | null;
      quantity: string | null;
      [sourceField: string]: unknown;
      cbm: string | null;
    }>;
  }>;
};

type Option = RelationshipOption & { disabled?: boolean };
type Lookups = Record<"trip-types" | "warehouses" | "trucks" | "drivers" | "stores" | "products" | "customers", Option[]>;
type ItemDraft = {
  key: number; productId: string; newCode: string; addingProduct: boolean; open: boolean;
  dr: string; dn: string; sp: string; so: string; sapSo: string; customerPo: string; po: string;
  sourceModel: string; phTruck: string; orderItem: string; stocks: string; approvalDate: string;
  category: string; unitCbm: string; itemStatus: string; warehouse: string; qty: string; cbm: string; importNotes: string;
};
type StopDraft = {
  key: number; storeId: string; pendingDestination?: string; customerId?: string; customer: string; city: string; province: string; address: string;
  editLocation: boolean; collapsed: boolean; items: ItemDraft[]; importNotes: string;
};
type TruckAssignmentDraft = { key: number; truckId: string; driverId: string; availabilityConfirmed?: boolean };

const STATUSES = ["PLANNED", "LOADING", "IN_TRANSIT", "DELIVERED", "CANCELLED"];
const EMPTY_LOOKUPS: Lookups = { "trip-types": [], warehouses: [], trucks: [], drivers: [], stores: [], products: [], customers: [] };
const STEPS = ["Trip details", "Stores & products", "Assignments & Cargo"] as const;

const inputBase =
  "min-w-0 w-full rounded-xl border border-slate-200 bg-white text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2678b9] focus:ring-2 focus:ring-[#2678b9]/15 disabled:bg-slate-50 disabled:text-slate-500";
const input = `${inputBase} h-10 px-3`;
const inputSm = `${inputBase} h-9 px-2.5`;

let uid = 0;
const newItem = (): ItemDraft => ({
  key: ++uid, productId: "", newCode: "", addingProduct: false, open: false,
  dr: "", dn: "", sp: "", so: "", sapSo: "", customerPo: "", po: "",
  sourceModel: "", phTruck: "", orderItem: "", stocks: "", approvalDate: "",
  category: "", unitCbm: "", itemStatus: "", warehouse: "", qty: "", cbm: "", importNotes: "",
});
const newStop = (): StopDraft => ({
  key: ++uid, storeId: "", customer: "", city: "", province: "", address: "",
  editLocation: false, collapsed: false, items: [newItem()], importNotes: "",
});
const newTruckAssignment = (): TruckAssignmentDraft => ({ key: ++uid, truckId: "", driverId: "" });

const pad = (n: number) => String(n).padStart(2, "0");
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dispatchPrefix = (iso: string) => `DISPATCH${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}`;
const productCode = (o: Option) => o.values?.model_code || o.values?.sku || o.label;
const num = (v: string) => (v.trim() === "" ? NaN : Number(v));
const fmt = (n: number, digits = 2) => n.toLocaleString(undefined, { maximumFractionDigits: digits });
const sentence = (s: string) => s.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

function labelOf(options: Option[], id: string): string | null {
  if (!id) return null;
  return options.find((o) => o.id === id)?.label ?? null;
}

function lineQty(i: ItemDraft) { const n = num(i.qty); return Number.isFinite(n) ? n : 0; }
function lineCbm(i: ItemDraft) { const n = num(i.cbm); return Number.isFinite(n) ? n : 0; }
const hasItemData = (item: ItemDraft) => [item.sourceModel, item.phTruck, item.orderItem, item.stocks, item.approvalDate, item.productId, item.newCode, item.dr, item.dn, item.sp, item.so, item.sapSo, item.customerPo, item.po, item.category, item.unitCbm, item.itemStatus, item.warehouse, item.qty, item.cbm, item.importNotes].some(value => value.trim());
const hasStopData = (stop: StopDraft) => [stop.storeId, stop.pendingDestination ?? "", stop.customer, stop.city, stop.province, stop.address, stop.importNotes].some(value => value.trim()) || stop.items.some(hasItemData);
function stopTotals(s: StopDraft) {
  return s.items.reduce((t, i) => ({ qty: t.qty + lineQty(i), cbm: t.cbm + lineCbm(i) }), { qty: 0, cbm: 0 });
}

/* ───────────────────────── small building blocks ───────────────────────── */

function Field({ label, required, hint, children, className = "" }: {
  label: string; required?: boolean; hint?: string; children: ReactNode; className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 block text-xs font-medium text-slate-600">
        {label}{required && <span className="ml-0.5 text-rose-500">*</span>}
        {hint && <span className="ml-1.5 font-normal text-slate-400">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Dropdown({
  value, onChange, options, placeholder, loading, disabled, onAddNew, addNewLabel, compact, openRequested = false,
}: {
  value: string; onChange: (v: string) => void; options: Option[]; placeholder: string;
  loading?: boolean; disabled?: boolean; onAddNew?: () => void; addNewLabel?: string; compact?: boolean; openRequested?: boolean;
}) {
  const [open, setOpen] = useState(openRequested);
  const [previousRequest, setPreviousRequest] = useState(openRequested);
  if (previousRequest !== openRequested) {
    setPreviousRequest(openRequested);
    if (openRequested) setOpen(true);
  }
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.id === value);
  const q = query.trim().toLowerCase();
  const visible = q ? options.filter((o) => `${o.label} ${o.secondary ?? ""}`.toLowerCase().includes(q)) : options;
  const isDisabled = loading || disabled;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest("[data-dropdown-root]")) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey, true); };
  }, [open]);

  return (
    <div className="relative" data-dropdown-root>
      <button
        type="button" disabled={isDisabled} onClick={() => { setQuery(""); setOpen((o) => !o); }}
        className={`${compact ? inputSm : input} flex items-center justify-between gap-2 text-left hover:border-slate-300 ${isDisabled ? "cursor-not-allowed" : ""}`}
      >
        <span className={`truncate ${selected ? "text-slate-800" : "text-slate-400"}`}>
          {loading ? "Loading…" : selected ? selected.label : placeholder}
          {!loading && selected?.secondary && <span className="ml-2 text-xs text-slate-400">{selected.secondary}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 max-h-72 w-full min-w-[14rem] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/5">
          <div className="sticky top-0 border-b border-slate-100 bg-white p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); const first = visible.find(option => !option.disabled); if (first) { onChange(first.id); setOpen(false); } } else if (event.key === "ArrowDown") { event.preventDefault(); (event.currentTarget.closest("[data-dropdown-root]")?.querySelector("[data-dropdown-option]:not(:disabled)") as HTMLButtonElement | null)?.focus(); } }} placeholder="Search"
                className="h-8 w-full rounded-md border border-slate-200 pl-8 pr-2 text-xs outline-none focus:border-[#2678b9]" />
            </div>
          </div>
          <div className="py-1">
            {value && (
              <button type="button" onClick={() => { onChange(""); setOpen(false); }}
                className="flex w-full px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-50">Clear selection</button>
            )}
            {visible.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-400">{options.length === 0 ? "Nothing to choose from yet" : "No matches"}</p>
            )}
            {visible.map((o) => {
              const active = o.id === value;
              return (
                <button key={o.id} data-dropdown-option disabled={o.disabled} type="button" onClick={() => { onChange(o.id); setOpen(false); }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40 ${active ? "bg-[#2678b9]/10 font-medium text-[#1d5f94]" : "text-slate-700 hover:bg-slate-50"}`}>
                  <span className="min-w-0 truncate">
                    {o.label}
                    {o.secondary && <span className="ml-2 text-xs font-normal text-slate-400">{o.secondary}</span>}
                  </span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
          {onAddNew && (
            <button type="button" onClick={() => { setOpen(false); onAddNew(); }}
              className="sticky bottom-0 flex w-full items-center gap-1.5 border-t border-slate-100 bg-white px-3 py-2.5 text-left text-sm font-medium text-[#2678b9] hover:bg-slate-50">
              <Plus className="h-3.5 w-3.5" />
              {q && visible.length === 0 ? `${addNewLabel ?? "Add"} “${query.trim()}”` : (addNewLabel ?? "Add new")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Tabs({ current, onJump, disabled }: { current: number; onJump: (i: number) => void; disabled?: boolean }) {
  return (
    <nav className="flex min-w-0 gap-2 overflow-x-auto pb-3 pt-2 sm:gap-4" aria-label="Steps">
      {STEPS.map((label, i) => {
        const active = i === current, done = i < current;
        return (
          <button key={label} type="button" disabled={disabled} onClick={() => onJump(i)} aria-current={active ? "step" : undefined}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm transition disabled:opacity-50 ${active ? "bg-[#0b2341] font-semibold text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${active ? "bg-white/20 text-white" : done ? "bg-[#2678b9] text-white" : "bg-white text-slate-400"}`}>
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}

function Section({ title, description, children, className = "" }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4">
        <h4 className="text-sm font-semibold text-[#0b2341]">{title}</h4>
        {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/* ───────────────────────────── main component ───────────────────────────── */

export default function AddTripForm({
  onClose, onSubmit, onImported,
}: { onClose: () => void; onSubmit: (payload: NewTripPayload) => Promise<void>; onImported?: () => void }) {
  const { accessToken } = useAuth();
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [lookups, setLookups] = useState<Lookups>(EMPTY_LOOKUPS);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [lookupError, setLookupError] = useState("");

  const [dispatchNo, setDispatchNo] = useState("");
  const [tripReference, setTripReference] = useState("");
  const [tripReferenceStatus, setTripReferenceStatus] = useState<"ready" | "setup_required" | "unavailable">("ready");
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchError, setDispatchError] = useState("");
  const [dispatchRetry, setDispatchRetry] = useState(0);
  const [dispatchMode, setDispatchMode] = useState<"new" | "existing">("new");
  const [dispatchOptions, setDispatchOptions] = useState<DispatchOption[]>([]);
  const [dispatchesLoading, setDispatchesLoading] = useState(false);
  const [existingNo, setExistingNo] = useState("");

  const [tripTypeId, setTripTypeId] = useState("");
  const [newTripType, setNewTripType] = useState("");
  const [addingTripType, setAddingTripType] = useState(false);
  const [loadingDate, setLoadingDate] = useState("");
  const [etaDate, setEtaDate] = useState("");
  const [status, setStatus] = useState("PLANNED");
  const [warehouseId, setWarehouseId] = useState("");
  const [creationRequestId] = useState(() => crypto.randomUUID());
  const [cargoPlan, setCargoPlan] = useState(emptyCargoPlan);
  const [truckAssignments, setTruckAssignments] = useState<TruckAssignmentDraft[]>(() => [newTruckAssignment()]);
  const [truckPickerKey, setTruckPickerKey] = useState<number | null>(null);
  const availabilitySchedule = useRef({ loadingDate, etaDate });
  const [availability, setAvailability] = useState<TruckAvailability[]>([]);
  const [driverAvailability, setDriverAvailability] = useState<DriverAvailability[]>([]);
  const [driverScheduleError, setDriverScheduleError] = useState("");
  const [driverScheduleLoading, setDriverScheduleLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState("");
  const [availabilityRetry, setAvailabilityRetry] = useState(0);
  const [remarks, setRemarks] = useState("");
  const [stops, setStops] = useState<StopDraft[]>(() => [newStop()]);

  const [step, setStep] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [stopsView, setStopsView] = useState<"edit" | "preview">("edit");

  /* lookups */
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    const names = Object.keys(EMPTY_LOOKUPS) as Array<keyof Lookups>;
    void Promise.all(names.map(async (name) => [name, await searchRelationshipOptions(accessToken, name, "")] as const))
      .then((entries) => {
        if (active) setLookups(current => {
          const loaded = Object.fromEntries(entries) as Lookups;
          const trucks = new Map(loaded.trucks.map(truck => [truck.id, truck]));
          for (const truck of current.trucks) { const matched = trucks.get(truck.id); trucks.set(truck.id, { ...matched, ...truck, values: { ...matched?.values, ...truck.values } }); }
          return { ...loaded, trucks: [...trucks.values()] };
        });
      })
      .catch((cause) => active && setLookupError(cause instanceof Error ? cause.message : "Could not load the lists."))
      .finally(() => active && setLoadingLookups(false));
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return; let live = true;
    queueMicrotask(() => {
      if (!live) return;
      setAvailabilityLoading(true); setAvailabilityError("");
      if (availabilitySchedule.current.loadingDate !== loadingDate || availabilitySchedule.current.etaDate !== etaDate) {
        setTruckAssignments(current => current.map(assignment => ({ ...assignment, availabilityConfirmed: false })));
        availabilitySchedule.current = { loadingDate, etaDate };
      }
    });
    const timer = setTimeout(() => {
      void fetchTruckAvailability(accessToken, loadingDate, etaDate).then(rows => {
        if (live) {
          setAvailability(rows); setLookups(current => ({
            ...current, trucks: rows.map(truck => {
              const existing = current.trucks.find(option => option.id === truck.id);
              return { ...existing, id: truck.id, label: truck.plate_number, secondary: existing?.secondary ?? truck.truck_type ?? undefined, values: { ...existing?.values, plate_number: truck.plate_number, truck_type: truck.truck_type ?? "", capacity_cbm: truck.capacity_cbm == null ? "" : String(truck.capacity_cbm) } };
            })
          }));
        }
      }).catch(() => { if (live) { setAvailability([]); setAvailabilityError("Unable to check truck schedules. Retry before selecting a truck."); } }).finally(() => { if (live) setAvailabilityLoading(false); });
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [accessToken, loadingDate, etaDate, availabilityRetry]);

  useEffect(() => {
    if (!accessToken) return; let current = true;
    queueMicrotask(() => { if (current) { setDriverScheduleLoading(true); setDriverScheduleError(""); } });
    const timer = setTimeout(() => {
      void fetchDriverAvailability(accessToken, loadingDate, etaDate).then(rows => { if (current) setDriverAvailability(rows); }).catch(cause => { if (current) setDriverScheduleError(cause instanceof Error ? cause.message : "Unable to check driver schedules."); }).finally(() => { if (current) setDriverScheduleLoading(false); });
    }, 200);
    return () => { current = false; clearTimeout(timer); };
  }, [accessToken, loadingDate, etaDate, availabilityRetry]);

  function rememberOption(kind: keyof Lookups, option: Option) { setLookups(current => ({ ...current, [kind]: [option, ...current[kind].filter(item => item.id !== option.id)] })); }
  
  /* Preview independent DISPATCH and TRIP references for the selected date. */
  const refDate = loadingDate || todayLocal();
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    queueMicrotask(() => { if (active) { setDispatchLoading(true); setDispatchError(""); setDispatchNo(""); setTripReference(""); } });
    getNextTripReferences(accessToken, dispatchPrefix(refDate))
      .then((refs) => { if (active) { setDispatchNo(refs.dispatch_number); setTripReference(refs.trip_reference ?? ""); setTripReferenceStatus(refs.trip_reference_status); } })
      .catch((cause) => { if (!active) return; setDispatchNo(""); setDispatchError(cause instanceof Error ? cause.message : "Could not generate the dispatch reference."); })
      .finally(() => active && setDispatchLoading(false));
    return () => { active = false; };
  }, [accessToken, refDate, dispatchRetry, dispatchMode]);

  /* existing dispatches (to add another trip to one) */
  useEffect(() => {
    if (!accessToken || dispatchMode !== "existing") return;
    let active = true;
    queueMicrotask(() => { if (active) { setDispatchesLoading(true); setDispatchError(""); } });
    searchDispatches(accessToken)
      .then((rows) => active && setDispatchOptions(rows))
      .catch((cause) => active && setDispatchError(cause instanceof Error ? cause.message : "Could not load dispatches."))
      .finally(() => active && setDispatchesLoading(false));
    return () => { active = false; };
  }, [accessToken, dispatchMode, dispatchRetry]);

  const existingDispatch = dispatchOptions.find((d) => d.dispatch_number === existingNo) ?? null;
  const dispatchRef = dispatchMode === "existing" ? existingDispatch?.dispatch_number ?? "" : dispatchNo;
  const tripNumber = dispatchMode === "existing" ? existingDispatch?.next_trip_number ?? 0 : 1;
  const dispatchBusy = dispatchMode === "existing" ? dispatchesLoading : dispatchLoading;
  const dispatchOptionList = useMemo<Option[]>(
    () => dispatchOptions.map((d) => ({
      id: d.dispatch_number, label: d.dispatch_number,
      secondary: `${d.trip_count} trip${d.trip_count === 1 ? "" : "s"}${d.loading_date ? ` · loaded ${d.loading_date.slice(0, 10)}` : ""}`,
    })),
    [dispatchOptions],
  );

  function pickExistingDispatch(number: string) {
    setExistingNo(number);
    const d = dispatchOptions.find((o) => o.dispatch_number === number);
    if (!d) return;
    if (!loadingDate && d.loading_date) setLoadingDate(d.loading_date.slice(0, 10));
    if (!warehouseId && d.warehouse_id) setWarehouseId(d.warehouse_id);
    if (!tripTypeId && !newTripType && d.trip_type_id) setTripTypeId(d.trip_type_id);
  }

  function switchDispatchMode(mode: "new" | "existing") {
    setDispatchMode(mode); setDispatchError(""); setError("");
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const productOptions = useMemo<Option[]>(
    () => lookups.products.map((o) => {
      const code = productCode(o);
      return { ...o, label: code, secondary: code === o.label ? undefined : o.label };
    }),
    [lookups.products],
  );
  const tripTypeLabel = newTripType.trim() || labelOf(lookups["trip-types"], tripTypeId);

  const totals = useMemo(() => {
    let qty = 0, cbm = 0, lines = 0;
    for (const s of stops) for (const i of s.items) { qty += lineQty(i); cbm += lineCbm(i); if (hasItemData(i)) lines += 1; }
    return { qty, cbm, lines };
  }, [stops]);
  const populatedStops = stops.filter(hasStopData);
  const selectedTruckAssignments = truckAssignments.filter((assignment) => assignment.truckId);
  const capacityState = tripCapacity(totals.cbm, selectedTruckAssignments.map((assignment) => {
    const capacity = Number(lookups.trucks.find((truck) => truck.id === assignment.truckId)?.values?.capacity_cbm);
    return Number.isFinite(capacity) && capacity > 0 ? capacity : null;
  }));
  const cargoLines: CargoLine[] = populatedStops.flatMap(stop => stop.items.filter(hasItemData).map(item => ({ key: String(item.key), dr: item.dr, stop: labelOf(lookups.stores, stop.storeId) || stop.pendingDestination || stop.customer, label: item.newCode || labelOf(productOptions, item.productId) || item.dr || 'Product', quantity: item.qty, cbm: item.cbm })));
  const cargoTrucks: CargoTruck[] = selectedTruckAssignments.map(assignment => ({ id: assignment.truckId, label: labelOf(lookups.trucks, assignment.truckId) || assignment.truckId, capacity: lookups.trucks.find(truck => truck.id === assignment.truckId)?.values?.capacity_cbm || '', driverId: assignment.driverId, driverLabel: labelOf(lookups.drivers, assignment.driverId) || '' }));
  const assignedCapacity = capacityState.capacity;
  const hasUnknownTruckCapacity = capacityState.unknown;

  function addCapacityTruck() {
    const empty = truckAssignments.find(assignment => !assignment.truckId), target = empty ?? newTruckAssignment();
    if (!empty) setTruckAssignments(current => [...current, target]);
    setTruckPickerKey(target.key);
    setError("");
  }

  /* updates */
  const updateStop = (key: number, patch: Partial<StopDraft>) =>
    setStops((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const updateItem = (stopKey: number, itemKey: number, patch: Partial<ItemDraft>) =>
    setStops((list) => list.map((s) => s.key === stopKey
      ? { ...s, items: s.items.map((i) => (i.key === itemKey ? { ...i, ...patch } : i)) } : s));

  function pickStore(stopKey: number, storeId: string, option?: Option) {
    if (option) rememberOption("stores", option);
    const location = option?.values ?? lookups.stores.find((o) => o.id === storeId)?.values;
    const customer = lookups.customers.find((o) => o.id === location?.customer_id);
    updateStop(stopKey, {
      storeId, pendingDestination: "", customerId: location?.customer_id,
      customer: customer?.values?.customer_name ?? stops.find(stop => stop.key === stopKey)?.customer ?? "",
      city: location?.city ?? "",
      province: location?.province ?? "",
      address: location?.address ?? "",
    });
  }

  function pickProduct(stopKey: number, itemKey: number, productId: string, option?: Option) {
    if (option) rememberOption("products", option);
    const category = option?.values?.product_category ?? lookups.products.find((o) => o.id === productId)?.values?.product_category ?? "";
    updateItem(stopKey, itemKey, { productId, category, addingProduct: false, newCode: "" });
  }

  const matchExisting = (code: string) =>
    code.trim() ? productOptions.find((o) => o.label.trim().toLowerCase() === code.trim().toLowerCase()) : undefined;

  /* validation */
  function validateTrip(): string {
    if (selectedTruckAssignments.some(assignment => assignment.driverId) && (driverScheduleLoading || driverScheduleError)) return driverScheduleError || "Wait for the driver schedule check.";
    if (selectedTruckAssignments.some(assignment => driverAvailability.some(driver => driver.id === assignment.driverId && driver.availability === "CONFLICT"))) return "A selected driver has an overlapping active trip. Choose another driver or change the dates.";
    if (new Set(selectedTruckAssignments.map(a => a.driverId).filter(Boolean)).size !== selectedTruckAssignments.filter(a => a.driverId).length) return "A driver cannot drive two active trucks in the same trip.";
    if (cargoPlan.placements.length) { if (!cargoPlan.confirmed || cargoPlan.signature !== cargoSignature(cargoLines, cargoTrucks)) return "Review and confirm the current cargo distribution."; const problem = validateCargo(cargoLines, cargoTrucks, cargoPlan.placements); if (problem) return problem; }
    if (dispatchMode === "existing" && !existingDispatch) return "Choose the dispatch this trip belongs to.";
    if (etaDate && loadingDate && etaDate < loadingDate) return "Estimated delivery can't be before the loading date.";
    if (selectedTruckAssignments.length && (availabilityLoading || availabilityError)) return "Wait for the truck availability check, or retry it.";
    for (const assignment of selectedTruckAssignments) { const state = availability.find(truck => truck.id === assignment.truckId); if (!state || state.availability === "CONFLICT") return "A selected truck is unavailable for these dates. Choose another truck."; if (state.availability === "REVIEW" && !assignment.availabilityConfirmed) return "Confirm the schedule for trucks marked availability requires confirmation."; }
    const assignedTruckIds = selectedTruckAssignments.map((assignment) => assignment.truckId);
    if (new Set(assignedTruckIds).size !== assignedTruckIds.length) return "Choose a different truck for each assignment.";
    if (truckAssignments.some((assignment) => assignment.driverId && !assignment.truckId)) return "Choose a truck before assigning a driver.";
    return "";
  }

  function validateStops(): string {
    for (const [i, stop] of stops.entries()) {
      const n = i + 1;
      if (stop.pendingDestination && !stop.storeId && !stop.customerId) return `Stop ${n}: select or add destination "${stop.pendingDestination}" before creating the trip.`;
      for (const item of stop.items) {
        if (item.qty.trim() && (!Number.isSafeInteger(num(item.qty)) || num(item.qty) < 0)) return `Stop ${n}: quantity must be a non-negative whole number.`;
        if (item.unitCbm.trim() && (!Number.isFinite(num(item.unitCbm)) || num(item.unitCbm) < 0)) return `Stop ${n}: unit CBM must be a non-negative number.`;
        if (item.cbm.trim() !== "" && (!Number.isFinite(num(item.cbm)) || num(item.cbm) < 0)) return `Stop ${n}: CBM must be a valid number.`;
      }
    }
    return "";
  }

  function goTo(target: number) {
    if (saving) return;
    if (target <= step) { setError(""); setStep(target); bodyRef.current?.scrollTo({ top: 0 }); return; }
    let problem = target >= 2 ? validateTrip() : dispatchMode === "existing" && !existingDispatch ? "Choose the dispatch this trip belongs to." : etaDate && loadingDate && etaDate < loadingDate ? "Estimated delivery cannot be before loading." : "";
    if (!problem && target >= 1) problem = validateStops();
    setError(problem);
    if (!problem) { setStep(target); bodyRef.current?.scrollTo({ top: 0 }); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step < STEPS.length - 1) { goTo(step + 1); return; }
    const problem = validateTrip() || validateStops();
    if (problem) return setError(problem);
    setError(""); setSaving(true);
    try {
      if (accessToken && selectedTruckAssignments.length) { const latest = await fetchTruckAvailability(accessToken, loadingDate, etaDate); for (const assignment of selectedTruckAssignments) { const truck = latest.find(row => row.id === assignment.truckId); const previous = availability.find(row => row.id === assignment.truckId); if (!truck || truck.availability === "CONFLICT") throw Error("A selected truck now has a schedule conflict. Choose another truck."); if (truck.availability === "REVIEW" && (!assignment.availabilityConfirmed || previous?.availability !== "REVIEW")) throw Error("A selected truck requires schedule confirmation before creating the trip."); } }
      await onSubmit({
        request_id: creationRequestId,
        dispatch_mode: dispatchMode,
        cargo_plan: cargoPlan.placements.length ? { ...cargoPlan, trucks: cargoTrucks } : undefined,
        trip: {
          dispatch_number: dispatchRef.trim() || null,
          trip_number: tripNumber,
          loading_date: loadingDate || null,
          estimated_delivery_date: etaDate || null,
          status,
          trip_type_id: newTripType.trim() ? null : tripTypeId || null,
          trip_type_name: newTripType.trim() || null,
          warehouse_id: warehouseId || null,
          truck_id: null,
          driver_id: null,
          remarks: remarks.trim() || null,
        },
        assignments: selectedTruckAssignments.map((assignment, index) => ({
          truck_id: assignment.truckId,
          driver_id: assignment.driverId || null,
          assignment_type: index === 0 ? "PRIMARY" : "ADDITIONAL",
        })),
        stops: stops.filter(hasStopData).map((stop, index) => ({
          stop_sequence: index + 1,
          destination: !stop.storeId && stop.pendingDestination ? { name: stop.pendingDestination, customer_id: stop.customerId || "", customer_name: stop.customer, province: stop.province, city: stop.city, address: stop.address } : undefined,
          store_id: stop.storeId || null,
          customer_id: lookups.stores.find((o) => o.id === stop.storeId)?.values?.customer_id || stop.customerId || null,
          remarks: [stop.customer && `Customer: ${stop.customer}`, stop.province && `Province: ${stop.province}`, stop.city && `City: ${stop.city}`, stop.address && `Ship-to address: ${stop.address}`, stop.importNotes].filter(Boolean).join(" · ") || null,
          line_items: stop.items.filter(hasItemData).map((item) => {
            const typed = item.newCode.trim();
            const productId = item.productId || matchExisting(typed)?.id || "";
            return {
              client_key: String(item.key),
              customer_model: item.sourceModel || typed || productOptions.find(option => option.id === productId)?.values?.model_code || productOptions.find(option => option.id === productId)?.label || null,
              sp_reference: item.sp.trim() || null, ph_truck_reference: item.phTruck.trim() || null, dn_reference: item.dn.trim() || null,
              order_item_number: item.orderItem.trim() || null, so_number: item.so.trim() || null, stock_quantity: item.stocks.trim() || null,
              unit_cbm: item.unitCbm.trim() || null, so_approval_date: item.approvalDate.trim() || null, item_status: item.itemStatus.trim() || null,
              source_warehouse: item.warehouse.trim() || null, source_product_category: item.category.trim() || null, source_province: stop.province.trim() || null, source_city: stop.city.trim() || null,
              product_id: productId || null,
              new_product_code: productId ? null : typed || null,
              new_product_category: productId ? null : item.category.trim() || null,
              dr_number: item.dr.trim() || null,
              sap_so_number: item.sapSo.trim() || null,
              customer_po_number: item.customerPo.trim() || null,
              internal_po_number: item.po.trim() || null,
              remarks: [item.sp && `SP: ${item.sp}`, item.dn && `DN: ${item.dn}`, item.so && `SO: ${item.so}`, item.category && `Category: ${item.category}`, item.unitCbm && `Unit CBM: ${item.unitCbm}`, item.itemStatus && `Item status: ${item.itemStatus}`, item.warehouse && `Source warehouse: ${item.warehouse}`, item.importNotes].filter(Boolean).join(" · ") || null,
              quantity: item.qty.trim() || null,
              cbm: item.cbm.trim() || null,
            };
          }),
        })),
      });
      onClose();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to create the trip.";
      if (/already exists/i.test(message)) {
        setDispatchRetry((n) => n + 1);
        setError(dispatchMode === "existing"
          ? "Someone just added a trip to this dispatch. The trip number has been updated — review it and create the trip again."
          : "That dispatch reference was just taken. A new one has been generated — review it and create the trip again.");
      } else setError(message);
    } finally { setSaving(false); }
  }

  const isLast = step === STEPS.length - 1;
  const productLabel = (i: ItemDraft) => i.sourceModel || (i.productId ? labelOf(productOptions, i.productId) : i.newCode.trim() || null);
  const previewTrip: TripPreviewRow = {
    dispatch: dispatchRef || "Generated on save", trip: tripReference || (tripReferenceStatus === "setup_required" ? "Not yet enabled" : "Generated on save"), tripType: tripTypeLabel || "",
    status: sentence(status), loadingDate, eta: etaDate,
    plate: selectedTruckAssignments.map(assignment => labelOf(lookups.trucks, assignment.truckId)).filter(Boolean).join(", "),
    drivers: selectedTruckAssignments.map(assignment => labelOf(lookups.drivers, assignment.driverId)).filter(Boolean).join(", "),
    warehouse: labelOf(lookups.warehouses, warehouseId) || "", notes: remarks,
  };
  const previewRows: TripPreviewRow[] = populatedStops.flatMap(stop => {
    const items = stop.items.filter(hasItemData);
    const base: TripPreviewRow = { ...previewTrip, store: labelOf(lookups.stores, stop.storeId) || stop.pendingDestination || "Unassigned", customer: stop.customer, province: stop.province, city: stop.city };
    return items.length ? items.map(item => ({ ...base, product: productLabel(item) || "", category: item.category, qty: item.qty, unitCbm: item.unitCbm, cbm: item.cbm, dr: item.dr, sapSo: item.sapSo, customerPo: item.customerPo, po: item.po, notes: [remarks, stop.importNotes, stop.address && `Ship-to address: ${stop.address}`, item.sp && `SP: ${item.sp}`, item.dn && `DN: ${item.dn}`, item.so && `SO: ${item.so}`, item.itemStatus && `Source status: ${item.itemStatus}`, item.warehouse && `Source warehouse: ${item.warehouse}`, item.importNotes].filter(Boolean).join(" · ") })) : [{ ...base, notes: [remarks, stop.importNotes, stop.address].filter(Boolean).join(" · ") }];
  });

  /* ───────────────────────────── render ───────────────────────────── */
  if (bulkImportOpen) return <BulkTripImport initialTarget={dispatchMode === "existing" && existingDispatch ? { mode: "dispatch", value: existingNo, allow_create: true } : undefined} onClose={() => setBulkImportOpen(false)} onComplete={onClose} onImported={() => onImported?.()} />;
  
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm sm:p-4 lg:p-6">
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="add-trip-title"
        aria-busy={saving}
        className="flex h-[100dvh] min-w-0 w-full max-w-[1200px] flex-col overflow-hidden bg-slate-50 shadow-2xl ring-1 ring-slate-900/5 sm:h-[92dvh] sm:rounded-3xl">

        {/* header */}
        <header className="shrink-0 bg-white px-5 pt-5 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 id="add-trip-title" className="text-xl font-bold tracking-tight text-[#0b2341]">New trip</h3>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                <span className="max-w-full truncate font-mono text-[13px] font-medium text-[#2678b9]">
                  {dispatchBusy ? "Loading…" : dispatchRef || "No dispatch yet"}
                </span>
                <span className="text-xs text-slate-500">{tripReference || (tripReferenceStatus === "setup_required" ? "Trip numbering not yet enabled" : "Trip no. generated on save")}</span>
                {tripTypeLabel && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{tripTypeLabel}</span>}
              </p>
            </div>
            <button type="button" onClick={onClose} disabled={saving} aria-label="Close"
              className="rounded-full p-2.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-5 border-b border-slate-100 pb-1">
            <Tabs current={step} onJump={goTo} disabled={saving} />
          </div>
        </header>

        {/* body */}
        <div ref={bodyRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          <div className="mx-auto max-w-5xl space-y-6">
            
            {step === 2 && capacityState.full && <TripFormNotice tone="warning" title={capacityState.exceeded ? "Truck capacity exceeded" : "Truck capacity is full"} action={<button type="button" onClick={addCapacityTruck} className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white/70 px-3 py-1.5 text-xs font-semibold hover:bg-white"><Plus className="h-3.5 w-3.5" />Add another truck</button>}>
              <p>{fmt(totals.cbm)} CBM of cargo / {fmt(assignedCapacity)} CBM capacity.</p><p>{capacityState.exceeded ? `Add a truck for the remaining ${fmt(capacityState.overflow)} CBM before loading.` : "Add another truck if you need to load more cargo."} You can still save this as a planned trip.</p>
            </TripFormNotice>}
            {step === 2 && selectedTruckAssignments.length > 0 && hasUnknownTruckCapacity && <TripFormNotice tone="warning" title="Truck capacity is missing">At least one selected truck has no CBM capacity recorded. Check its capacity before loading.</TripFormNotice>}
            {lookupError && <TripFormNotice tone="warning" title="Some lists could not load">{lookupError} You can continue with blank fields and complete them later.</TripFormNotice>}

            {/* ── step 1: trip ── */}
            {step === 0 && (
              <div className="space-y-6">
                <section className="rounded-2xl border border-blue-100 bg-blue-50/50 p-6 sm:p-8">
                  <div className="inline-flex rounded-full bg-slate-200/70 p-1 text-sm" role="tablist" aria-label="Dispatch">
                    {([["new", "New dispatch"], ["existing", "Add to an existing dispatch"]] as const).map(([mode, label]) => (
                      <button key={mode} type="button" role="tab" aria-selected={dispatchMode === mode} onClick={() => switchDispatchMode(mode)}
                        className={`rounded-full px-5 py-2 font-medium transition ${dispatchMode === mode ? "bg-white text-[#0b2341] shadow-sm" : "text-slate-600 hover:text-[#0b2341]"}`}>
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-500">Dispatch reference</p>
                      <p className="mt-1 truncate font-mono text-3xl font-bold tracking-tight text-[#0b2341]">
                        {dispatchBusy ? "Loading…" : dispatchRef || "—"}
                      </p>
                      <p className="mt-2 text-sm text-slate-500">
                        {dispatchMode === "new"
                          ? `Reference generated from ${loadingDate ? "the loading date" : "today's date"}.`
                          : existingDispatch
                            ? `Adding a trip to this dispatch · ${existingDispatch.trip_count} existing trip${existingDispatch.trip_count === 1 ? "" : "s"}.`
                            : "Select an existing dispatch to add another trip."}
                      </p>
                      {dispatchError && <div className="mt-4"><TripFormNotice tone="warning" title={dispatchMode === "existing" ? "Dispatch list unavailable" : "Dispatch reference unavailable"} action={<button type="button" onClick={() => setDispatchRetry(value => value + 1)} className="rounded-full border border-amber-300 bg-white/70 px-4 py-1.5 text-xs font-semibold hover:bg-white">Try again</button>}>{dispatchError}{dispatchMode === "new" && " A reference will be generated when you save."}</TripFormNotice></div>}
                    </div>
                    {dispatchMode === "new" && (
                      <button type="button" onClick={() => setDispatchRetry((n) => n + 1)} disabled={dispatchLoading}
                        className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-5 py-2.5 text-sm font-medium text-[#0b2341] shadow-sm transition hover:bg-blue-50 disabled:opacity-50">
                        <RefreshCw className={`h-4 w-4 ${dispatchLoading ? "animate-spin" : ""}`} /> Get a new number
                      </button>
                    )}
                  </div>

                  {dispatchMode === "existing" && (
                    <div className="mt-5 max-w-md text-slate-800">
                      <Dropdown value={existingNo} onChange={pickExistingDispatch} options={dispatchOptionList}
                        placeholder="Search dispatch number" loading={dispatchesLoading} />
                    </div>
                  )}
                </section>

                <Section title="Trip Details" description="Generated separately from the dispatch reference.">
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Trip no.">
                      <input readOnly aria-label="Generated trip number" value={tripReference} placeholder={dispatchLoading ? "Generating trip number…" : tripReferenceStatus === "setup_required" ? "Trip numbering not yet enabled" : "Generated when you save"} className={`${input} font-mono bg-slate-50 text-slate-500`} />
                    </Field>
                    <Field label="Trip type">
                      {addingTripType ? (
                        <div className="flex items-center gap-1.5">
                          <input autoFocus value={newTripType} onChange={(e) => setNewTripType(e.target.value)} className={input} placeholder="e.g. Backload" />
                          <button type="button" onClick={() => { setAddingTripType(false); setNewTripType(""); }} aria-label="Cancel new trip type"
                            className="rounded-lg p-2.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4" /></button>
                        </div>
                      ) : (
                        <Dropdown value={tripTypeId} onChange={(v) => { setTripTypeId(v); setNewTripType(""); }}
                          options={lookups["trip-types"]} placeholder="Choose a type" loading={loadingLookups}
                          onAddNew={() => { setTripTypeId(""); setAddingTripType(true); }} addNewLabel="Add a new trip type" />
                      )}
                    </Field>
                    <Field label="Status">
                      <Dropdown value={status} onChange={(v) => setStatus(v || "PLANNED")}
                        options={STATUSES.map((s) => ({ id: s, label: sentence(s) }))} placeholder="Choose status" />
                    </Field>
                    <Field label="Loading date" hint="optional">
                      <input type="date" value={loadingDate} onChange={(e) => setLoadingDate(e.target.value)} className={input} />
                    </Field>
                    <Field label="Estimated delivery" hint="optional">
                      <input type="date" min={loadingDate || undefined} value={etaDate} onChange={(e) => setEtaDate(e.target.value)} className={input} />
                    </Field>
                  </div>
                </Section>
              </div>
            )}

            {/* ── step 2: stores & products ── */}
            {step === 1 && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="inline-flex rounded-full bg-slate-200/70 p-1 text-sm" role="tablist" aria-label="Stores and products view">
                    {([["edit", "Edit stops"], ["preview", `Table preview (${totals.lines})`]] as const).map(([view, label]) => (
                      <button key={view} type="button" role="tab" aria-selected={stopsView === view} onClick={() => setStopsView(view)}
                        className={`rounded-full px-5 py-2 font-medium transition ${stopsView === view ? "bg-white text-[#0b2341] shadow-sm" : "text-slate-600 hover:text-[#0b2341]"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => setBulkImportOpen(true)} disabled={saving}
                    className="inline-flex shrink-0 items-center gap-2 rounded-full border border-blue-200 bg-white px-5 py-2 text-sm font-medium text-[#2678b9] shadow-sm transition hover:bg-blue-50 disabled:opacity-50">
                    <Upload className="h-4 w-4" /> Import CSV / XLSX
                  </button>
                </div>

                {stopsView === "preview" ? (
                  populatedStops.length > 0
                    ? <TripTablePreview title="Product table preview" description="Read-only. Switch to Edit stops to change anything." rows={previewRows} />
                    : (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
                        <Package className="mx-auto h-10 w-10 text-slate-300 mb-3" />
                        <p className="text-base font-medium text-slate-700">Nothing to preview yet</p>
                        <p className="mt-1 text-sm text-slate-500">Add a store and its products, or import a file.</p>
                        <button type="button" onClick={() => setStopsView("edit")} className="mt-5 rounded-full bg-[#0b2341] px-5 py-2 text-sm font-medium text-white hover:bg-[#1a365d]">Go to Edit stops</button>
                      </div>
                    )
                ) : (
                  <div className="space-y-6">
                    {stops.map((stop, si) => {
                      const t = stopTotals(stop);
                      const storeName = labelOf(lookups.stores, stop.storeId) || stop.pendingDestination || "";
                      const lineCount = stop.items.filter(hasItemData).length;
                      
                      return (
                        <section key={stop.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                          {/* Stop Header */}
                          <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/50 px-6 py-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0b2341] text-sm font-semibold text-white">{si + 1}</span>
                              <div className="min-w-0">
                                <p className={`truncate text-base font-semibold ${storeName ? "text-slate-800" : "text-slate-400"}`}>
                                  {storeName || "Select a destination store"}
                                </p>
                                <p className="text-xs text-slate-500">{lineCount} product{lineCount === 1 ? "" : "s"} · {fmt(t.qty, 0)} Qty · {fmt(t.cbm)} CBM</p>
                              </div>
                            </div>
                            {stops.length > 1 && (
                              <button type="button" onClick={() => setStops((l) => l.filter((s) => s.key !== stop.key))} aria-label={`Remove stop ${si + 1}`}
                                className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>

                          {/* Store Details */}
                          <div className="p-6 space-y-5">
                            <div>
                              <label className="mb-1.5 block text-sm font-medium text-slate-700">Delivery Store</label>
                              {accessToken && (
                                <div className={`${input} flex items-center px-2`}>
                                  <SearchableRelationshipEditor presentation="form" token={accessToken} kind="stores" value={storeName} customerId={stop.customerId} createDefaults={{ address: stop.address, city: stop.city, province: stop.province }} autoFocus={false} disabled={saving} onSelect={option => pickStore(stop.key, option.id, option)} onCommitBlur={() => {}} onCancel={() => {}} />
                                </div>
                              )}
                              {stop.pendingDestination && !stop.storeId && <p className="mt-1.5 text-xs text-amber-700">Imported destination: {stop.pendingDestination}. Pick a match, or choose Add in the search list.</p>}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                              <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                              <span className={`min-w-0 flex-1 truncate ${stop.address || stop.city ? "text-slate-700" : "text-slate-400"}`}>
                                {[stop.address, stop.city, stop.province].filter(Boolean).join(", ") || "Address fills in when you pick a store."}
                              </span>
                              <button type="button" onClick={() => updateStop(stop.key, { editLocation: !stop.editLocation })}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-[#2678b9] hover:bg-[#2678b9]/10 transition-colors">
                                <Pencil className="h-3 w-3" /> {stop.editLocation ? "Done" : "Edit details"}
                              </button>
                            </div>
                            
                            {stop.editLocation && (
                              <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Customer name"><input value={stop.customer} onChange={(e) => updateStop(stop.key, { customer: e.target.value })} className={input} /></Field>
                                <Field label="Province"><input value={stop.province} onChange={(e) => updateStop(stop.key, { province: e.target.value })} className={input} /></Field>
                                <Field label="City"><input value={stop.city} onChange={(e) => updateStop(stop.key, { city: e.target.value })} className={input} /></Field>
                                <Field label="Ship-to address"><input value={stop.address} onChange={(e) => updateStop(stop.key, { address: e.target.value })} className={input} /></Field>
                              </div>
                            )}
                            {stop.importNotes && <Field label="Stop notes"><textarea value={stop.importNotes} onChange={(event) => updateStop(stop.key, { importNotes: event.target.value })} className={`${inputBase} p-3 text-xs`} /></Field>}
                          </div>

                          {/* Products List */}
                          <div className="border-t border-slate-100 bg-slate-50/50 p-6">
                            <div className="mb-4 flex items-center justify-between">
                              <h5 className="text-sm font-semibold text-slate-800">Products for this store</h5>
                              <span className="text-xs text-slate-500">{lineCount} line{lineCount === 1 ? "" : "s"}</span>
                            </div>
                            
                            <div className="space-y-3">
                              {stop.items.map((item, ii) => {
                                const hasMore = [item.sp, item.dn, item.so, item.sapSo, item.customerPo, item.po, item.category, item.unitCbm, item.itemStatus, item.warehouse].some(v => v.trim());
                                return (
                                  <div key={item.key} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-4 items-end">
                                      <div className="sm:col-span-4 min-w-0">
                                        <span className="mb-1.5 block text-xs text-slate-500">Product code</span>
                                        {item.addingProduct ? (
                                          <div className="flex items-center gap-1.5">
                                            <div className="relative min-w-0 flex-1">
                                              <input autoFocus value={item.newCode} onChange={(e) => updateItem(stop.key, item.key, { newCode: e.target.value })}
                                                className={`${inputSm} pr-12`} placeholder="Type the new product code" />
                                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded bg-[#2678b9]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#2678b9]">New</span>
                                            </div>
                                            <button type="button" aria-label="Cancel new product code"
                                              onClick={() => updateItem(stop.key, item.key, { addingProduct: false, newCode: "" })}
                                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4" /></button>
                                          </div>
                                        ) : (
                                          accessToken ? <div className={`${inputSm} flex items-center px-2`}><SearchableRelationshipEditor presentation="form" token={accessToken} kind="products" value={labelOf(productOptions, item.productId) ?? ""} autoFocus={false} disabled={saving} onSelect={option => pickProduct(stop.key, item.key, option.id, option)} onCommitBlur={() => {}} onCancel={() => {}} /></div> : null
                                        )}
                                      </div>
                                      <div className="sm:col-span-2">
                                        <span className="mb-1.5 block text-xs text-slate-500">Qty</span>
                                        <input type="number" inputMode="numeric" min="0" step="1" value={item.qty} aria-label="Quantity"
                                          onChange={(e) => updateItem(stop.key, item.key, { qty: e.target.value })} className={inputSm} placeholder="0" />
                                      </div>
                                      <div className="sm:col-span-2">
                                        <span className="mb-1.5 block text-xs text-slate-500">Total CBM</span>
                                        <input type="number" inputMode="decimal" min="0" step="any" value={item.cbm} aria-label="Total CBM"
                                          onChange={(e) => updateItem(stop.key, item.key, { cbm: e.target.value })} className={inputSm} placeholder="0" />
                                      </div>
                                      <div className="sm:col-span-2">
                                        <span className="mb-1.5 block text-xs text-slate-500">DR no.</span>
                                        <input value={item.dr} aria-label="DR number" onChange={(e) => updateItem(stop.key, item.key, { dr: e.target.value })} className={inputSm} placeholder="DR number" />
                                      </div>
                                      <div className="sm:col-span-2 flex items-center justify-end gap-1">
                                        <button type="button" onClick={() => updateItem(stop.key, item.key, { open: !item.open })}
                                          aria-label={item.open ? "Hide more details" : "Show more details"} aria-expanded={item.open} title="Order references and product details"
                                          className={`relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition ${item.open ? "bg-[#2678b9]/10 text-[#2678b9]" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"}`}>
                                          <SlidersHorizontal className="h-3.5 w-3.5" /> More
                                          {hasMore && !item.open && <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#2678b9]" />}
                                        </button>
                                        <button type="button" disabled={stop.items.length === 1} aria-label={`Remove product line ${ii + 1}`}
                                          onClick={() => updateStop(stop.key, { items: stop.items.filter((i) => i.key !== item.key) })}
                                          className="rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30 transition-colors">
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </div>

                                    {item.open && (
                                      <div className="border-t border-slate-100 bg-slate-50 p-5 space-y-5">
                                        <div>
                                          <p className="mb-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">Order references</p>
                                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                            {([["SP number", "sp"], ["DN no.", "dn"], ["SO no.", "so"], ["SAP SO no.", "sapSo"], ["Customer PO", "customerPo"], ["PO no.", "po"]] as const).map(([label, field]) => (
                                              <Field key={field} label={label}>
                                                <input value={item[field]} onChange={(e) => updateItem(stop.key, item.key, { [field]: e.target.value })} className={inputSm} />
                                              </Field>
                                            ))}
                                          </div>
                                        </div>
                                        <div>
                                          <p className="mb-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">Product details</p>
                                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                            <Field label="Product category" hint={item.addingProduct ? "saved with new code" : undefined}>
                                              <input value={item.category} onChange={(e) => updateItem(stop.key, item.key, { category: e.target.value })} className={inputSm} placeholder="AC, REF, WM…" />
                                            </Field>
                                            <Field label="Unit CBM">
                                              <div className="flex gap-2">
                                                <input type="number" min="0" step="any" value={item.unitCbm} onChange={(e) => updateItem(stop.key, item.key, { unitCbm: e.target.value })} className={inputSm} />
                                                <button type="button" title="Total CBM = qty × unit CBM"
                                                  disabled={Boolean(item.cbm.trim()) || !Number.isFinite(num(item.unitCbm)) || num(item.unitCbm) < 0 || !(num(item.qty) > 0)}
                                                  onClick={() => updateItem(stop.key, item.key, { cbm: calculatedCbm(item.qty, item.unitCbm), importNotes: [item.importNotes, "Total CBM calculated from quantity and unit CBM."].filter(Boolean).join(" / ") })}
                                                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-[#2678b9] hover:border-[#2678b9]/40 disabled:text-slate-300 disabled:hover:border-slate-200 transition-colors">
                                                  Calculate
                                                </button>
                                              </div>
                                            </Field>
                                            <Field label="Item status">
                                              <input value={item.itemStatus} onChange={(e) => updateItem(stop.key, item.key, { itemStatus: e.target.value })} className={inputSm} />
                                            </Field>
                                            <Field label="Source warehouse" hint="if different">
                                              <input value={item.warehouse} onChange={(e) => updateItem(stop.key, item.key, { warehouse: e.target.value })} className={inputSm} />
                                            </Field>
                                          </div>
                                        </div>
                                        {item.importNotes && <Field label="Notes"><textarea value={item.importNotes} onChange={(event) => updateItem(stop.key, item.key, { importNotes: event.target.value })} className={`${inputBase} min-h-16 p-2 text-xs`} /></Field>}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            <button type="button" onClick={() => updateStop(stop.key, { items: [...stop.items, newItem()] })}
                              className="mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#2678b9] hover:bg-[#2678b9]/10 transition-colors">
                              <Plus className="h-4 w-4" /> Add product line
                            </button>
                          </div>
                        </section>
                      );
                    })}

                    <button type="button" onClick={() => setStops((l) => [...l, newStop()])}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 py-5 text-sm font-semibold text-slate-500 transition hover:border-[#2678b9]/50 hover:bg-blue-50 hover:text-[#2678b9]">
                      <Plus className="h-5 w-5" /> Add another delivery store
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── step 3: assignments & cargo ── */}
            {step === 2 && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Left Column: Truck & Driver Assignments */}
                <div className="lg:col-span-12 xl:col-span-5 space-y-6">
                  <Section title="Truck & Driver Assignments" description="Assign the primary truck and any additional trucks for this trip.">
                    <div className="mb-5">
                      <Field label="Origin warehouse">
                        {accessToken && (
                          <div className={`${input} flex items-center px-2`}>
                            <SearchableRelationshipEditor presentation="form" token={accessToken} kind="warehouses" value={labelOf(lookups.warehouses, warehouseId) ?? ""} autoFocus={false} disabled={saving} onSelect={option => { rememberOption("warehouses", option); setWarehouseId(option.id); }} onCommitBlur={() => {}} onCancel={() => {}} />
                          </div>
                        )}
                      </Field>
                    </div>

                    <div className="space-y-4">
                      {truckAssignments.map((assignment, index) => {
                        const otherCapacity = truckAssignments.filter(other => other.key !== assignment.key && other.truckId).reduce((total, other) => total + Number(lookups.trucks.find(truck => truck.id === other.truckId)?.values?.capacity_cbm || 0), 0);
                        const remaining = Math.max(0, totals.cbm - otherCapacity);
                        const ranked = lookups.trucks.filter(truck => truck.id === assignment.truckId || !truckAssignments.some(other => other.key !== assignment.key && other.truckId === truck.id)).map(truck => {
                          const status = availability.find(row => row.id === truck.id); const capacity = Number(truck.values?.capacity_cbm || 0);
                          const available = status?.availability === "AVAILABLE";
                          return {
                            ...truck, disabled: !status || status.availability === "CONFLICT", rank: !status || status.availability === "CONFLICT" ? 3 : !available ? 2 : capacity >= remaining ? 0 : 1,
                            secondary: `${truck.values?.truck_type || "Truck"} · Max ${capacity > 0 ? fmt(capacity) : "unknown"} CBM · ${available ? `Available ${capacity > 0 ? fmt(capacity) : "unknown"} CBM` : status?.availability === "CONFLICT" ? "Conflicting assignment" : "Availability requires confirmation"} · ${capacity > 0 && capacity >= remaining ? "Fits remaining cargo" : capacity > 0 ? "Partial capacity" : "Capacity requires review"}`
                          };
                        }).sort((a, b) => a.rank - b.rank || Number(a.values?.capacity_cbm || 0) - Number(b.values?.capacity_cbm || 0) || a.label.localeCompare(b.label));
                        
                        const availableTrucks = ranked;
                        const truckState = availability.find(truck => truck.id === assignment.truckId);
                        const chosenTruck = lookups.trucks.find((truck) => truck.id === assignment.truckId);
                        const capacity = Number(chosenTruck?.values?.capacity_cbm);
                        
                        return (
                          <div key={assignment.key} className="relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-800">{index === 0 ? "Primary Truck" : `Additional Truck #${index}`}</span>
                              {truckAssignments.length > 1 && (
                                <button type="button" onClick={() => setTruckAssignments((current) => current.filter((item) => item.key !== assignment.key))}
                                  className="text-xs text-rose-600 hover:underline">Remove</button>
                              )}
                            </div>
                            
                            <Field label="Truck">
                              <Dropdown value={assignment.truckId} onChange={(truckId) => { setTruckPickerKey(null); setTruckAssignments((current) => current.map((item) => item.key === assignment.key ? { ...item, truckId, driverId: (() => { const defaultId = lookups.trucks.find(truck => truck.id === truckId)?.values?.default_driver_id || ""; return current.some(other => other.key !== item.key && other.driverId === defaultId) ? "" : defaultId; })(), availabilityConfirmed: false } : item)); }}
                                options={availableTrucks} openRequested={truckPickerKey === assignment.key && !availabilityLoading && !availabilityError} disabled={availabilityLoading || Boolean(availabilityError)} placeholder="Choose truck" loading={loadingLookups} />
                            </Field>
                            
                            {truckState?.availability === "REVIEW" && <label className="flex items-start gap-2 text-xs text-amber-700"><input type="checkbox" className="mt-0.5" checked={Boolean(assignment.availabilityConfirmed)} onChange={event => setTruckAssignments(current => current.map(item => item.key === assignment.key ? { ...item, availabilityConfirmed: event.target.checked } : item))} />I have confirmed this truck's availability for the trip schedule.</label>}
                            {truckState?.availability === "CONFLICT" && <p className="text-xs text-rose-700">Conflicting assignment. Choose another truck.</p>}
                            
                            <Field label="Driver">
                              <Dropdown value={assignment.driverId} onChange={(driverId) => setTruckAssignments((current) => current.map((item) => item.key === assignment.key ? { ...item, driverId } : item))}
                                options={lookups.drivers.filter(driver => !truckAssignments.some(other => other.key !== assignment.key && other.driverId === driver.id)).map(driver => ({ ...driver, disabled: driverAvailability.some(state => state.id === driver.id && state.availability === "CONFLICT") }))}
                                placeholder="Assign driver later" loading={loadingLookups} disabled={!assignment.truckId} />
                            </Field>
                            {chosenTruck && (
                              <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded-lg">
                                {chosenTruck.secondary || "Truck"} {Number.isFinite(capacity) && capacity > 0 ? ` · ${fmt(capacity)} CBM capacity` : ""}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    
                    <button type="button" onClick={() => { addCapacityTruck(); setAvailabilityRetry(value => value + 1); }} className="mt-4 w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition">
                      + Add another truck
                    </button>

                    {selectedTruckAssignments.length > 0 && (
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-blue-50 px-4 py-3 text-xs text-blue-900 font-medium">
                        {hasUnknownTruckCapacity
                          ? <span>{selectedTruckAssignments.length} truck{selectedTruckAssignments.length === 1 ? "" : "s"} selected · capacity incomplete</span>
                          : <><span>Total Truck Capacity: <strong className="font-bold">{fmt(assignedCapacity)} CBM</strong></span><span>Total Cargo: <strong className="font-bold">{fmt(totals.cbm)} CBM</strong></span></>}
                      </div>
                    )}
                    
                    <div className="mt-5">
                      <Field label="Trip Remarks">
                        <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className={input} placeholder="Anything the team should know" />
                      </Field>
                    </div>
                  </Section>
                </div>

                {/* Right Column: Cargo Distribution */}
                <div className="lg:col-span-12 xl:col-span-7">
                  {accessToken && cargoLines.length > 0 && selectedTruckAssignments.length > 0 ? (
                    <div className="sticky top-6">
                      <TripCargoPlanner token={accessToken} lines={cargoLines} plan={cargoPlan} onChange={setCargoPlan} fixedTrucks={cargoTrucks} disabled={saving} />
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm sticky top-6">
                      <Truck className="mx-auto h-12 w-12 text-slate-200 mb-3" />
                      <h3 className="text-base font-semibold text-slate-700">Waiting for trucks and products</h3>
                      <p className="mt-2 text-sm text-slate-500 max-w-xs mx-auto">Assign at least one truck and ensure there are products loaded in the previous step to distribute cargo.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* footer */}
        <footer className="shrink-0 border-t border-slate-200 bg-white px-5 py-4 sm:px-8">
          <div className="mx-auto max-w-5xl">
            {error && (
              <div className="mb-4 max-h-32 overflow-y-auto"><TripFormNotice tone="error" title="Check the trip details" onDismiss={() => setError("")}>{error}</TripFormNotice></div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-600 bg-slate-50 px-4 py-2 rounded-full">
                <Package className="h-4 w-4 text-slate-400" />
                <span>{populatedStops.length} stop{populatedStops.length === 1 ? "" : "s"} · {fmt(totals.qty, 0)} Qty · {fmt(totals.cbm)} CBM</span>
              </p>
              <div className="ml-auto flex items-center gap-3">
                {step === 0 ? (
                  <button type="button" onClick={onClose} disabled={saving} className="rounded-full px-5 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition">Cancel</button>
                ) : (
                  <button type="button" onClick={() => goTo(Math.max(0, step - 1))} disabled={saving} className="inline-flex items-center gap-1 rounded-full px-5 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition">
                    <ChevronLeft className="h-4 w-4" /> Back
                  </button>
                )}
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-[#0b2341] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1a365d] disabled:cursor-not-allowed disabled:opacity-50">
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving trip…</> : isLast ? "Save trip" : <>Next <ChevronRight className="h-4 w-4" /></>}
                </button>
              </div>
            </div>
          </div>
        </footer>
      </form>
    </div>
  );
}