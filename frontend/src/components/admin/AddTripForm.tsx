import TruckPicker from "./TruckPicker";
import StoreEditor from "./shared/StoreEditor";
import DeliveryStoreField from "./shared/DeliveryStoreField";
import ProductsSection from "./shared/ProductsSection";
import { createAllocationSession } from "./useAutoAllocation";
import { TripModalHeader, TripModalSteps, tripModalBackdrop, tripModalShell, tripPrimaryAction, tripSecondaryAction, tripFooter } from "./shared/TripModalUI";
import { useTripModal } from "./shared/useTripModal";
import TripSaveProgress from "./shared/TripSaveProgress";
import CsvSidePanel from "./CsvSidePanel";
import { verifiedStoreCoordinates } from "../../services/trip-location.service";
import type { LocationDecision } from "./ImportDestinationReview";
import { focusRing } from "./shared/styles";
import { useStoreWorkspaceMemory, invalidProduct, type StoreNavigationItem } from "./shared/storeWorkspace";
import { nextCreationRequest, type CreationRequest } from "../../services/trip-creation-request";
import { SectionCard, StoreMasterDetail, StatusChip } from "./shared";
import TripCargoPlanner from "./TripCargoPlanner";
import { cargoSignature, calculatedCbm, emptyCargoPlan, validateCargo, type CargoLine, type CargoTruck } from "../../services/cargo-planning";
// src/pages/Admin/views/AddTripForm.tsx
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ChevronLeft, ChevronRight, ChevronDown, Plus, Trash2, X, Check, RefreshCw, Search,
  Table2, Loader2, Truck
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import { fetchTruckAvailability, fetchDriverAvailability, type DriverAvailability, type TruckAvailability, searchRelationshipOptions, getNextTripReference, getNextTripReferences, searchDispatches, type DispatchOption, type RelationshipOption } from "../../services/lookup.service";
import { tripCapacity } from "./tripCsv";
import type { TripPreviewRow } from "./TripTablePreview";
import ImportStoreProductsPreview, { type StoreProductPreviewRow } from "./ImportStoreProductsPreview";
import TripFormNotice from "./TripFormNotice";

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
    location_review?: LocationDecision;
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
  location?: LocationDecision; locationSaved?: boolean; editLocation: boolean; collapsed: boolean; items: ItemDraft[]; importNotes: string;
};
type TruckAssignmentDraft = { key: number; truckId: string; driverId: string; availabilityConfirmed?: boolean };

const EMPTY_LOOKUPS: Lookups = { "trip-types": [], warehouses: [], trucks: [], drivers: [], stores: [], products: [], customers: [] };
const STEPS = ["Trip details", "Stores & products", "Trucks", "Review & save"] as const;

const inputBase =
  "min-w-0 w-full rounded-xl border border-slate-200 bg-white text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2678b9] focus:ring-2 focus:ring-[#2678b9]/15 disabled:bg-slate-50 disabled:text-slate-500";
