import TripCargoPlanner from "./TripCargoPlanner";
import { cargoSignature, calculatedCbm, emptyCargoPlan, validateCargo, type CargoLine, type CargoTruck } from "../../services/cargo-planning";
// src/pages/Admin/views/AddTripForm.tsx
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ChevronLeft, ChevronRight, ChevronDown, Plus, Trash2, X, Check, RefreshCw, Search,
  MapPin, Pencil, SlidersHorizontal, Package, Upload, FileSpreadsheet, Loader2,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import { fetchTruckAvailability, fetchDriverAvailability, type DriverAvailability, type TruckAvailability, searchRelationshipOptions, getNextTripReferences, searchDispatches, type DispatchOption, type RelationshipOption } from "../../services/lookup.service";
import { readTripCsv, csvNumber, csvDate, tripCapacity, type CsvTripGroup } from "./tripCsv";
import TripTablePreview, { type TripPreviewRow } from "./TripTablePreview";
import TripFormNotice from "./TripFormNotice";
import BulkTripImport from "./BulkTripImport";
import { resolveTripCsvLookups } from "./tripCsvLookups";

export type NewTripPayload = {
  request_id: string;
  dispatch_mode: "new" | "existing";
  cargo_plan?: ReturnType<typeof emptyCargoPlan>;
  trip: {
    dispatch_number: string | null;
    trip_number: number; // 1 for a new dispatch, next number when added to an existing one
    loading_date: string | null; // optional — can be set later
    estimated_delivery_date: string | null;
    status: string;
    trip_type_id: string | null;
    trip_type_name: string | null; // a brand-new trip type typed in; backend finds or creates it
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
    destination?: Record<string,string>;
    store_id: string | null;
    customer_id: string | null;
    remarks: string | null;
    line_items: Array<{
      product_id: string | null;
      new_product_code: string | null; // a brand-new product code typed in; backend finds or creates it
      new_product_category: string | null;
      dr_number: string | null;
      sap_so_number: string | null;
      customer_po_number: string | null;
      internal_po_number: string | null;
      remarks: string | null;
      quantity: string | null;
      [sourceField:string]:unknown;
      cbm: string | null;
    }>;
  }>;
};

type Option = RelationshipOption & {disabled?:boolean};
type Lookups = Record<"trip-types" | "warehouses" | "trucks" | "drivers" | "stores" | "products" | "customers", Option[]>;
type ItemDraft = {
  key: number; productId: string; newCode: string; addingProduct: boolean; open: boolean;
  dr: string; dn: string; sp: string; so: string; sapSo: string; customerPo: string; po: string;
  sourceModel:string; phTruck: string; orderItem: string; stocks: string; approvalDate: string;
  category: string; unitCbm: string; itemStatus: string; warehouse: string; qty: string; cbm: string; importNotes: string;
};
type StopDraft = {
  key: number; storeId: string; pendingDestination?:string; customerId?:string; customer: string; city: string; province: string; address: string;
  editLocation: boolean; collapsed: boolean; items: ItemDraft[]; importNotes: string;
};
type TruckAssignmentDraft = { key: number; truckId: string; driverId: string; availabilityConfirmed?:boolean };

const STATUSES = ["PLANNED", "LOADING", "IN_TRANSIT", "DELIVERED", "CANCELLED"];
const EMPTY_LOOKUPS: Lookups = { "trip-types": [], warehouses: [], trucks: [], drivers: [], stores: [], products: [], customers: [] };
const STEPS = ["Trip", "Stops & products", "Review"] as const;

const inputBase =
  "w-full rounded-lg border border-slate-200 bg-white text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-[#2678b9] focus:ring-2 focus:ring-[#2678b9]/15 disabled:bg-slate-50";
const input = `${inputBase} h-10 px-3`;
const inputSm = `${inputBase} h-9 px-2.5`;

let uid = 0;
const newItem = (): ItemDraft => ({
  key: ++uid, productId: "", newCode: "", addingProduct: false, open: false,
  dr: "", dn: "", sp: "", so: "", sapSo: "", customerPo: "", po: "",
  sourceModel:"", phTruck: "", orderItem: "", stocks: "", approvalDate: "",
  category: "", unitCbm: "", itemStatus: "", warehouse: "", qty: "", cbm: "", importNotes: "",
});
const newStop = (): StopDraft => ({
  key: ++uid, storeId: "", customer: "", city: "", province: "", address: "",
  editLocation: false, collapsed: false, items: [newItem()], importNotes: "",
});
const newTruckAssignment = (): TruckAssignmentDraft => ({ key: ++uid, truckId: "", driverId: "" });