const input = `${inputBase} min-h-11 px-3.5 py-2.5`;
const inputSm = `${inputBase} min-h-10 px-3 py-2`;

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
      <span className="mb-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs font-semibold text-slate-700">
        {label}{required && <span className="ml-0.5 text-rose-500">*</span>}
        {hint && <span className="font-normal text-slate-500">{hint}</span>}
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.id === value);
  const q = query.trim().toLowerCase();
  const visible = q ? options.filter((o) => `${o.label} ${o.secondary ?? ""}`.toLowerCase().includes(q)) : options;
  const isDisabled = loading || disabled;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest("[data-dropdown-root]")) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey, true); };
  }, [open]);

  return (
    <div className="relative min-w-0" data-dropdown-root onKeyDown={event => {
      if (!open || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || event.target instanceof HTMLInputElement) return;
      const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-dropdown-option]:not(:disabled)")];
      if (!options.length) return;
      event.preventDefault();
      const index = options.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + options.length) % options.length;
      options[next]?.focus();
    }}>
      <button
        ref={triggerRef}
        type="button" aria-expanded={open} aria-label={placeholder} disabled={isDisabled} onClick={() => { setQuery(""); setOpen((o) => !o); }}
        className={`${compact ? inputSm : input} flex items-center justify-between gap-2 text-left hover:border-slate-300 ${focusRing} ${isDisabled ? "cursor-not-allowed" : ""}`}
      >
        <span className={`truncate ${selected ? "text-slate-800" : "text-slate-400"}`}>
          {loading ? "Loading…" : selected ? selected.label : placeholder}
          {!loading && selected?.secondary && <span className="ml-2 text-xs text-slate-400">{selected.secondary}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 max-h-72 w-full min-w-0 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/5">
          <div className="sticky top-0 border-b border-slate-100 bg-white p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); const first = visible.find(option => !option.disabled); if (first) { onChange(first.id); setOpen(false); } } else if (event.key === "ArrowDown") { event.preventDefault(); (event.currentTarget.closest("[data-dropdown-root]")?.querySelector("[data-dropdown-option]:not(:disabled)") as HTMLButtonElement | null)?.focus(); } }} placeholder="Search"
                aria-label={`Search ${placeholder.toLowerCase()}`} className="min-h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm outline-none focus:border-[#2678b9] focus:ring-2 focus:ring-blue-100" />
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
                <button key={o.id} data-dropdown-option disabled={o.disabled} type="button" onClick={() => { onChange(o.id); setOpen(false); triggerRef.current?.focus(); }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40 ${active ? "bg-[#2678b9]/10 font-medium text-[#1d5f94]" : "text-slate-700 hover:bg-slate-50"}`}>
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
  return <TripModalSteps labels={STEPS} current={current} onJump={onJump} isDisabled={() => Boolean(disabled)} label="New trip steps" />;
}

function Section({ title, description, children, className = "" }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return <SectionCard title={title} description={description} className={className}>{children}</SectionCard>;
}

/* ───────────────────────────── main component ───────────────────────────── */

export default function AddTripForm({
  onClose: onDismiss, onSubmit, onBack, active = true,
}: { onClose: () => void; onSubmit: (payload: NewTripPayload) => Promise<void>; onImported?: () => void; onBack?: () => void; active?: boolean }) {
  const { accessToken } = useAuth();
  const [lookups, setLookups] = useState<Lookups>(EMPTY_LOOKUPS);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [lookupError, setLookupError] = useState("");

  const [dispatchNo, setDispatchNo] = useState("");
  const [tripReference, setTripReference] = useState("");
  const [tripReferenceStatus, setTripReferenceStatus] = useState<"ready" | "setup_required" | "unavailable">("ready");
  const [tripReferenceLoading, setTripReferenceLoading] = useState(false);
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
  const status = "PLANNED";
  const [warehouseId, setWarehouseId] = useState("");
  // A creation request is replay-safe only while its payload is unchanged.
  const creationRequest = useRef<CreationRequest>({ payload: "", id: "" });
  const [cargoPlan, setCargoPlan] = useState(emptyCargoPlan);
  const allocationSession = useRef(createAllocationSession());
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
  const savingRef = useRef(false);
  const [saveOperation, setSaveOperation] = useState("Saving trip and its stops");
  const [error, setError] = useState("");
  const storeNavigation = useStoreWorkspaceMemory();
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
    if (!accessToken || step !== 2) return; let live = true;
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
  }, [accessToken, loadingDate, etaDate, availabilityRetry, step]);

  useEffect(() => {
    if (!accessToken || step !== 2) return; let current = true;
    queueMicrotask(() => { if (current) { setDriverScheduleLoading(true); setDriverScheduleError(""); } });
    const timer = setTimeout(() => {
      void fetchDriverAvailability(accessToken, loadingDate, etaDate).then(rows => { if (current) setDriverAvailability(rows); }).catch(cause => { if (current) setDriverScheduleError(cause instanceof Error ? cause.message : "Unable to check driver schedules."); }).finally(() => { if (current) setDriverScheduleLoading(false); });
    }, 200);
    return () => { current = false; clearTimeout(timer); };
  }, [accessToken, loadingDate, etaDate, availabilityRetry, step]);

  function rememberOption(kind: keyof Lookups, option: Option) { setLookups(current => ({ ...current, [kind]: [option, ...current[kind].filter(item => item.id !== option.id)] })); }
  
  /* Preview independent DISPATCH and TRIP references for the selected date. */
  const refDate = loadingDate || todayLocal();
  useEffect(() => {
    // A new dispatch and its first trip receive separate generated references.
    if (!accessToken || dispatchMode === "existing") return;
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
  useEffect(() => {
    if (!accessToken || dispatchMode !== "existing" || !existingDispatch) return;
    let active = true;
    queueMicrotask(() => { if (active) { setTripReferenceLoading(true); setTripReference(""); setDispatchError(""); } });
    getNextTripReference(accessToken, dispatchPrefix(refDate))
      .then(ref => { if (active) { setTripReference(ref.trip_reference ?? ""); setTripReferenceStatus(ref.trip_reference_status); } })
      .catch(cause => { if (active) { setTripReference(""); setTripReferenceStatus("unavailable"); setDispatchError(cause instanceof Error ? cause.message : "Could not preview the trip number."); } })
      .finally(() => { if (active) setTripReferenceLoading(false); });
    return () => { active = false; };
  }, [accessToken, dispatchMode, existingNo, refDate, dispatchRetry]);
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
    setDispatchMode(mode); setDispatchError(""); setError(""); setTripReference(""); setTripReferenceStatus("ready"); setTripReferenceLoading(false);
  }

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
      storeId, location: undefined, locationSaved: false, pendingDestination: "", customerId: location?.customer_id,
      customer: customer?.values?.customer_name ?? stops.find(stop => stop.key === stopKey)?.customer ?? "",
      city: location?.city ?? "",
      province: location?.province ?? "",
      address: location?.address ?? "",
    });
  }

  function stopLocation(stop: StopDraft): LocationDecision {
    const record = lookups.stores.find(option => option.id === stop.storeId)?.values;
    const matchingRecord = ["address", "province", "city"].every(field => String(stop[field as "address" | "province" | "city"]).trim() === String(record?.[field] ?? "").trim());
    return stop.location ?? { store_id: stop.storeId, address: stop.address, province: stop.province, city: stop.city,
      latitude: record?.latitude ?? "", longitude: record?.longitude ?? "", verified: matchingRecord && verifiedStoreCoordinates(record),
      store_verified: verifiedStoreCoordinates(record), pin_address_mismatch: !matchingRecord && Boolean(record?.latitude && record?.longitude), replace_verified: false };
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
    if (selectedTruckAssignments.some(assignment => driverAvailability.some(driver => driver.id === assignment.driverId && driver.availability === "CONFLICT"))) return "A selected driver has an overlapping active trip. Choose another driver or change the dates.";
    if (new Set(selectedTruckAssignments.map(a => a.driverId).filter(Boolean)).size !== selectedTruckAssignments.filter(a => a.driverId).length) return "A driver cannot drive two active trucks in the same trip.";
    if (dispatchMode === "existing" && !existingDispatch) return "Choose the dispatch this trip belongs to.";
    if (etaDate && loadingDate && etaDate < loadingDate) return "Estimated delivery can't be before the loading date.";
    for (const assignment of selectedTruckAssignments) { const state = availability.find(truck => truck.id === assignment.truckId); if (state?.availability === "CONFLICT") return "A selected truck is unavailable for these dates. Choose another truck."; }
    const assignedTruckIds = selectedTruckAssignments.map((assignment) => assignment.truckId);
    if (new Set(assignedTruckIds).size !== assignedTruckIds.length) return "Choose a different truck for each assignment.";
    if (truckAssignments.some((assignment) => assignment.driverId && !assignment.truckId)) return "Choose a truck before assigning a driver.";
    if (stops.some(stop => stop.items.some(item => hasItemData(item) && !storableItem(item)))) return "Correct product quantity and CBM before saving. No product row will be omitted.";
    // A selected truck must carry every product row before the trip is saved.
    if (cargoPlan.placements.length || (cargoLines.length && cargoTrucks.length)) {
      if (cargoTrucks.length > 1 && cargoTrucks.some(truck => !truck.driverId)) return "Assign a driver to every truck before confirming multi-truck cargo.";
      const cargoProblem = validateCargo(cargoLines, cargoTrucks, cargoPlan.placements);
      if (cargoProblem) return cargoProblem;
    }
    return "";
  }

  const storableItem = (item: ItemDraft) => [item.qty, item.unitCbm, item.cbm].every(value => !value.trim() || /^\d+(?:\.\d+)?$/.test(value.trim().replaceAll(",", "")) && Number.isFinite(num(value)) && num(value) >= 0);

  function goTo(target: number) {
    if (saving) return;
    if (target <= step) { setError(""); setStep(target); bodyRef.current?.scrollTo({ top: 0 }); return; }
    const problem = target >= 3 ? validateTrip() : dispatchMode === "existing" && !existingDispatch ? "Choose the dispatch this trip belongs to." : etaDate && loadingDate && etaDate < loadingDate ? "Estimated delivery cannot be before loading." : "";
    setError(problem);
    if (!problem) { setStep(target); bodyRef.current?.scrollTo({ top: 0 }); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    if (step < STEPS.length - 1) { goTo(step + 1); return; }
    const problem = validateTrip();
    if (problem) return setError(problem);
    savingRef.current = true;
    setError(""); setSaveOperation("Saving trip, stops, trucks and cargo"); setSaving(true);
    try {
      const bundle = {
        dispatch_mode: dispatchMode,
        cargo_plan: cargoPlan.placements.length ? { ...cargoPlan, trucks: cargoTrucks, signature: cargoSignature(cargoLines, cargoTrucks), confirmed: true } : undefined,
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
        stops: stops.filter(hasStopData).map((stop, index) => {
          const location = stopLocation(stop);
          return ({
          stop_sequence: index + 1,
          location_review: location.verified && location.update_store_location !== undefined ? { ...location, update_store_location: false } : undefined,
          destination: !stop.storeId && stop.pendingDestination ? { name: stop.pendingDestination, customer_id: stop.customerId || "", customer_name: stop.customer, province: stop.province, city: stop.city, address: stop.address } : undefined,
          store_id: stop.storeId || null,
          customer_id: lookups.stores.find((o) => o.id === stop.storeId)?.values?.customer_id || stop.customerId || null,
          remarks: [stop.customer && `Customer: ${stop.customer}`, stop.province && `Province: ${stop.province}`, stop.city && `City: ${stop.city}`, stop.address && `Ship-to address: ${stop.address}`, stop.importNotes].filter(Boolean).join(" · ") || null,
          line_items: stop.items.filter(item => hasItemData(item) && storableItem(item)).map((item) => {
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
        }); }),
      } satisfies Omit<NewTripPayload, "request_id">;
      // An identical retry replays the same creation request so a lost response
      // cannot create a second trip; any edit receives a fresh request identity.
      creationRequest.current = nextCreationRequest(creationRequest.current, bundle);
      await onSubmit({ request_id: creationRequest.current.id, ...bundle });
      setSaveOperation("Trip saved");
      onClose();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to create the trip.";
      if (/already exists/i.test(message)) {
        setDispatchRetry((n) => n + 1);
        setError(dispatchMode === "existing"
          ? "Someone just added a trip to this dispatch. The trip number has been updated — review it and create the trip again."
          : "That dispatch reference was just taken. A new one has been generated — review it and create the trip again.");
      } else setError(`${message} Check the details and try Save trip again. Your entries are still here.`);
    } finally { savingRef.current = false; setSaving(false); }
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
  const previewRows = populatedStops.flatMap<TripPreviewRow & { storeOnly?: boolean; navigationStore?: string; navigationRow?: string; locationVerified?: boolean }>(stop => {
    const items = stop.items.filter(hasItemData);
    const base: TripPreviewRow & { navigationStore: string; locationVerified: boolean } = { navigationStore: `stop:${stop.key}`, locationVerified: stopLocation(stop).verified, ...previewTrip, store: labelOf(lookups.stores, stop.storeId) || stop.pendingDestination || "Unassigned", customer: stop.customer, province: stop.province, city: stop.city };
    return items.length ? items.map(item => ({ ...base, navigationRow: `item:${item.key}`, product: productLabel(item) || "", category: item.category, qty: item.qty, unitCbm: item.unitCbm, cbm: item.cbm, dr: item.dr, sapSo: item.sapSo, customerPo: item.customerPo, po: item.po, notes: [remarks, stop.importNotes, stop.address && `Ship-to address: ${stop.address}`, item.sp && `SP: ${item.sp}`, item.dn && `DN: ${item.dn}`, item.so && `SO: ${item.so}`, item.itemStatus && `Source status: ${item.itemStatus}`, item.warehouse && `Source warehouse: ${item.warehouse}`, item.importNotes].filter(Boolean).join(" · ") })) : [{ ...base, storeOnly: true, notes: [remarks, stop.importNotes, stop.address].filter(Boolean).join(" · ") }];
  });

  const storePreviewRows: StoreProductPreviewRow[] = previewRows.map(row => ({
    source_identity: row.navigationRow ?? row.navigationStore ?? "manual", navigation_store_id: row.navigationStore, navigation_row_id: row.navigationRow ?? row.navigationStore, location_verified: row.locationVerified, group: tripReference || "New trip", preview: Object.fromEntries(Object.entries(row).filter(([key]) => !["navigationStore", "navigationRow", "locationVerified", "storeOnly"].includes(key))) as TripPreviewRow,
    store_only: row.storeOnly,
    values: { ship_to: row.store ?? null, customer_name: row.customer ?? null,
      province: row.province ?? null, city: row.city ?? null, customer_model: row.product ?? null,
      product_category: row.category ?? null, quantity: row.qty ?? null,
      unit_cbm: row.unitCbm ?? null, cbm: row.cbm ?? null, dr_number: row.dr ?? null },
  }));

  const storeItems: StoreNavigationItem[] = stops.map(stop => {
    const total = stopTotals(stop), products = stop.items.filter(hasItemData);
    return { id: `stop:${stop.key}`, title: labelOf(lookups.stores, stop.storeId) || stop.pendingDestination || "Select a destination store", customer: stop.customer, city: stop.city, province: stop.province,
      products: products.length, qty: total.qty, cbm: total.cbm,
      status: products.some(item => invalidProduct({ customer_model: productLabel(item), quantity: item.qty, cbm: item.cbm })) ? "attention" : !stop.storeId || !stop.address.trim() ? "location" : "ready",
      members: [`stop:${stop.key}`, ...stop.items.map(item => `item:${item.key}`)],
      searchText: [labelOf(lookups.stores, stop.storeId), stop.pendingDestination, stop.customer, stop.city, stop.province, ...stop.items.flatMap(item => [productLabel(item), item.dr])].join(" ") };
  });

  /* ───────────────────────────── render ───────────────────────────── */
  const addStop = () => { const stop = newStop(); storeNavigation.selected = `stop:${stop.key}`; storeNavigation.members = [`stop:${stop.key}`]; storeNavigation.search = ""; setStops(list => [...list, stop]); };
  const storeToolbar = <button type="button" aria-pressed={stopsView === "preview"} title={stopsView === "preview" ? "Edit stops" : "Table preview"} onClick={() => setStopsView(stopsView === "preview" ? "edit" : "preview")} className="stops-view-toggle"><Table2 size={14} /><span>{stopsView === "preview" ? "Edit stops" : "Table preview"}</span></button>;
  const excludedManualRows = stops.flatMap((stop, index) => stop.items.filter(item => hasItemData(item) && !storableItem(item)).map(item => `Stop ${index + 1}: ${productLabel(item) || item.dr || "Product line"} — invalid quantity or CBM`));
  const manualStoresReady = populatedStops.length > 0 && populatedStops.every(stop => Boolean(stop.storeId || stop.pendingDestination));
  const manualProductsReady = totals.lines > 0 && excludedManualRows.length === 0;
  const manualCapacityReady = totals.cbm === 0 || totals.cbm <= assignedCapacity && selectedTruckAssignments.length > 0;
  const manualDriversReady = selectedTruckAssignments.length === 0 || selectedTruckAssignments.every(assignment => Boolean(assignment.driverId));
  const manualPercent = assignedCapacity > 0 ? Math.round(totals.cbm / assignedCapacity * 100) : 0;
  const { ref: dialogRef, close: onClose } = useTripModal<HTMLFormElement>({ onClose: onDismiss, active, onEscape: () => { if (!saving) onClose(); } });
  
  return (
    <div className={`${tripModalBackdrop} z-[2000]`}>
      <form noValidate ref={dialogRef} tabIndex={-1} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="add-trip-title" aria-describedby="add-trip-title-description"
        aria-busy={saving}
        className={`${tripModalShell} csv-trip-modal manual-trip-modal`}>

        {/* Shared header and navigation keep both planning flows consistent. */}
        <TripModalHeader id="add-trip-title" title="Add trip manually" description="Create a trip in four steps." subtitle="Operations / Trips · Four quick steps" icon={<Truck className="h-6 w-6" />} disabled={saving} onBack={onBack} onClose={onClose} closeLabel="Close" />
        <Tabs current={step} onJump={goTo} disabled={saving} />

        {/* body */}
        <div ref={bodyRef} className="trip-flow-body" data-manual-phase={step}>
          <div className="csv-workspace"><main key={step} className="csv-main manual-main">
            {error && <div id="manual-trip-errors"><TripFormNotice tone="error" title="Check the trip details" onDismiss={() => setError("")}>{error}</TripFormNotice></div>}
            {lookupError && <TripFormNotice tone="warning" title="Some lists could not load">{lookupError} You can continue with blank fields and complete them later.</TripFormNotice>}

            {/* ── step 1: trip ── */}
            {step === 0 && (
              <div className="manual-step-stack">
                <section aria-label="Dispatch setup" className="trip-section manual-card">
                  <h3>Dispatch</h3>
                  <div className="trip-dispatch-row">
                    <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Dispatch">{([["new", "New"], ["existing", "Existing"]] as const).map(([mode, label]) => <button key={mode} type="button" aria-pressed={dispatchMode === mode} onClick={() => switchDispatchMode(mode)} className={`rounded-md px-4 py-1 text-xs ${dispatchMode === mode ? "bg-white font-semibold text-[#0b2341]" : "text-slate-500"}`}>{label}</button>)}</div>
                    {dispatchMode === "new" ? <div className="trip-dispatch-reference"><code>{dispatchBusy ? "Generating…" : dispatchRef || "Generated on save"}</code><button type="button" aria-label="Get a new number" title="Get a new number" onClick={() => setDispatchRetry(n => n + 1)} disabled={dispatchLoading} className={tripSecondaryAction}><RefreshCw aria-hidden="true" size={14} className={dispatchLoading ? "animate-spin" : ""} /></button></div> : <div className="min-w-0 flex-1"><Dropdown value={existingNo} onChange={pickExistingDispatch} options={dispatchOptionList} placeholder="Search dispatch number" loading={dispatchesLoading} /></div>}
                  </div>
                  {dispatchMode === "existing" && existingDispatch && <p className="mt-2 text-xs text-slate-500">{existingDispatch.trip_count} existing trips · This adds one trip to the selected dispatch.</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500"><span>Trip no.</span><code className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-[#0b2341]">{dispatchMode === "existing" && !existingDispatch ? "Choose a dispatch" : dispatchLoading || tripReferenceLoading ? "Generating…" : tripReference || (tripReferenceStatus === "setup_required" ? "Not yet enabled" : "Generated on save")}</code><span>Trip in dispatch</span><code className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-[#0b2341]">{tripNumber || "Choose a dispatch"}</code></div>
                  {dispatchError && <div className="mt-3"><TripFormNotice tone="warning" title={dispatchMode === "existing" ? "Trip number unavailable" : "Dispatch reference unavailable"} action={<button type="button" onClick={() => setDispatchRetry(value => value + 1)} className={tripSecondaryAction}>Try again</button>}>{dispatchError}{dispatchMode === "new" && " A reference will be generated when you save."}</TripFormNotice></div>}
                </section>

                <section aria-label="Schedule" className="trip-section manual-card"><div className="mb-3 flex items-center gap-2"><h3>Trip details</h3></div>
                  <div className="trip-schedule-grid">
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
                    <Field label="Loading date" >
                      <input type="date" value={loadingDate} onChange={(e) => setLoadingDate(e.target.value)} className={input} />
                    </Field>
                    <Field label="Estimated delivery" >
                      <input type="date" min={loadingDate || undefined} value={etaDate} aria-invalid={Boolean(etaDate && loadingDate && etaDate < loadingDate)} aria-describedby={etaDate && loadingDate && etaDate < loadingDate ? "trip-delivery-error" : undefined} onChange={(e) => setEtaDate(e.target.value)} className={input} />
                      {etaDate && loadingDate && etaDate < loadingDate && <span id="trip-delivery-error" role="alert" className="mt-2 block text-xs leading-5 text-rose-700">Choose a delivery date on or after the loading date.</span>}
                    </Field>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Trip number is assigned automatically. New trips start as planned.</p>
                </section>
                <details className="csv-card csv-details"><summary>Optional details</summary><div className="manual-optional-fields"><Field label="Origin warehouse">{accessToken && <SearchableRelationshipEditor presentation="form" token={accessToken} kind="warehouses" value={labelOf(lookups.warehouses, warehouseId) ?? ""} autoFocus={false} disabled={saving} onSelect={option => { rememberOption("warehouses", option); setWarehouseId(option.id); }} onCommitBlur={() => {}} onCancel={() => {}} />}</Field><Field label="Notes"><input value={remarks} onChange={event => setRemarks(event.target.value)} className={input} placeholder="Anything the delivery team should know" /></Field></div></details>
              </div>
            )}

            {/* ── step 2: stores & products ── */}
            {step === 1 && (
              <div className="manual-stores-card">
                <div className="manual-stores-heading"><h3>Stores &amp; products</h3><span>{populatedStops.length} stores · {totals.lines} product rows</span></div>
                {stopsView === "preview" ? (
                  populatedStops.length > 0
                    ? <ImportStoreProductsPreview rows={storePreviewRows} navigation={storeNavigation} toolbar={storeToolbar} onAdd={addStop} disabled={saving} />
                    : (
                      <StoreMasterDetail items={storeItems} memory={storeNavigation} toolbar={storeToolbar} onAdd={addStop} disabled={saving}>{() => <p className="py-8 text-sm text-slate-500">No products yet. Choose Edit stops to add products.</p>}</StoreMasterDetail>
                    )
                ) : (
                  <div className="space-y-6">
                    {<StoreMasterDetail items={storeItems} memory={storeNavigation} toolbar={storeToolbar} onAdd={addStop} disabled={saving}>{selectedStore => {
                      const stop = stops.find(candidate => `stop:${candidate.key}` === selectedStore.id)!;
                      const si = stops.indexOf(stop);
                      const t = stopTotals(stop);
                      const storeName = labelOf(lookups.stores, stop.storeId) || stop.pendingDestination || "";
                      const lineCount = stop.items.filter(hasItemData).length;
                      
                      return <StoreEditor key={stop.key} number={si + 1} name={storeName} summary={`${lineCount} product${lineCount === 1 ? "" : "s"} · ${fmt(t.qty, 0)} qty · ${fmt(t.cbm)} CBM`} editing={stop.editLocation} disabled={saving} formDisabled={saving}
                        onEdit={() => updateStop(stop.key, { editLocation: !stop.editLocation })}
                        actions={stops.length > 1 && <button type="button" disabled={saving} onClick={() => setStops(list => list.filter(candidate => candidate.key !== stop.key))} aria-label={`Remove stop ${si + 1}`} className="store-remove"><Trash2 size={14} /></button>}
                        deliveryStore={<DeliveryStoreField key={stop.key} name={storeName} selected={Boolean(stop.storeId)} disabled={saving}>{onPicked => accessToken && <SearchableRelationshipEditor presentation="form" token={accessToken} kind="stores" value={storeName} customerId={stop.customerId} createDefaults={{ address: stop.address, city: stop.city, province: stop.province }} autoFocus={false} disabled={saving} onSelect={option => { pickStore(stop.key, option.id, option); onPicked(); }} onCommitBlur={() => {}} onCancel={() => {}} />}</DeliveryStoreField>}
                        address={<div className="trip-delivery-address"><span>Delivery address</span><p>{[stop.address, stop.city, stop.province].filter(Boolean).join(", ") || "Choose a store to fill its address."}</p></div>}
                        details={stop.editLocation && (
                              <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Customer name"><input value={stop.customer} onChange={(e) => updateStop(stop.key, { customer: e.target.value })} className={input} /></Field>
                                <Field label="Province"><input value={stop.province} onChange={(e) => updateStop(stop.key, { province: e.target.value, locationSaved: false, location: { ...stopLocation(stop), province: e.target.value, store_verified: stopLocation(stop).verified || stopLocation(stop).store_verified, verified: false, pin_address_mismatch: true } })} className={input} /></Field>
                                <Field label="City"><input value={stop.city} onChange={(e) => updateStop(stop.key, { city: e.target.value, locationSaved: false, location: { ...stopLocation(stop), city: e.target.value, store_verified: stopLocation(stop).verified || stopLocation(stop).store_verified, verified: false, pin_address_mismatch: true } })} className={input} /></Field>
                                <Field label="Ship-to address"><input value={stop.address} onChange={(e) => updateStop(stop.key, { address: e.target.value, locationSaved: false, location: { ...stopLocation(stop), address: e.target.value, store_verified: stopLocation(stop).verified || stopLocation(stop).store_verified, verified: false, pin_address_mismatch: true } })} className={input} /></Field>
                              </div>
                            )}
                        products={<ProductsSection rows={stop.items} storeId={`stop:${stop.key}`} memory={storeNavigation} disabled={saving}
                              rowKey={item => `item:${item.key}`} searchText={item => [productLabel(item), item.dr, item.dn, item.so, item.sapSo, item.customerPo, item.po, item.category, item.importNotes].join(" ")}
                              columns={[
                                { key: "code", label: "Product code", render: item => <div className="min-w-48">{item.addingProduct ? (
                                          <div className="flex items-center gap-1.5">
                                            <div className="relative min-w-0 flex-1">
                                              <input disabled={saving} autoFocus value={item.newCode} onChange={(e) => updateItem(stop.key, item.key, { newCode: e.target.value })}
                                                className={`${inputSm} pr-12`} placeholder="Type the new product code" />
                                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded bg-[#2678b9]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#2678b9]">New</span>
                                            </div>
                                            <button type="button" disabled={saving} aria-label="Cancel new product code"
                                              onClick={() => updateItem(stop.key, item.key, { addingProduct: false, newCode: "" })}
                                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4" /></button>
                                          </div>
                                        ) : (
                                          accessToken ? <div className="min-w-0"><SearchableRelationshipEditor presentation="form" token={accessToken} kind="products" value={labelOf(productOptions, item.productId) ?? ""} autoFocus={false} disabled={saving} onSelect={option => pickProduct(stop.key, item.key, option.id, option)} onCommitBlur={() => {}} onCancel={() => {}} /></div> : null
                                        )}</div> },
                                { key: "qty", label: "Qty", render: item => <input disabled={saving} type="number" inputMode="numeric" min="0" step="any" value={item.qty} aria-label="Quantity" onChange={e => updateItem(stop.key, item.key, { qty: e.target.value })} className={inputSm} placeholder="0" /> },
                                { key: "cbm", label: "CBM", render: item => <input disabled={saving} type="number" inputMode="decimal" min="0" step="any" value={item.cbm} aria-label="Total CBM" onChange={e => updateItem(stop.key, item.key, { cbm: e.target.value })} className={inputSm} placeholder="0" /> },
                                { key: "dr", label: "DR", render: item => <input disabled={saving} value={item.dr} aria-label="DR number" onChange={e => updateItem(stop.key, item.key, { dr: e.target.value })} className={inputSm} placeholder="DR number" /> },
                                { key: "status", label: "Status", render: item => <StatusChip label={!hasItemData(item) ? "Empty line" : invalidProduct({ customer_model: productLabel(item), quantity: item.qty, cbm: item.cbm }) ? "Needs attention" : "Not saved"} tone={hasItemData(item) && invalidProduct({ customer_model: productLabel(item), quantity: item.qty, cbm: item.cbm }) ? "warning" : "neutral"} /> },
                              ]}
                              isExpanded={item => item.open} onToggle={item => updateItem(stop.key, item.key, { open: !item.open })}
                              moreLabel={item => item.open ? "Hide more details" : "Show more details"}
                              hasMore={item => [item.sp, item.dn, item.so, item.sapSo, item.customerPo, item.po, item.category, item.unitCbm, item.itemStatus, item.warehouse].some(value => value.trim())}
                              onAdd={() => updateStop(stop.key, { items: [...stop.items, newItem()] })}
                              canRemove={() => stop.items.length > 1} onRemove={item => updateStop(stop.key, { items: stop.items.filter(candidate => candidate.key !== item.key) })}
                              removeLabel={(_item, index) => `Remove product line ${index + 1}`}
                              renderMore={item => <div className="border-t border-slate-100 bg-slate-50 p-5 space-y-5">
                                        <div>
                                          <p className="mb-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">Order references</p>
                                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                            {([["SP number", "sp"], ["DN no.", "dn"], ["SO no.", "so"], ["SAP SO no.", "sapSo"], ["Customer PO", "customerPo"], ["PO no.", "po"]] as const).map(([label, field]) => (
                                              <Field key={field} label={label}>
                                                <input disabled={saving} value={item[field]} onChange={(e) => updateItem(stop.key, item.key, { [field]: e.target.value })} className={inputSm} />
                                              </Field>
                                            ))}
                                          </div>
                                        </div>
                                        <div>
                                          <p className="mb-3 text-xs font-semibold text-slate-700 uppercase tracking-wider">Product details</p>
                                          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                            <Field label="Product category" hint={item.addingProduct ? "saved with new code" : undefined}>
                                              <input disabled={saving} value={item.category} onChange={(e) => updateItem(stop.key, item.key, { category: e.target.value })} className={inputSm} placeholder="AC, REF, WM…" />
                                            </Field>
                                            <Field label="Unit CBM">
                                              <div className="flex gap-2">
                                                <input disabled={saving} type="number" min="0" step="any" value={item.unitCbm} onChange={(e) => updateItem(stop.key, item.key, { unitCbm: e.target.value })} className={inputSm} />
                                                <button type="button" title="Total CBM = qty × unit CBM"
                                                  disabled={saving || Boolean(item.cbm.trim()) || !Number.isFinite(num(item.unitCbm)) || num(item.unitCbm) < 0 || !(num(item.qty) > 0)}
                                                  onClick={() => updateItem(stop.key, item.key, { cbm: calculatedCbm(item.qty, item.unitCbm), importNotes: [item.importNotes, "Total CBM calculated from quantity and unit CBM."].filter(Boolean).join(" / ") })}
                                                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-[#2678b9] hover:border-[#2678b9]/40 disabled:text-slate-300 disabled:hover:border-slate-200 transition-colors">
                                                  Calculate
                                                </button>
                                              </div>
                                            </Field>
                                            <Field label="Item status">
                                              <input disabled={saving} value={item.itemStatus} onChange={(e) => updateItem(stop.key, item.key, { itemStatus: e.target.value })} className={inputSm} />
                                            </Field>
                                            <Field label="Source warehouse" hint="if different">
                                              <input disabled={saving} value={item.warehouse} onChange={(e) => updateItem(stop.key, item.key, { warehouse: e.target.value })} className={inputSm} />
                                            </Field>
                                          </div>
                                        </div>
                                        {item.importNotes && <Field label="Notes"><textarea disabled={saving} value={item.importNotes} onChange={(event) => updateItem(stop.key, item.key, { importNotes: event.target.value })} className={`${inputBase} min-h-16 p-2 text-xs`} /></Field>}
                                      </div>} />}>
                        {stop.importNotes && <Field label="Stop notes"><textarea value={stop.importNotes} onChange={event => updateStop(stop.key, { importNotes: event.target.value })} className={`${inputBase} p-3 text-xs`} /></Field>}
                      </StoreEditor>;
                    }}</StoreMasterDetail>}


                  </div>
                )}
              </div>
            )}

            {/* ── step 3: assignments & cargo ── */}
            {step === 2 && (
              <div className="trip-assignments trip-simple-assignments">
                
                {/* Left Column: Truck & Driver Assignments */}
                <div className="trip-assignment-fields space-y-6">
                  <Section title="Trucks & drivers">
                    {selectedTruckAssignments.length > 0 && (availabilityLoading || availabilityError) && <p className="mb-3 text-xs text-amber-800">{availabilityLoading ? "Checking truck availability. Optional details can be completed later." : "Truck availability could not be checked."}{availabilityError && <button type="button" className="ml-2 underline" onClick={() => setAvailabilityRetry(value => value + 1)}>Retry availability</button>}</p>}
                    {selectedTruckAssignments.some(assignment => assignment.driverId) && (driverScheduleLoading || driverScheduleError) && <p className="mb-3 text-xs text-amber-800">{driverScheduleLoading ? "Checking driver availability. This does not prevent saving a planned trip." : "Driver availability could not be checked. The server will validate assignments when saving."}</p>}
                    <div className="trip-simple-manual-trucks">
                      {truckAssignments.map((assignment, index) => {
                        const chosenTruck = lookups.trucks.find(truck => truck.id === assignment.truckId);
                        const capacity = Number(chosenTruck?.values?.capacity_cbm);
                        const truckState = availability.find(truck => truck.id === assignment.truckId);
                        return <div key={assignment.key} data-truck-fields="" className="trip-simple-manual-truck">
                          <div><strong>Truck {index + 1}</strong><span>{Number.isFinite(capacity) && capacity > 0 ? `${fmt(capacity)} CBM capacity` : ""}</span></div>
                          <button type="button" aria-label={chosenTruck ? `Change truck ${chosenTruck.label}` : "Choose truck"} className={tripSecondaryAction} disabled={saving} onClick={() => setTruckPickerKey(assignment.key)}>{chosenTruck?.label || "Choose truck"}</button>
                          {truckPickerKey === assignment.key && accessToken && <TruckPicker token={accessToken} start={loadingDate} end={etaDate} selectedIds={truckAssignments.filter(other => other.key !== assignment.key).map(other => other.truckId).filter(Boolean)} onClose={() => setTruckPickerKey(null)} onSelect={option => { rememberOption("trucks", option); setTruckPickerKey(null); setTruckAssignments(current => current.map(item => item.key !== assignment.key ? item : { ...item, truckId: option.id, driverId: current.some(other => other.key !== item.key && other.driverId === option.values?.default_driver_id) || driverAvailability.some(driver => driver.id === option.values?.default_driver_id && driver.availability === "CONFLICT") ? "" : option.values?.default_driver_id || "", availabilityConfirmed: false })); }} />}
                          <label>Driver<Dropdown value={assignment.driverId} onChange={driverId => setTruckAssignments(current => current.map(item => item.key === assignment.key ? { ...item, driverId } : item))} options={lookups.drivers.filter(driver => !truckAssignments.some(other => other.key !== assignment.key && other.driverId === driver.id) && !driverAvailability.some(state => state.id === driver.id && state.availability === "CONFLICT"))} placeholder="Choose driver" loading={loadingLookups} disabled={!assignment.truckId} /></label>
                          {truckAssignments.length > 1 && <button type="button" onClick={() => setTruckAssignments(current => current.filter(item => item.key !== assignment.key))} aria-label={`Remove truck ${index + 1}`} className="trip-simple-remove"><Trash2 size={16} /></button>}
                          {truckState?.availability === "CONFLICT" && <p role="alert">This truck is booked for the selected dates.</p>}
                        </div>;
                      })}
                    </div>                    <button type="button" onClick={() => { addCapacityTruck(); setAvailabilityRetry(value => value + 1); }} className="mt-4 w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition">
                      + Add another truck
                    </button>

                  </Section>
                </div>

                {/* Right Column: Cargo Distribution */}
                <div className="min-w-0">
                  {accessToken && cargoLines.length > 0 && selectedTruckAssignments.length > 0 ? (
                    <div className="min-w-0">
                      <TripCargoPlanner simple token={accessToken} lines={cargoLines} plan={cargoPlan} onChange={setCargoPlan} fixedTrucks={cargoTrucks} truckTypes={Object.fromEntries(lookups.trucks.map(truck => [truck.id, truck.values?.truck_type || ""]))} session={allocationSession.current} excludedTruckIds={cargoTrucks.filter(truck => availability.some(state => state.id === truck.id && state.availability === "CONFLICT") || driverAvailability.some(state => state.id === truck.driverId && state.availability === "CONFLICT")).map(truck => truck.id)} onAddTruck={addCapacityTruck} disabled={saving} />
                    </div>
                  ) : (
                    <p className="py-3 text-xs text-slate-500">Add a truck and product lines to distribute cargo.</p>
                  )}
                </div>
              </div>
            )}
            {step === 3 && <div className="manual-step-stack">
              <section className="csv-review-card" aria-label="Review before saving"><div className="csv-review-total"><span>REVIEW · {dispatchMode === "existing" ? "EXISTING DISPATCH" : "NEW DISPATCH"}</span><strong>{fmt(totals.cbm, 4)} <small>CBM</small></strong><div className="csv-review-track"><span style={{ width: `${assignedCapacity > 0 ? Math.min(100, manualPercent) : 0}%` }} /></div><p>{manualPercent}% of {fmt(assignedCapacity)} CBM · {previewTrip.plate || "No trucks yet"}</p></div><div className="csv-review-stats"><div><span>Trip</span><strong>1</strong></div><div><span>Trucks</span><strong>{selectedTruckAssignments.length}</strong></div><div><span>Stores</span><strong>{populatedStops.length}</strong></div><div><span>Product rows</span><strong>{totals.lines}</strong></div></div></section>
              <section className="csv-card manual-review-details"><h3>Trip summary</h3><p>Dispatch: {dispatchRef || "Generated on save"}</p><p>Trip no.: {previewTrip.trip}</p><p>Trip in dispatch: {tripNumber || "Choose a dispatch"}</p>{tripTypeLabel && <p>Trip type: {tripTypeLabel}</p>}{loadingDate && <p>Loading: {loadingDate}</p>}{etaDate && <p>Estimated delivery: {etaDate}</p>}</section>
              {(populatedStops.length > 0 || excludedManualRows.length > 0) && <details className="csv-card csv-details"><summary>Technical details</summary>
                {populatedStops.length > 0 && <ol className="trip-review-stops">{populatedStops.map((stop, index) => <li key={stop.key}><strong>{index + 1}. {labelOf(lookups.stores, stop.storeId) || stop.pendingDestination || "Store to assign"}</strong><span>{[stop.address, stop.city, stop.province].filter(Boolean).join(", ") || "Address to add"}</span><small>{stop.items.filter(hasItemData).length} products · {fmt(stopTotals(stop).cbm)} CBM</small></li>)}</ol>}
                {excludedManualRows.map((reason, index) => <p key={index} className="text-rose-700">{reason}</p>)}
              </details>}{saving && <TripSaveProgress value={null} operation={saveOperation} />}
            </div>}
          </main><div className="csv-side-column">
            {step === 0 && <CsvSidePanel title="Trip setup" items={[{ label: dispatchMode === "new" ? "New dispatch" : "Existing dispatch selected", done: dispatchMode === "new" || Boolean(existingDispatch) }, { label: "Dates in order", done: !etaDate || !loadingDate || etaDate >= loadingDate }, { label: "Trip number generated on save", done: true }]} note="Set the details you know now. Optional fields can be added later." />}
            {step === 1 && <CsvSidePanel title="Stores & products" items={[{ label: `${populatedStops.length} store${populatedStops.length === 1 ? "" : "s"} entered`, done: manualStoresReady }, { label: `${totals.lines} product row${totals.lines === 1 ? "" : "s"} entered`, done: totals.lines > 0 }, { label: "Product quantities and CBM valid", done: manualProductsReady }]} note="Choose a store, then add product rows. You can return to any stop before saving." />}
            {step === 2 && <CsvSidePanel title="Truck allocation" items={[{ label: `${selectedTruckAssignments.length} truck${selectedTruckAssignments.length === 1 ? "" : "s"} selected`, done: selectedTruckAssignments.length > 0 || totals.cbm === 0 }, { label: "Capacity covers total CBM", done: manualCapacityReady }, { label: "Drivers assigned", done: manualDriversReady }]} note="Cargo is allocated across the trucks you select." />}
            {step === 3 && <CsvSidePanel title="Before saving" items={[{ label: dispatchMode === "new" ? "New dispatch ready" : "Existing dispatch selected", done: dispatchMode === "new" || Boolean(existingDispatch) }, { label: "Product rows valid", done: excludedManualRows.length === 0 }, { label: "Truck capacity checked", done: manualCapacityReady }, { label: "Drivers assigned", done: manualDriversReady }]} note="The trip is created only when you save." />}
          </div></div>
        </div>

        {/* footer */}
        <footer className={tripFooter}>
          <div className="trip-footer-row">
            <span className="trip-footer-meta">Step {step + 1} of {STEPS.length}</span>
            <div className="trip-footer-actions">
              {error && <button type="button" className="trip-footer-hint" onClick={() => document.getElementById("manual-trip-errors")?.scrollIntoView({ block: "start" })}>Review the trip details</button>}
              {saving && <span className="text-xs text-slate-500">{saveOperation}</span>}
                {step === 0 ? (
                  <button type="button" onClick={onClose} disabled={saving} className={tripSecondaryAction}>Cancel</button>
                ) : (
                  <button type="button" onClick={() => goTo(Math.max(0, step - 1))} disabled={saving} className={tripSecondaryAction}>
                    <ChevronLeft className="h-4 w-4" /> Back
                  </button>
                )}
                <button type="submit" disabled={saving} className={`${tripPrimaryAction} min-w-36`}>
                   {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving trip…</> : isLast ? "Save trip" : <>Continue <ChevronRight className="h-4 w-4" /></>}
                </button>
            </div>
          </div>
        </footer>
      </form>
    </div>
  );
}