const pad = (n: number) => String(n).padStart(2, "0");
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
/** Date-based dispatch identifiers; trips have a separate TRIP reference. */
const dispatchPrefix = (iso: string) => `DISPATCH${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}`;
/** Product code name (e.g. TAC-10CSD/KEI2-ID) = products.model_code, then SKU, then name. */
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
const hasItemData = (item: ItemDraft) => [item.sourceModel,item.phTruck,item.orderItem,item.stocks,item.approvalDate,item.productId, item.newCode, item.dr, item.dn, item.sp, item.so, item.sapSo, item.customerPo, item.po, item.category, item.unitCbm, item.itemStatus, item.warehouse, item.qty, item.cbm, item.importNotes].some(value => value.trim());
const hasStopData = (stop: StopDraft) => [stop.storeId, stop.pendingDestination??"", stop.customer, stop.city, stop.province, stop.address, stop.importNotes].some(value => value.trim()) || stop.items.some(hasItemData);
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
  value, onChange, options, placeholder, loading, disabled, onAddNew, addNewLabel, compact, openRequested=false,
}: {
  value: string; onChange: (v: string) => void; options: Option[]; placeholder: string;
  loading?: boolean; disabled?: boolean; onAddNew?: () => void; addNewLabel?: string; compact?: boolean;openRequested?:boolean;
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
          {(
            <div className="sticky top-0 border-b border-slate-100 bg-white p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" />
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();const first=visible.find(option=>!option.disabled);if(first){onChange(first.id);setOpen(false);}}else if(event.key==="ArrowDown"){event.preventDefault();(event.currentTarget.closest("[data-dropdown-root]")?.querySelector("[data-dropdown-option]:not(:disabled)") as HTMLButtonElement|null)?.focus();}}} placeholder="Search"
                  className="h-8 w-full rounded-md border border-slate-200 pl-8 pr-2 text-xs outline-none focus:border-[#2678b9]" />
              </div>
            </div>
          )}
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
                <button key={o.id} data-dropdown-option disabled={o.disabled} type="button" onKeyDown={event=>{if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();const buttons=Array.from(event.currentTarget.closest("[data-dropdown-root]")?.querySelectorAll<HTMLButtonElement>("[data-dropdown-option]:not(:disabled)")??[]);const at=buttons.indexOf(event.currentTarget);buttons[(at+(event.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length]?.focus();}}} onClick={() => { onChange(o.id); setOpen(false); }}
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
    <nav className="flex min-w-0 gap-1 overflow-x-auto" aria-label="Steps">
      {STEPS.map((label, i) => {
        const active = i === current, done = i < current;
        return (
          <button key={label} type="button" disabled={disabled} onClick={() => onJump(i)} aria-current={active ? "step" : undefined}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-2 pb-3 pt-1 text-xs transition sm:px-3 sm:text-sm disabled:opacity-50 ${active ? "border-[#0b2341] font-semibold text-[#0b2341]" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${active ? "bg-[#0b2341] text-white" : done ? "bg-[#2678b9] text-white" : "bg-slate-100 text-slate-400"}`}>
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-3.5">
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        {description && <p className="mt-0.5 text-xs text-slate-400">{description}</p>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

const LINE_GRID = "sm:grid-cols-[minmax(0,2.6fr)_5.5rem_6.5rem_minmax(0,1.4fr)_4.5rem]";

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
  const [importedWarehouseCode,setImportedWarehouseCode] = useState("");
  const [creationRequestId] = useState(() => crypto.randomUUID());
  const [cargoPlan, setCargoPlan] = useState(emptyCargoPlan);
  const [truckAssignments, setTruckAssignments] = useState<TruckAssignmentDraft[]>(() => [newTruckAssignment()]);
  const [truckPickerKey,setTruckPickerKey]=useState<number|null>(null);
  const availabilitySchedule=useRef({loadingDate,etaDate});
  const [availability,setAvailability]=useState<TruckAvailability[]>([]);
  const [driverAvailability,setDriverAvailability]=useState<DriverAvailability[]>([]);
  const [driverScheduleError,setDriverScheduleError]=useState("");
  const [driverScheduleLoading,setDriverScheduleLoading]=useState(true);
  const [availabilityLoading,setAvailabilityLoading]=useState(true);
  const [availabilityError,setAvailabilityError]=useState("");
  const [availabilityRetry,setAvailabilityRetry]=useState(0);
  const [remarks, setRemarks] = useState("");
  const [stops, setStops] = useState<StopDraft[]>(() => [newStop()]);

  const [step, setStep] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [csvGroups, setCsvGroups] = useState<CsvTripGroup[]>([]);
  const [csvGroupKey, setCsvGroupKey] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ completed: 0, total: 0 });
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [importedDispatch, setImportedDispatch] = useState("");
  const [importedTripNumber, setImportedTripNumber] = useState(1);

  /* lookups */
  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    const names = Object.keys(EMPTY_LOOKUPS) as Array<keyof Lookups>;
    void Promise.all(names.map(async (name) => [name, await searchRelationshipOptions(accessToken, name, "")] as const))
      .then((entries) => {
        if(active)setLookups(current=>{
          const loaded=Object.fromEntries(entries) as Lookups;
          const trucks=new Map(loaded.trucks.map(truck=>[truck.id,truck]));
          for(const truck of current.trucks){const matched=trucks.get(truck.id);trucks.set(truck.id,{...matched,...truck,values:{...matched?.values,...truck.values}});}
          return {...loaded,trucks:[...trucks.values()]};
        });
      })
      .catch((cause) => active && setLookupError(cause instanceof Error ? cause.message : "Could not load the lists."))
      .finally(() => active && setLoadingLookups(false));
    return () => { active = false; };
  }, [accessToken]);

  useEffect(()=>{
    if(!accessToken)return;let live=true;
    queueMicrotask(() => {
      if (!live) return;
      setAvailabilityLoading(true); setAvailabilityError("");
      if (availabilitySchedule.current.loadingDate !== loadingDate || availabilitySchedule.current.etaDate !== etaDate) {
        setTruckAssignments(current => current.map(assignment => ({ ...assignment, availabilityConfirmed: false })));
        availabilitySchedule.current = { loadingDate, etaDate };
      }
    });
    const timer=setTimeout(()=>{void fetchTruckAvailability(accessToken,loadingDate,etaDate).then(rows=>{if(live){setAvailability(rows);setLookups(current=>({...current,trucks:rows.map(truck=>{const existing=current.trucks.find(option=>option.id===truck.id);return {...existing,id:truck.id,label:truck.plate_number,secondary:existing?.secondary??truck.truck_type??undefined,values:{...existing?.values,plate_number:truck.plate_number,truck_type:truck.truck_type??"",capacity_cbm:truck.capacity_cbm==null?"":String(truck.capacity_cbm)}};})}));}}).catch(()=>{if(live){setAvailability([]);setAvailabilityError("Unable to check truck schedules. Retry before selecting a truck.");}}).finally(()=>{if(live)setAvailabilityLoading(false);});},200);
    return()=>{live=false;clearTimeout(timer);};
  },[accessToken,loadingDate,etaDate,availabilityRetry]);
  useEffect(()=>{
    if(!accessToken)return;let current=true;
    queueMicrotask(()=>{if(current){setDriverScheduleLoading(true);setDriverScheduleError("");}});
    const timer=setTimeout(()=>{void fetchDriverAvailability(accessToken,loadingDate,etaDate).then(rows=>{if(current)setDriverAvailability(rows);}).catch(cause=>{if(current)setDriverScheduleError(cause instanceof Error?cause.message:"Unable to check driver schedules.");}).finally(()=>{if(current)setDriverScheduleLoading(false);});},200);
    return()=>{current=false;clearTimeout(timer);};
  },[accessToken,loadingDate,etaDate,availabilityRetry]);
  function rememberOption(kind:keyof Lookups,option:Option){setLookups(current=>({...current,[kind]:[option,...current[kind].filter(item=>item.id!==option.id)]}));}
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
  const dispatchRef = dispatchMode === "existing" ? existingDispatch?.dispatch_number ?? "" : importedDispatch || dispatchNo;
  const tripNumber = dispatchMode === "existing" ? existingDispatch?.next_trip_number ?? 0 : importedDispatch ? importedTripNumber : 1;
  const dispatchBusy = dispatchMode === "existing" ? dispatchesLoading : !importedDispatch && dispatchLoading;
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
    // Trips in one dispatch usually share these — fill them in, but never overwrite what's already chosen.
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
  const cargoLines: CargoLine[] = populatedStops.flatMap(stop => stop.items.filter(hasItemData).map(item => ({key:String(item.key),dr:item.dr,stop:labelOf(lookups.stores,stop.storeId)||stop.pendingDestination||stop.customer,label:item.newCode||labelOf(productOptions,item.productId)||item.dr||'Product',quantity:item.qty,cbm:item.cbm})));
  const cargoTrucks: CargoTruck[] = selectedTruckAssignments.map(assignment => ({id:assignment.truckId,label:labelOf(lookups.trucks,assignment.truckId)||assignment.truckId,capacity:lookups.trucks.find(truck=>truck.id===assignment.truckId)?.values?.capacity_cbm||'',driverId:assignment.driverId,driverLabel:labelOf(lookups.drivers,assignment.driverId)||''}));
  const assignedCapacity = capacityState.capacity;
  const hasUnknownTruckCapacity = capacityState.unknown;

  function addCapacityTruck() {
    const empty=truckAssignments.find(assignment=>!assignment.truckId),target=empty??newTruckAssignment();
    if(!empty)setTruckAssignments(current=>[...current,target]);
    setTruckPickerKey(target.key);
    setStep(0);
    setError("");
    requestAnimationFrame(() => document.getElementById("trip-truck-assignments")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  async function loadCsv(file: File) {
    setImportError(""); setImportMessage("");
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Choose a CSV smaller than 10 MB.");
      const groups = readTripCsv(await file.text());
      if (groups.some(group => group.rows.some(row => row.values.phTruck || row.values.orderItem || row.values.stocks || row.values.approvalDate))) {
        throw new Error("Use Import CSV / XLSX for client trip requests. It preserves all source columns and imports every group with duplicate protection.");
      }
      setCsvGroups(groups); setCsvGroupKey(groups[0].key); setCsvFileName(file.name);
    } catch (cause) { setCsvGroups([]); setImportError(cause instanceof Error ? cause.message : "Unable to read CSV."); }
  }

  async function applyCsv() {
    const group = csvGroups.find(value => value.key === csvGroupKey);
    if (!group || !accessToken || importing) return;
    setImporting(true); setImportError(""); setImportProgress({ completed: 0, total: 0 });
    try {
      const first = group.rows[0].values;
      const loading = csvDate(first.loadingDate), eta = csvDate(first.eta);
      const sourceTripReference = /^TRIP\d{6}-\d+$/i.test(first.trip) ? first.trip : "";
      const importedNumber = first.trip && !sourceTripReference ? Number(csvNumber(first.trip, "Trip number", group.rows[0].line, true)) : 1;
      if (importedNumber < 1) throw new Error("Trip number must be at least 1 when supplied.");
      // Reject invalid supplied values before spending time on network lookups.
      for (const row of group.rows) {
        csvNumber(row.values.qty, "Quantity", row.line, true);
        csvNumber(row.values.unitCbm, "Unit CBM", row.line);
        csvNumber(row.values.cbm, "Total CBM", row.line);
      }
      const { lookups: nextLookups, find } = await resolveTripCsvLookups(group, lookups,
        (kind, value, customerId) => searchRelationshipOptions(accessToken, kind, value, { customerId }),
        (completed, total) => setImportProgress({ completed, total }),
      );
      const warehouse = find("warehouses", first.warehouse);
      const tripType = find("trip-types", first.tripType);
      const warnings = new Set<string>();
      const importedStops = new Map<string, StopDraft>();
      const importedTrucks = new Map<string, TruckAssignmentDraft>();
      for (const row of group.rows) {
        const v = row.values;
        const customer = find("customers", v.customer);
        const store = v.customer && !customer ? undefined : find("stores", v.store, customer?.id);
        const product = find("products", v.product);
        const truck = find("trucks", v.plate);
        const qty = csvNumber(v.qty, "Quantity", row.line, true);
        const unitCbm = csvNumber(v.unitCbm, "Unit CBM", row.line);
        const cbm = v.cbm ? csvNumber(v.cbm, "Total CBM", row.line) : qty && unitCbm ? calculatedCbm(qty,unitCbm) : "";
        const stopKey = JSON.stringify([v.store, v.customer, v.city, v.province, v.address]);
        const stop = importedStops.get(stopKey) ?? { ...newStop(), storeId: store?.id ?? "", pendingDestination:store?"":v.store, customerId:store?.values?.customer_id??customer?.id, customer: v.customer, city: v.city, province: v.province, address: v.address || store?.values?.address || "", importNotes: !store && v.store ? `Imported ship to: ${v.store}` : "", items: [] };
        if (v.store && !store) warnings.add(`Store “${v.store}” needs a selection; its name is kept in stop notes.`);
        if (v.plate && !truck) warnings.add(`Vehicle “${v.plate}” needs a selection; its plate is kept in line notes.`);
        if (truck) importedTrucks.set(truck.id, { ...newTruckAssignment(), truckId: truck.id, driverId: truck.values?.default_driver_id||"" });
        const lineNotes = [!v.cbm && qty && unitCbm ? "Total CBM calculated from quantity and CBM; no supplied total was replaced." : "", v.notes, row.extra, !truck && v.plate ? `Imported plate: ${v.plate}` : "", v.warehouse !== first.warehouse ? `Source warehouse: ${v.warehouse}` : "", v.loadingDate !== first.loadingDate ? `Source loading date: ${v.loadingDate}` : ""].filter(Boolean).join(" · ");
        stop.items.push({ ...newItem(), productId: product?.id ?? "", newCode: product ? "" : v.product, addingProduct: !product && Boolean(v.product), dr: v.dr, sapSo: v.sapSo, customerPo: v.customerPo, po: v.po, sp: v.sp, dn: v.dn, so: v.so, category: v.category, sourceModel:v.product, phTruck: v.phTruck, orderItem: v.orderItem, stocks: v.stocks, approvalDate: v.approvalDate, qty, cbm, unitCbm, itemStatus: v.itemStatus, warehouse: v.warehouse, importNotes: lineNotes });
        importedStops.set(stopKey, stop);
      }
      if (first.warehouse && !warehouse) warnings.add(`Warehouse “${first.warehouse}” needs a selection; its name is kept in trip notes.`);
      setLookups(current => ({ ...current, ...nextLookups })); setStops([...importedStops.values()]);
      setTruckAssignments(importedTrucks.size ? [...importedTrucks.values()] : [newTruckAssignment()]);
      setLoadingDate(loading); setEtaDate(eta); setWarehouseId(warehouse?.id ?? ""); setImportedWarehouseCode(warehouse ? "" : first.warehouse);
      setTripTypeId(tripType?.id ?? ""); setNewTripType(tripType ? "" : first.tripType); setAddingTripType(!tripType && Boolean(first.tripType));
      if (dispatchMode !== "existing") { setImportedDispatch(first.dispatch); setImportedTripNumber(importedNumber); }
      setStatus("PLANNED"); setRemarks([!warehouse && first.warehouse ? `Imported warehouse: ${first.warehouse}` : "", sourceTripReference ? `Source trip: ${sourceTripReference}` : ""].filter(Boolean).join(" ? "));
      setStep([...importedStops.values()].some(stop => stop.pendingDestination && !stop.storeId) ? 1 : 2); setError(""); setCsvGroups([]);
      requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0 }));
      setImportMessage(`${group.rows.length} product line${group.rows.length === 1 ? "" : "s"} loaded. Check the preview, then create the trip.`);
      setImportWarnings([...warnings]);
    } catch (cause) { setImportError(cause instanceof Error ? cause.message : "Unable to import CSV."); }
    finally { setImporting(false); }
  }

  /* updates */
  const updateStop = (key: number, patch: Partial<StopDraft>) =>
    setStops((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const updateItem = (stopKey: number, itemKey: number, patch: Partial<ItemDraft>) =>
    setStops((list) => list.map((s) => s.key === stopKey
      ? { ...s, items: s.items.map((i) => (i.key === itemKey ? { ...i, ...patch } : i)) } : s));

  function pickStore(stopKey: number, storeId: string, option?:Option) {
    if(option)rememberOption("stores",option);
    const location = option?.values??lookups.stores.find((o) => o.id === storeId)?.values;
    const customer = lookups.customers.find((o) => o.id === location?.customer_id);
    updateStop(stopKey, {
      storeId,pendingDestination:"",customerId:location?.customer_id,
      customer: customer?.values?.customer_name ?? stops.find(stop=>stop.key===stopKey)?.customer ?? "",
      city: location?.city ?? "",
      province: location?.province ?? "",
      address: location?.address ?? "",
    });
  }

  function pickProduct(stopKey: number, itemKey: number, productId: string, option?:Option) {
    if(option)rememberOption("products",option);
    const category = option?.values?.product_category??lookups.products.find((o) => o.id === productId)?.values?.product_category ?? "";
    updateItem(stopKey, itemKey, { productId, category, addingProduct: false, newCode: "" });
  }

  /** A typed-in code that already exists is treated as that product. */
  const matchExisting = (code: string) =>
    code.trim() ? productOptions.find((o) => o.label.trim().toLowerCase() === code.trim().toLowerCase()) : undefined;

  /* validation */
  function validateTrip(): string {
    if(selectedTruckAssignments.some(assignment=>assignment.driverId)&&(driverScheduleLoading||driverScheduleError))return driverScheduleError||"Wait for the driver schedule check.";
    if(selectedTruckAssignments.some(assignment=>driverAvailability.some(driver=>driver.id===assignment.driverId&&driver.availability==="CONFLICT")))return "A selected driver has an overlapping active trip. Choose another driver or change the dates.";
    if (new Set(selectedTruckAssignments.map(a=>a.driverId).filter(Boolean)).size !== selectedTruckAssignments.filter(a=>a.driverId).length) return "A driver cannot drive two active trucks in the same trip.";
    if (cargoPlan.placements.length) { if (!cargoPlan.confirmed || cargoPlan.signature !== cargoSignature(cargoLines,cargoTrucks)) return "Review and confirm the current cargo distribution."; const problem=validateCargo(cargoLines,cargoTrucks,cargoPlan.placements); if(problem)return problem; }
    if (dispatchMode === "existing" && !existingDispatch) return "Choose the dispatch this trip belongs to.";
    if (etaDate && loadingDate && etaDate < loadingDate) return "Estimated delivery can't be before the loading date.";
    if(selectedTruckAssignments.length&&(availabilityLoading||availabilityError))return "Wait for the truck availability check, or retry it.";
    for(const assignment of selectedTruckAssignments){const state=availability.find(truck=>truck.id===assignment.truckId);if(!state||state.availability==="CONFLICT")return "A selected truck is unavailable for these dates. Choose another truck.";if(state.availability==="REVIEW"&&!assignment.availabilityConfirmed)return "Confirm the schedule for trucks marked availability requires confirmation.";}
    const assignedTruckIds = selectedTruckAssignments.map((assignment) => assignment.truckId);
    if (new Set(assignedTruckIds).size !== assignedTruckIds.length) return "Choose a different truck for each assignment.";
    if (truckAssignments.some((assignment) => assignment.driverId && !assignment.truckId)) return "Choose a truck before assigning a driver.";
    return "";
  }

  function validateStops(): string {
    for (const [i, stop] of stops.entries()) {
      const n = i + 1;
      if(stop.pendingDestination&&!stop.storeId&&!stop.customerId)return `Stop ${n}: select or add destination "${stop.pendingDestination}" before creating the trip.`;
      for (const item of stop.items) {
        if (item.qty.trim() && (!Number.isSafeInteger(num(item.qty)) || num(item.qty) < 0)) return `Stop ${n}: quantity must be a non-negative whole number.`;
        if (item.unitCbm.trim() && (!Number.isFinite(num(item.unitCbm)) || num(item.unitCbm) < 0)) return `Stop ${n}: unit CBM must be a non-negative number.`;
        if (item.cbm.trim() !== "" && (!Number.isFinite(num(item.cbm)) || num(item.cbm) < 0)) return `Stop ${n}: CBM must be a valid number.`;
      }
    }
    return "";
  }

  function goTo(target: number) {
    if (saving || importing) return;
    if (target <= step) { setError(""); setStep(target); bodyRef.current?.scrollTo({ top: 0 }); return; }
    let problem = validateTrip();
    if (!problem && target >= 2) problem = validateStops();
    setError(problem);
    if (!problem) { setStep(target); bodyRef.current?.scrollTo({ top: 0 }); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (csvGroups.length || importing) { setError("Preview the selected CSV trip or cancel the import before continuing."); return; }
    if (step < STEPS.length - 1) { goTo(step + 1); return; }
    const problem = validateTrip() || validateStops();
    if (problem) return setError(problem);
    setError(""); setSaving(true);
    try {
      if(accessToken&&selectedTruckAssignments.length){const latest=await fetchTruckAvailability(accessToken,loadingDate,etaDate);for(const assignment of selectedTruckAssignments){const truck=latest.find(row=>row.id===assignment.truckId);const previous=availability.find(row=>row.id===assignment.truckId);if(!truck||truck.availability==="CONFLICT")throw Error("A selected truck now has a schedule conflict. Choose another truck.");if(truck.availability==="REVIEW"&&(!assignment.availabilityConfirmed||previous?.availability!=="REVIEW"))throw Error("A selected truck requires schedule confirmation before creating the trip.");}}
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
          new_warehouse_code: warehouseId ? null : importedWarehouseCode || null,
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
          destination: !stop.storeId && stop.pendingDestination ? {name:stop.pendingDestination,customer_id:stop.customerId||"",customer_name:stop.customer,province:stop.province,city:stop.city,address:stop.address} : undefined,
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
        if (importedDispatch && dispatchMode === "new") {
          setError("This imported dispatch and trip number already exist. Choose an existing dispatch to add another trip, or clear the imported reference to generate a new dispatch.");
          return;
        }
        setDispatchRetry((n) => n + 1); // someone took this number — fetch the next one
        setError(dispatchMode === "existing"
          ? "Someone just added a trip to this dispatch. The trip number has been updated — review it and create the trip again."
          : "That dispatch reference was just taken. A new one has been generated — review it and create the trip again.");
      } else setError(message);
    } finally { setSaving(false); }
  }

  const isLast = step === STEPS.length - 1;
  const productLabel = (i: ItemDraft) => i.sourceModel || (i.productId ? labelOf(productOptions, i.productId) : i.newCode.trim() || null);
  const selectedCsvGroup = csvGroups.find(group => group.key === csvGroupKey);
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
  if (bulkImportOpen) return <BulkTripImport initialTarget={dispatchMode === "existing" && existingDispatch ? {mode:"dispatch",value:existingNo,allow_create:true} : undefined} onClose={() => setBulkImportOpen(false)} onImported={() => onImported?.()} />;
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm sm:p-5">
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="add-trip-title"
        aria-busy={saving || importing}
        className="flex h-[100dvh] min-w-0 w-full max-w-6xl flex-col overflow-hidden bg-slate-50 shadow-2xl ring-1 ring-slate-900/5 sm:h-auto sm:max-h-[92dvh] sm:rounded-2xl">

        {/* header */}
        <header className="shrink-0 bg-white px-4 pt-4 sm:px-6 sm:pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 id="add-trip-title" className="text-lg font-semibold text-[#0b2341]">New trip</h3>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                <span className="max-w-full truncate font-mono text-[13px] font-medium text-[#2678b9]">
                  {dispatchBusy ? "Loading…" : dispatchRef || "No dispatch yet"}
                </span>
                <span className="text-xs text-slate-500">{tripReference || (tripReferenceStatus === "setup_required" ? "Trip numbering not yet enabled" : "Trip no. generated on save")}</span>
                {tripTypeLabel && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{tripTypeLabel}</span>}
              </p>
            </div>
            <button type="button" onClick={onClose} disabled={saving || importing} aria-label="Close"
              className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-4 border-b border-slate-200"><Tabs current={step} onJump={goTo} disabled={saving || importing} /></div>
        </header>

        {/* body */}
        <div ref={bodyRef} className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            <div><p className="text-sm font-semibold text-[#0b2341]">Import complete trip requests</p><p className="mt-1 text-xs text-slate-600">Select multiple CSV / XLSX files, map columns and review every product row before saving.</p></div>
            <button type="button" className="inline-flex items-center gap-2 rounded-full bg-[#ffd43b] px-4 py-2 text-sm font-semibold text-[#0b2341] hover:bg-[#f2c200]" disabled={saving || importing || (dispatchMode === "existing" && !existingDispatch)} onClick={() => setBulkImportOpen(true)}><Upload size={16} />Import CSV / XLSX</button>
          </div>
          <details className="rounded-xl border border-slate-200 bg-white p-4">
            <summary className="mb-3 cursor-pointer text-xs font-medium text-slate-500">Load one CSV group into the manual trip form</summary>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-3"><span className="hidden rounded-xl bg-blue-50 p-2.5 text-[#2678b9] sm:block"><FileSpreadsheet className="h-5 w-5" /></span><div className="min-w-0"><p className="text-sm font-semibold text-[#0b2341]">Import from CSV</p><p className="mt-1 text-xs leading-5 text-slate-500">Upload a booking or dispatch sheet exported as CSV UTF-8.</p><p className="text-xs leading-5 text-slate-500">All fields are optional. You can fill in missing details later.</p></div></div>
              <label className={`inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-[#2678b9] focus-within:ring-2 focus-within:ring-blue-400 ${saving || importing ? "pointer-events-none opacity-50" : "hover:bg-slate-50"}`}>
                <Upload className="h-4 w-4" /> Import CSV
                <input type="file" accept=".csv,text/csv" aria-label="Import trip CSV" disabled={saving || importing} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadCsv(file); event.target.value = ""; }} />
              </label>
            </div>
            {csvGroups.length > 0 && <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              <p className="flex min-w-0 items-center gap-2 text-xs text-slate-500"><FileSpreadsheet className="h-4 w-4 shrink-0" /><span className="truncate" title={csvFileName}>{csvFileName}</span><span className="shrink-0">· {csvGroups.length} trip{csvGroups.length === 1 ? "" : "s"}</span></p>
              <label className="block text-xs font-medium text-slate-600">Trip to import ({csvGroups.length} found)<select aria-label="CSV trip to import" disabled={importing} value={csvGroupKey} onChange={(event) => setCsvGroupKey(event.target.value)} className={`${input} mt-1`}>{csvGroups.map(group => <option key={group.key} value={group.key}>{group.label} · {group.rows.length} lines</option>)}</select></label>
              {selectedCsvGroup && <TripTablePreview key={selectedCsvGroup.key} title="CSV table preview" description="Check the selected rows. Show all columns to see the remaining details." rows={selectedCsvGroup.rows.map(row => ({ ...row.values, notes: [row.values.notes, row.extra].filter(Boolean).join(" · ") }))} />}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2"><p className="max-w-md text-xs leading-5 text-slate-500">Previewing replaces the current form. Your trip is saved only when you select Create trip.</p><div className="flex flex-wrap gap-2"><button type="button" disabled={importing} onClick={() => { setCsvGroups([]); setImportError(""); }} className="rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel import</button><button type="button" disabled={importing || saving} onClick={() => void applyCsv()} className="inline-flex items-center gap-2 rounded-full bg-[#ffd43b] px-4 py-2 text-xs font-semibold text-[#0b2341] hover:bg-[#f2c200] disabled:opacity-50">{importing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{importing ? "Preparing preview…" : "Preview trip in table"}</button></div></div>
            </div>}
            {importing && importProgress.total > 0 && <div role="status" className="mt-3 space-y-1.5"><p className="text-xs text-slate-600">Matching records · {importProgress.completed} of {importProgress.total}</p><progress aria-label="CSV record matching" value={importProgress.completed} max={importProgress.total} className="h-1.5 w-full accent-[#2678b9]" /></div>}
            {(importError || importMessage || importWarnings.length > 0) && <div className="mt-3 space-y-2">
              {importError && <TripFormNotice tone="error" title="CSV import needs attention" onDismiss={() => setImportError("")}>{importError}</TripFormNotice>}
              {importMessage && <TripFormNotice tone="success" title="Preview ready" onDismiss={() => setImportMessage("")}>{importMessage}</TripFormNotice>}
              {importWarnings.length > 0 && <TripFormNotice tone="warning" title="Review import notes" onDismiss={() => setImportWarnings([])}><p>Some source names could not be matched and were kept in notes. Check the selections in the form.</p><details><summary className="cursor-pointer font-medium">View import notes ({importWarnings.length})</summary><ul className="mt-2 max-h-36 space-y-1 overflow-y-auto pl-4 list-disc">{importWarnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details></TripFormNotice>}
            </div>}
            {importedDispatch && dispatchMode === "new" && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600"><span>Imported dispatch: {importedDispatch}</span><button type="button" onClick={() => setImportedDispatch("")} className="font-medium text-[#2678b9] underline">Generate a new dispatch instead</button></div>}
          </details>
          {accessToken && cargoLines.length > 0 && selectedTruckAssignments.length > 0 && <TripCargoPlanner token={accessToken} lines={cargoLines} plan={cargoPlan} onChange={setCargoPlan} fixedTrucks={cargoTrucks} disabled={saving} />}
          {capacityState.full && <TripFormNotice tone="warning" title={capacityState.exceeded ? "Truck capacity exceeded" : "Truck capacity is full"} action={<button type="button" onClick={addCapacityTruck} className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white/70 px-3 py-1.5 text-xs font-semibold hover:bg-white"><Plus className="h-3.5 w-3.5" />Add another truck</button>}>
            <p>{fmt(totals.cbm)} CBM of cargo / {fmt(assignedCapacity)} CBM capacity.</p><p>{capacityState.exceeded ? `Add a truck for the remaining ${fmt(capacityState.overflow)} CBM before loading.` : "Add another truck if you need to load more cargo."} You can still save this as a planned trip.</p>
          </TripFormNotice>}
          {selectedTruckAssignments.length > 0 && hasUnknownTruckCapacity && <TripFormNotice tone="warning" title="Truck capacity is missing">At least one selected truck has no CBM capacity recorded. Check its capacity before loading.</TripFormNotice>}
          {lookupError && <TripFormNotice tone="warning" title="Some lists could not load">{lookupError} You can continue with blank fields and complete them later.</TripFormNotice>}

          {/* ── step 1: trip ── */}
          {step === 0 && (
            <>
              <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-5 text-[#0b2341] sm:p-6">
                <div className="inline-flex rounded-full bg-slate-200/70 p-1 text-sm" role="tablist" aria-label="Dispatch">
                  {([["new", "New dispatch"], ["existing", "Add to an existing dispatch"]] as const).map(([mode, label]) => (
                    <button key={mode} type="button" role="tab" aria-selected={dispatchMode === mode} onClick={() => switchDispatchMode(mode)}
                      className={`rounded-full px-4 py-1.5 font-medium transition ${dispatchMode === mode ? "bg-white text-[#0b2341]" : "text-slate-600 hover:text-[#0b2341]"}`}>
                      {label}
                    </button>
                  ))}
                </div>

                <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-500">Dispatch reference</p>
                    <p className="mt-1 truncate font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
                      {dispatchBusy ? "Loading…" : dispatchRef || "—"}
                    </p>
                    <p className="mt-1.5 text-xs text-slate-500">
                      {dispatchMode === "new"
                        ? importedDispatch ? "Dispatch reference from your CSV." : `Reference generated from ${loadingDate ? "the loading date" : "today's date"}.`
                        : existingDispatch
                          ? `Adding a trip to this dispatch · ${existingDispatch.trip_count} existing trip${existingDispatch.trip_count === 1 ? "" : "s"}.`
                          : "Select an existing dispatch to add another trip."}
                    </p>
                    {dispatchError && (dispatchMode === "existing" || !importedDispatch) && <div className="mt-3"><TripFormNotice tone="warning" title={dispatchMode === "existing" ? "Dispatch list unavailable" : "Dispatch reference unavailable"} action={<button type="button" onClick={() => setDispatchRetry(value => value + 1)} className="rounded-full border border-amber-300 bg-white/70 px-3 py-1 text-xs font-semibold hover:bg-white">Try again</button>}>{dispatchError}{dispatchMode === "new" && " A reference will be generated when you save."}</TripFormNotice></div>}
                  </div>
                  {dispatchMode === "new" && (
                    <button type="button" onClick={() => { setImportedDispatch(""); setDispatchRetry((n) => n + 1); }} disabled={dispatchLoading}
                      className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-[#0b2341] transition hover:bg-blue-50 disabled:opacity-50">
                      <RefreshCw className={`h-4 w-4 ${dispatchLoading ? "animate-spin" : ""}`} /> Get a new number
                    </button>
                  )}
                </div>

                {dispatchMode === "existing" && (
                  <div className="mt-4 max-w-md text-slate-800">
                    <Dropdown value={existingNo} onChange={pickExistingDispatch} options={dispatchOptionList}
                      placeholder="Search dispatch number" loading={dispatchesLoading} />
                  </div>
                )}
              </section>

              <Section title="Trip number" description="Generated separately from the dispatch reference.">
                <Field label="Trip no."><input readOnly aria-label="Generated trip number" value={tripReference} placeholder={dispatchLoading ? "Generating trip number…" : tripReferenceStatus === "setup_required" ? "Trip numbering not yet enabled" : "Generated when you save"} className={`${input} font-mono`} /></Field>
                {tripReferenceStatus === "ready" ? <p className="mt-2 text-xs text-slate-500">The final number is assigned when the trip is saved.</p> : <div className="mt-3"><TripFormNotice tone="warning" title={tripReferenceStatus === "setup_required" ? "Trip numbering needs an update" : "Trip number preview unavailable"}>{tripReferenceStatus === "setup_required" ? "Generated trip numbers need database setup. Complete the reviewed database updates before saving a new trip." : "The dispatch reference is ready. Try generating the trip number again."}</TripFormNotice></div>}
              </Section>

              <Section title="Schedule">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Trip type">
                    {addingTripType ? (
                      <div className="flex items-center gap-1.5">
                        <input autoFocus value={newTripType} onChange={(e) => setNewTripType(e.target.value)} className={input} placeholder="e.g. Backload" />
                        <button type="button" onClick={() => { setAddingTripType(false); setNewTripType(""); }} aria-label="Cancel new trip type"
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <Dropdown value={tripTypeId} onChange={(v) => { setTripTypeId(v); setNewTripType(""); }}
                        options={lookups["trip-types"]} placeholder="Choose a type" loading={loadingLookups}
                        onAddNew={() => { setTripTypeId(""); setAddingTripType(true); }} addNewLabel="Add a new trip type" />
                    )}
                  </Field>
                  <Field label="Loading date" hint="optional">
                    <input type="date" value={loadingDate} onChange={(e) => setLoadingDate(e.target.value)} className={input} />
                  </Field>
                  <Field label="Estimated delivery" hint="optional">
                    <input type="date" min={loadingDate || undefined} value={etaDate} onChange={(e) => setEtaDate(e.target.value)} className={input} />
                  </Field>
                  <Field label="Status">
                    <Dropdown value={status} onChange={(v) => setStatus(v || "PLANNED")}
                      options={STATUSES.map((s) => ({ id: s, label: sentence(s) }))} placeholder="Choose status" />
                  </Field>
                </div>
              </Section>

              <Section title="Warehouse and trucks" description="Choose trucks and drivers here, then review a DR-based cargo distribution in its separate panel.">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Origin warehouse">
                    {accessToken&&<div className={`${input} flex items-center`}><SearchableRelationshipEditor token={accessToken} kind="warehouses" value={labelOf(lookups.warehouses,warehouseId)??""} autoFocus={false} disabled={saving} onSelect={option=>{rememberOption("warehouses",option);setWarehouseId(option.id);}} onCommitBlur={()=>{}} onCancel={()=>{}}/></div>}
                  </Field>
                  <div className="sm:col-span-2">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-slate-600">Truck assignments</p>
                      <button
                        type="button"
                        onClick={()=>{addCapacityTruck();setAvailabilityRetry(value=>value+1);}}
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-[#2678b9] hover:bg-[#e6f0f9]"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add truck
                      </button>
                    </div>
                    {availabilityError&&<p className="mb-2 text-xs text-rose-700">{availabilityError} <button type="button" onClick={()=>setAvailabilityRetry(value=>value+1)} className="underline">Retry schedules</button></p>}
                    <p className="mb-2 text-xs text-slate-500">Cargo: {fmt(totals.cbm)} CBM · Selected capacity: {fmt(assignedCapacity)} CBM · Additional capacity needed: {fmt(Math.max(0,totals.cbm-assignedCapacity))} CBM. Confirm a cargo proposal above to allocate products.</p>
                    <div className="space-y-2">
                      {truckAssignments.map((assignment, index) => {
                        const otherCapacity=truckAssignments.filter(other=>other.key!==assignment.key&&other.truckId).reduce((total,other)=>total+Number(lookups.trucks.find(truck=>truck.id===other.truckId)?.values?.capacity_cbm||0),0);
                        const remaining=Math.max(0,totals.cbm-otherCapacity);
                        const ranked=lookups.trucks.filter(truck=>truck.id===assignment.truckId||!truckAssignments.some(other=>other.key!==assignment.key&&other.truckId===truck.id)).map(truck=>{
                          const status=availability.find(row=>row.id===truck.id);const capacity=Number(truck.values?.capacity_cbm||0);
                          const available=status?.availability==="AVAILABLE";
                          return {...truck,disabled:!status||status.availability==="CONFLICT",rank:!status||status.availability==="CONFLICT"?3:!available?2:capacity>=remaining?0:1,
                            secondary:`${truck.values?.truck_type||"Truck"} · Max ${capacity>0?fmt(capacity):"unknown"} CBM · ${available?`Available ${capacity>0?fmt(capacity):"unknown"} CBM`:status?.availability==="CONFLICT"?"Conflicting assignment":"Availability requires confirmation"} · ${capacity>0&&capacity>=remaining?"Fits remaining cargo":capacity>0?"Partial capacity":"Capacity requires review"}`};
                        }).sort((a,b)=>a.rank-b.rank||Number(a.values?.capacity_cbm||0)-Number(b.values?.capacity_cbm||0)||a.label.localeCompare(b.label));
                        const availableTrucks=ranked;
                        const truckState=availability.find(truck=>truck.id===assignment.truckId);
                        const chosenTruck = lookups.trucks.find((truck) => truck.id === assignment.truckId);
                        const capacity = Number(chosenTruck?.values?.capacity_cbm);
                        return (
                          <div key={assignment.key} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <div id="trip-truck-assignments" className="min-w-0">
                              <Dropdown
                                value={assignment.truckId}
                                onChange={(truckId) => {setTruckPickerKey(null);setTruckAssignments((current) => current.map((item) => item.key === assignment.key ? { ...item, truckId, driverId:(()=>{const defaultId=lookups.trucks.find(truck=>truck.id===truckId)?.values?.default_driver_id||"";return current.some(other=>other.key!==item.key&&other.driverId===defaultId)?"":defaultId;})(), availabilityConfirmed:false } : item));}}
                                options={availableTrucks}
                                openRequested={truckPickerKey===assignment.key&&!availabilityLoading&&!availabilityError}
                                disabled={availabilityLoading||Boolean(availabilityError)}
                                placeholder={index === 0 ? "Assign primary truck later" : "Choose truck"}
                                loading={loadingLookups}
                                compact
                              />
                              {truckState?.availability==="REVIEW"&&<label className="mt-1 flex items-start gap-1 text-[11px] text-amber-700"><input type="checkbox" checked={Boolean(assignment.availabilityConfirmed)} onChange={event=>setTruckAssignments(current=>current.map(item=>item.key===assignment.key?{...item,availabilityConfirmed:event.target.checked}:item))}/>I have confirmed this truck's availability for the trip schedule.</label>}
                              {truckState?.availability==="CONFLICT"&&<p className="text-xs text-rose-700">Conflicting assignment. Choose another truck.</p>}
                              {chosenTruck && (
                                <p className="mt-1 truncate text-[10px] text-slate-400">
                                  {chosenTruck.secondary || "Truck"}
                                  {Number.isFinite(capacity) && capacity > 0 ? ` · ${fmt(capacity)} CBM capacity` : ""}
                                </p>
                              )}
                            </div>
                            <Dropdown
                              value={assignment.driverId}
                              onChange={(driverId) => setTruckAssignments((current) => current.map((item) => item.key === assignment.key ? { ...item, driverId } : item))}
                              options={lookups.drivers.filter(driver=>!truckAssignments.some(other=>other.key!==assignment.key&&other.driverId===driver.id)).map(driver=>({...driver,disabled:driverAvailability.some(state=>state.id===driver.id&&state.availability==="CONFLICT")}))}
                              placeholder="Assign driver later"
                              loading={loadingLookups}
                              compact
                              disabled={!assignment.truckId}
                            />
                            {truckAssignments.length > 1 ? (
                              <button
                                type="button"
                                aria-label={`Remove truck assignment ${index + 1}`}
                                onClick={() => setTruckAssignments((current) => current.filter((item) => item.key !== assignment.key))}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ) : <span aria-hidden="true" className="hidden sm:block" />}
                            <p className="text-[10px] font-medium text-slate-400 sm:col-span-3">
                              {index === 0 ? "Primary assignment" : "Additional truck on this same trip"}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    {selectedTruckAssignments.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        {hasUnknownTruckCapacity
                          ? <span>{selectedTruckAssignments.length} truck{selectedTruckAssignments.length === 1 ? "" : "s"} selected · capacity incomplete</span>
                          : <><span>Truck capacity <strong className="font-semibold text-slate-800">{fmt(assignedCapacity)} CBM</strong></span><span>Cargo <strong className="font-semibold text-slate-800">{fmt(totals.cbm)} CBM</strong></span></>}
                      </div>
                    )}
                  </div>
                  <Field label="Remarks" className="sm:col-span-3">
                    <input value={remarks} onChange={(e) => setRemarks(e.target.value)} className={input} placeholder="Anything the team should know about this trip" />
                  </Field>
                </div>
              </Section>
            </>
          )}

          {/* ── step 2: stops & products ── */}
          {step === 1 && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h4 className="text-base font-semibold text-slate-800">Stops and products</h4>
                  <p className="mt-0.5 text-sm text-slate-500">One stop per delivery address. Add a line for each product and DR.</p>
                </div>
                <p className="text-sm text-slate-500">
                  {stops.length} stop{stops.length === 1 ? "" : "s"} · {totals.lines} line{totals.lines === 1 ? "" : "s"} · {fmt(totals.qty, 0)} qty · {fmt(totals.cbm)} CBM
                </p>
              </div>

              <div className="space-y-4">
                {stops.map((stop, si) => {
                  const t = stopTotals(stop);
                  const locationText = [stop.customer, [stop.city, stop.province].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
                  return (
                    <article key={stop.key} className="rounded-xl border border-slate-200 bg-white shadow-sm">
                      {/* stop header */}
                      <div className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0b2341] text-xs font-semibold text-white">{si + 1}</span>
                        <div className="min-w-[14rem] flex-1">
                          {accessToken&&<div className={`${input} flex items-center`}><SearchableRelationshipEditor token={accessToken} kind="stores" value={labelOf(lookups.stores,stop.storeId)??stop.pendingDestination??""} customerId={stop.customerId} createDefaults={{address:stop.address,city:stop.city,province:stop.province}} autoFocus={false} disabled={saving} onSelect={option=>pickStore(stop.key,option.id,option)} onCommitBlur={()=>{}} onCancel={()=>{}}/></div>}
                          {stop.pendingDestination&&!stop.storeId&&<p className="mt-1 text-xs text-amber-700">Imported destination: {stop.pendingDestination}. Select a match or choose Add in the search list.</p>}
                        </div>
                        <span className="hidden text-xs text-slate-400 md:inline">
                          {stop.items.length} line{stop.items.length === 1 ? "" : "s"} · {fmt(t.qty, 0)} qty · {fmt(t.cbm)} CBM
                        </span>
                        <div className="ml-auto flex items-center gap-0.5">
                          <button type="button" onClick={() => updateStop(stop.key, { collapsed: !stop.collapsed })}
                            aria-label={stop.collapsed ? "Expand stop" : "Collapse stop"} aria-expanded={!stop.collapsed}
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                            <ChevronDown className={`h-4 w-4 transition-transform ${stop.collapsed ? "-rotate-90" : ""}`} />
                          </button>
                          {stops.length > 1 && (
                            <button type="button" onClick={() => setStops((l) => l.filter((s) => s.key !== stop.key))} aria-label={`Remove stop ${si + 1}`}
                              className="rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>
                          )}
                        </div>
                      </div>

                      {!stop.collapsed && (
                        <>
                          {/* location line */}
                          <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 sm:px-5">
                            {stop.importNotes && <Field label="Imported stop notes"><textarea value={stop.importNotes} onChange={(event) => updateStop(stop.key, { importNotes: event.target.value })} className={`${inputBase} mb-2 p-2 text-xs`} /></Field>}
                            <div className="flex items-center gap-2 text-sm">
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              <span className={`min-w-0 flex-1 truncate ${locationText ? "text-slate-600" : "text-slate-400"}`}>
                                {locationText || "The address fills in when you pick a store."}
                              </span>
                              <button type="button" onClick={() => updateStop(stop.key, { editLocation: !stop.editLocation })}
                                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#2678b9] hover:text-[#1d5f94]">
                                <Pencil className="h-3 w-3" /> {stop.editLocation ? "Done" : "Edit"}
                              </button>
                            </div>
                            {stop.editLocation && (
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <Field label="Customer"><input value={stop.customer} onChange={(e) => updateStop(stop.key, { customer: e.target.value })} className={inputSm} /></Field>
                                <Field label="Province"><input value={stop.province} onChange={(e) => updateStop(stop.key, { province: e.target.value })} className={inputSm} /></Field>
                                <Field label="City"><input value={stop.city} onChange={(e) => updateStop(stop.key, { city: e.target.value })} className={inputSm} /></Field>
                                <Field label="Ship-to address or end user"><input value={stop.address} onChange={(e) => updateStop(stop.key, { address: e.target.value })} className={inputSm} /></Field>
                              </div>
                            )}
                          </div>

                          {/* product lines */}
                          <div className="px-4 pb-4 pt-3 sm:px-5">
                            <div className={`hidden gap-2 px-3 pb-1.5 text-xs font-medium text-slate-500 sm:grid ${LINE_GRID}`}>
                              <span>Product code</span><span>Qty</span><span>Total CBM</span><span>DR no.</span><span />
                            </div>

                            <div className="space-y-2">
                              {stop.items.map((item, ii) => (
                                <div key={item.key} className="rounded-lg border border-slate-200 bg-white">
                                  <div className={`grid grid-cols-2 items-end gap-2 p-2.5 sm:items-center ${LINE_GRID}`}>
                                    <div className="col-span-2 sm:col-span-1">
                                      <span className="mb-1 block text-xs text-slate-500 sm:hidden">Product code</span>
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
                                        accessToken?<div className={`${inputSm} flex items-center`}><SearchableRelationshipEditor token={accessToken} kind="products" value={labelOf(productOptions,item.productId)??""} autoFocus={false} disabled={saving} onSelect={option=>pickProduct(stop.key,item.key,option.id,option)} onCommitBlur={()=>{}} onCancel={()=>{}}/></div>:null
                                      )}
                                    </div>
                                    <div>
                                      <span className="mb-1 block text-xs text-slate-500 sm:hidden">Qty</span>
                                      <input type="number" inputMode="numeric" min="0" step="1" value={item.qty} aria-label="Quantity"
                                        onChange={(e) => updateItem(stop.key, item.key, { qty: e.target.value })} className={inputSm} placeholder="0" />
                                    </div>
                                    <div>
                                      <span className="mb-1 block text-xs text-slate-500 sm:hidden">Total CBM</span>
                                      <input type="number" inputMode="decimal" min="0" step="any" value={item.cbm} aria-label="Total CBM"
                                        onChange={(e) => updateItem(stop.key, item.key, { cbm: e.target.value })} className={inputSm} placeholder="0" />
                                    </div>
                                    <div className="col-span-2 sm:col-span-1">
                                      <span className="mb-1 block text-xs text-slate-500 sm:hidden">DR no.</span>
                                      <input value={item.dr} aria-label="DR number" onChange={(e) => updateItem(stop.key, item.key, { dr: e.target.value })} className={inputSm} placeholder="8910914441" />
                                    </div>
                                    <div className="col-span-2 flex items-center justify-end gap-0.5 sm:col-span-1">
                                      <button type="button" onClick={() => updateItem(stop.key, item.key, { open: !item.open })}
                                        aria-label={item.open ? "Hide more details" : "Show more details"} aria-expanded={item.open} title="More details"
                                        className={`rounded-lg p-2 transition ${item.open ? "bg-[#2678b9]/10 text-[#2678b9]" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"}`}>
                                        <SlidersHorizontal className="h-4 w-4" />
                                      </button>
                                      <button type="button" disabled={stop.items.length === 1} aria-label={`Remove product line ${ii + 1}`}
                                        onClick={() => updateStop(stop.key, { items: stop.items.filter((i) => i.key !== item.key) })}
                                        className="rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-30">
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </div>

                                  {item.open && (
                                    <div className="grid gap-3 border-t border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
                                      {([["SP number", "sp"], ["DN no.", "dn"], ["SO no.", "so"], ["SAP SO no.", "sapSo"], ["Customer PO", "customerPo"], ["PO no.", "po"]] as const).map(([label, field]) => (
                                        <Field key={field} label={label}>
                                          <input value={item[field]} onChange={(e) => updateItem(stop.key, item.key, { [field]: e.target.value })} className={inputSm} />
                                        </Field>
                                      ))}
                                      <Field label="Product category" hint={item.addingProduct ? "saved with the new code" : undefined}>
                                        <input value={item.category} onChange={(e) => updateItem(stop.key, item.key, { category: e.target.value })} className={inputSm} placeholder="AC, REF, WM, TV…" />
                                      </Field>
                                      <Field label="Unit CBM">
                                        <div className="flex gap-1.5">
                                          <input type="number" min="0" step="any" value={item.unitCbm} onChange={(e) => updateItem(stop.key, item.key, { unitCbm: e.target.value })} className={inputSm} />
                                          <button type="button" title="Total CBM = qty × unit CBM"
                                            disabled={Boolean(item.cbm.trim()) || !Number.isFinite(num(item.unitCbm)) || num(item.unitCbm) < 0 || !(num(item.qty) > 0)}
                                            onClick={() => updateItem(stop.key, item.key, { cbm: calculatedCbm(item.qty,item.unitCbm), importNotes:[item.importNotes,"Total CBM calculated from quantity and unit CBM."].filter(Boolean).join(" / ") })}
                                            className="h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-[#2678b9] hover:border-[#2678b9]/40 disabled:text-slate-300 disabled:hover:border-slate-200">
                                            Calculate missing total
                                          </button>
                                        </div>
                                      </Field>
                                      <Field label="Item status or instructions">
                                        <input value={item.itemStatus} onChange={(e) => updateItem(stop.key, item.key, { itemStatus: e.target.value })} className={inputSm} />
                                      </Field>
                                      <Field label="Source warehouse" hint="if different">
                                        <input value={item.warehouse} onChange={(e) => updateItem(stop.key, item.key, { warehouse: e.target.value })} className={inputSm} />
                                      </Field>
                                      {item.importNotes && <Field label="Imported line notes" className="sm:col-span-2"><textarea value={item.importNotes} onChange={(event) => updateItem(stop.key, item.key, { importNotes: event.target.value })} className={`${inputBase} min-h-16 p-2 text-xs`} /></Field>}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>

                            <button type="button" onClick={() => updateStop(stop.key, { items: [...stop.items, newItem()] })}
                              className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-[#2678b9] hover:bg-[#2678b9]/10">
                              <Plus className="h-4 w-4" /> Add product line
                            </button>
                          </div>
                        </>
                      )}
                    </article>
                  );
                })}
              </div>

              <button type="button" onClick={() => setStops((l) => [...l, newStop()])}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-3.5 text-sm font-medium text-slate-500 transition hover:border-[#2678b9]/50 hover:bg-white hover:text-[#2678b9]">
                <Plus className="h-4 w-4" /> Add another stop
              </button>
            </>
          )}

          {/* ── step 3: review ── */}
          {step === 2 && (
            <>
              <div>
                <h4 className="text-base font-semibold text-slate-800">Review</h4>
                <p className="mt-0.5 text-sm text-slate-500">Check the details, then create the trip.</p>
              </div>
              <TripTablePreview title="Trip table preview" description="Check the rows below. Use the tabs above to edit, then select Create trip to save." rows={previewRows.length ? previewRows : [previewTrip]} />

              <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-[#0b2341]">Trip details</summary><div className="mt-4">
              <div className="grid gap-4 md:grid-cols-2">
                {([
                  ["Trip", [
                    ["Dispatch reference", dispatchRef || "—"],
                    ["Trip no.", tripReference || (tripReferenceStatus === "setup_required" ? "Existing trip numbering" : "Generated on save")],
                    ["Trip type", tripTypeLabel ?? "Not set"],
                    ["Status", sentence(status)],
                    ["Loading date", loadingDate || "Not set"],
                    ["Estimated delivery", etaDate || "Not set"],
                  ]],
                  ["Warehouse and trucks", [
                    ["Warehouse", labelOf(lookups.warehouses, warehouseId) ?? "—"],
                    ["Truck assignments", selectedTruckAssignments.length
                      ? selectedTruckAssignments.map((assignment) => labelOf(lookups.trucks, assignment.truckId) ?? "Unknown truck").join(", ")
                      : "Assign later"],
                    ["Drivers", selectedTruckAssignments.map((assignment) => labelOf(lookups.drivers, assignment.driverId)).filter(Boolean).join(", ") || "Assign later"],
                    ["Remarks", remarks || "None"],
                  ]],
                ] as const).map(([title, rows]) => (
                  <section key={title} className="rounded-xl border border-slate-200 bg-white p-5">
                    <h5 className="text-sm font-semibold text-slate-800">{title}</h5>
                    <dl className="mt-3 space-y-2 text-sm">
                      {rows.map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-4">
                          <dt className="shrink-0 text-slate-400">{k}</dt>
                          <dd className="truncate text-right font-medium text-slate-700">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
              </div></details>

              <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-[#0b2341]">Stops and products ({populatedStops.length})</summary><div className="mt-4">
              <div className="space-y-3">
                {populatedStops.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">No delivery stops entered. You can add stops and products later.</p>}
                {populatedStops.map((stop, i) => {
                  const t = stopTotals(stop);
                  return (
                    <section key={stop.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-3.5">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0b2341] text-xs font-semibold text-white">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800">{labelOf(lookups.stores, stop.storeId) || stop.importNotes || "Store to be assigned"}</p>
                          <p className="truncate text-xs text-slate-500">{[stop.customer, stop.address, stop.city, stop.province].filter(Boolean).join(", ") || "No address"}</p>
                        </div>
                        <p className="shrink-0 text-xs text-slate-500">{fmt(t.qty, 0)} qty · {fmt(t.cbm)} CBM</p>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-slate-400">
                            <th className="px-5 py-2 font-medium">Product code</th>
                            <th className="px-2 py-2 font-medium">DR no.</th>
                            <th className="px-2 py-2 text-right font-medium">Qty</th>
                            <th className="px-5 py-2 text-right font-medium">CBM</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {stop.items.filter(hasItemData).map((item) => (
                            <tr key={item.key}>
                              <td className="px-5 py-2 text-slate-700">
                                {productLabel(item) ?? "—"}
                                {!item.productId && item.newCode.trim() && !matchExisting(item.newCode) && (
                                  <span className="ml-2 rounded bg-[#2678b9]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#2678b9]">New</span>
                                )}
                              </td>
                              <td className="px-2 py-2 text-slate-500">{item.dr || "—"}</td>
                              <td className="px-2 py-2 text-right tabular-nums text-slate-700">{item.qty || "—"}</td>
                              <td className="px-5 py-2 text-right tabular-nums text-slate-700">{item.cbm || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>
                  );
                })}
              </div>
              </div></details>
            </>
          )}
        </div>

        {/* footer */}
        <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          {error && (
            <div className="mb-3 max-h-32 overflow-y-auto"><TripFormNotice tone="error" title="Check the trip details" onDismiss={() => setError("")}>{error}</TripFormNotice></div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs text-slate-500 sm:text-sm">
              <Package className="h-4 w-4 text-slate-400" />
              <span>{populatedStops.length} stop{populatedStops.length === 1 ? "" : "s"} · {fmt(totals.qty, 0)} qty · {fmt(totals.cbm)} CBM</span>
            </p>
            <div className="ml-auto flex items-center gap-2">
              {step === 0 ? (
                <button type="button" onClick={onClose} disabled={saving}
                  className="rounded-full px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700">Cancel</button>
              ) : (
                <button type="button" onClick={() => goTo(Math.max(0, step - 1))} disabled={saving || importing}
                  className="inline-flex items-center gap-1 rounded-full px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
              )}
              <button type="submit" disabled={saving || importing || csvGroups.length > 0}
                className="inline-flex items-center gap-2 rounded-full bg-[#ffd43b] px-5 py-2.5 text-sm font-semibold text-[#0b2341] transition hover:bg-[#f2c200] disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Creating trip…</> : isLast ? "Create trip" : <>Next <ChevronRight className="h-4 w-4" /></>}
              </button>
            </div>
          </div>
        </footer>
      </form>
    </div>
  );
}
