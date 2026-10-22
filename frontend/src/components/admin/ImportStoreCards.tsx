import { useMemo, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import StoreAddressReview from "./StoreAddressReview";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import { destinationKey, type LocationDecision } from "./ImportDestinationReview";
import { importFields, type ImportField } from "./tripImportFiles";
import { storeIdentityText } from "../../services/store-location";
import { cbmDisplay, isCbmField } from "../../services/cbm-display";

export type ImportCardRow = { file_id: string; filename: string; line: number; group: string; values: Record<string, string | null> };
type Edit = { fileId: string; line: number; field: ImportField; value: string };
const input = "w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-[#2678b9] focus:outline-none disabled:bg-slate-50 disabled:text-slate-500";
const primaryFields = [["customer_model", "Product code", "Product code or model"], ["quantity", "Qty", "0"], ["cbm", "Total CBM", "0"], ["dr_number", "DR no.", "DR number"]] as const;
const moreFields = importFields.filter(([field]) => !["customer_name", "ship_to", "province", "city", ...primaryFields.map(([key]) => key)].includes(field));
const displayTotal = (rows: ImportCardRow[], field: string) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(rows.reduce((sum, row) => sum + (Number(row.values[field]) || 0), 0));

/** Editable CSV rows retain file/line identity until the checked preview is renewed. */
export default function ImportStoreCards({ token, rows, locations, disabled, locationChecking = false, onLocations, onEdit, onAdd, onRemove }: {
  token: string; rows: ImportCardRow[]; locations: Record<string, LocationDecision>; disabled: boolean;
  onLocations: (next: Record<string, LocationDecision>) => void; onEdit: (changes: Edit[]) => void;
  onAdd: (row: ImportCardRow) => void; onRemove: (row: ImportCardRow) => void;
  locationChecking?: boolean;
}) {
  const currentLocations = useRef(locations);
  currentLocations.current = locations;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [productPages, setProductPages] = useState<Record<string, number>>({});
  const stores = useMemo(() => {
    const groups = new Map<string, ImportCardRow[]>();
    for (const row of rows) { const key = destinationKey(row.values); const group = groups.get(key) ?? []; group.push(row); groups.set(key, group); }
    return [...groups].map(([key, products]) => ({ key, products, source: products[0] }));
  }, [rows]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(stores.length / 10) - 1));
  return <section aria-label="Delivery stores and products" className="space-y-6">
    <div><h3 className="text-base font-semibold text-[#0b2341]">Stores &amp; products</h3><p className="mt-1 text-xs text-slate-500">Each Ship To / Province / City has its own store card. Edit the imported lines below, then apply changes before reviewing the trip.</p></div>
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
    {stores.slice(currentPage * 10, currentPage * 10 + 10).map((store, index) => {
      const values = store.source.values;
      const productPage = Math.min(productPages[store.key] ?? 0, Math.ceil(store.products.length / 50) - 1);
      const decision: LocationDecision = locations[store.key] ?? { address: "", province: values.province ?? "", city: values.city ?? "", latitude: "", longitude: "", verified: false, replace_verified: false };
      const updateLocation = (patch: Partial<LocationDecision>) => {
        const current = currentLocations.current;
        onLocations({ ...current, [store.key]: { ...(current[store.key] ?? decision), ...patch } });
      };
      const editStore = (field: ImportField, value: string) => onEdit(store.products.map(row => ({ fileId: row.file_id, line: row.line, field, value })));
      return <section key={store.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/50 px-6 py-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0b2341] text-sm font-semibold text-white">{currentPage * 10 + index + 1}</span><div className="min-w-0"><h4 className="truncate text-base font-semibold text-slate-800">{values.ship_to || "Select a destination store"}</h4><p className="text-xs text-slate-500">{store.products.length} products · {displayTotal(store.products, "quantity")} Qty · {displayTotal(store.products, "cbm")} CBM</p><p className="mt-1 text-xs text-slate-500">{[values.province || "Missing province", values.city || "Missing city"].join(" / ")}</p></div></div>
        <div className="space-y-5 p-6">
          <div><div className="mb-1.5 flex items-center justify-between gap-2"><label className="text-sm font-medium text-slate-700">Delivery Store</label><button type="button" disabled={disabled} onClick={() => setExpanded(state => ({ ...state, [store.key]: !state[store.key] }))} className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2678b9]"><Pencil size={12} />{expanded[store.key] ? "Done" : "Edit details"}</button></div><div className={`${input} flex items-center px-2`}><SearchableRelationshipEditor presentation="form" token={token} kind="stores" autoFocus={false} disabled={disabled} customerId={decision.customer_id} value={decision.store_label ?? values.ship_to ?? ""} onCommitBlur={() => {}} onCancel={() => {}} onSelect={option => {
            const selected = option.values ?? {};
            if (storeIdentityText(selected.store_name) !== storeIdentityText(values.ship_to) || (values.province && storeIdentityText(selected.province) !== storeIdentityText(values.province)) || (values.city && storeIdentityText(selected.city) !== storeIdentityText(values.city))) { setError("Choose a store matching this Ship To / Province / City. A different branch needs its own card."); return; }
            setError(""); updateLocation({ store_id: option.id, store_label: option.label, customer_id: selected.customer_id, address: selected.address ?? "", province: selected.province ?? "", city: selected.city ?? "", latitude: selected.latitude ?? "", longitude: selected.longitude ?? "", store_verified: selected.location_verified === "true", verified: false });
          }} /></div></div>
          <StoreAddressReview token={token} source={{ key: store.key, customer: values.customer_name ?? "", shipTo: values.ship_to ?? "", province: values.province ?? "", city: values.city ?? "" }} decision={decision} disabled={disabled} checking={locationChecking && !decision.lookup} onChange={updateLocation} />
          {expanded[store.key] && <div className="grid gap-4 sm:grid-cols-2">{([["ship_to", "Ship To"], ["customer_name", "Customer name"], ["province", "Province"], ["city", "City"]] as const).map(([field, label]) => <label key={field} className="text-xs text-slate-500">{label}<input key={`${store.key}:${field}:${values[field]}`} aria-label={label} disabled={disabled} className={`${input} mt-1.5`} defaultValue={values[field] ?? ""} onBlur={event => { if (event.target.value !== (values[field] ?? "")) editStore(field, event.target.value); }} /></label>)}<div className="sm:col-span-2"><span className="mb-1 block text-xs text-slate-500">Customer record</span><SearchableRelationshipEditor presentation="form" token={token} kind="customers" value={values.customer_name ?? ""} autoFocus={false} disabled={disabled} onSelect={option => updateLocation({ customer_id: option.id, store_id: undefined, store_label: undefined, store_verified: false, verified: false })} onCommitBlur={() => {}} onCancel={() => {}} /></div></div>}
        </div>
        <div className="border-t border-slate-100 bg-slate-50/50 p-6"><div className="mb-4 flex items-center justify-between"><h5 className="text-sm font-semibold text-slate-800">Products for this store</h5><span className="text-xs text-slate-500">{store.products.length} lines</span></div><div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">{store.products.slice(productPage * 50, productPage * 50 + 50).map(row => {
          const rowKey = `${row.file_id}:${row.line}`;
          const edit = (field: ImportField, value: string) => onEdit([{ fileId: row.file_id, line: row.line, field, value }]);
          const fieldInput = (field: ImportField, label: string, placeholder = "", primary = false) => <label key={field} className={`min-w-0 text-xs text-slate-500 ${primary ? field === "customer_model" ? "sm:col-span-4" : "sm:col-span-2" : ""}`}>{label}<input key={`${rowKey}:${field}:${row.values[field]}`} aria-label={`${label} source row ${row.line}`} disabled={disabled} className={`${input} mt-1.5`} placeholder={placeholder} defaultValue={isCbmField(field) ? cbmDisplay(row.values[field]) : row.values[field] ?? ""} onBlur={event => { const shown = isCbmField(field) ? cbmDisplay(row.values[field]) : row.values[field] ?? ""; if (event.target.value !== shown) edit(field, event.target.value); }} /></label>;
          return <div key={rowKey} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="grid grid-cols-1 items-end gap-3 p-4 sm:grid-cols-12">{primaryFields.map(([field, label, placeholder]) => fieldInput(field, label, placeholder, true))}<div className="flex justify-end gap-1 sm:col-span-2"><button type="button" aria-expanded={Boolean(expanded[rowKey])} className="rounded-lg px-2.5 py-2 text-xs font-medium text-[#2678b9]" onClick={() => setExpanded(state => ({ ...state, [rowKey]: !state[rowKey] }))}>More</button><button type="button" disabled={disabled} aria-label={`Remove product source row ${row.line}`} className="rounded-lg p-2 text-slate-400 hover:text-rose-600" onClick={() => onRemove(row)}><Trash2 size={15} /></button></div></div>{expanded[rowKey] && <div className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-3">{moreFields.map(([field, label]) => fieldInput(field, label))}<p className="text-[11px] text-slate-400 sm:col-span-2 lg:col-span-3">{row.filename}, row {row.line} / {row.group}</p></div>}</div>;
        })}</div>{store.products.length > 50 && <div className="mt-3 flex items-center justify-end gap-3 text-xs text-slate-500"><button type="button" disabled={!productPage} onClick={() => setProductPages(state => ({ ...state, [store.key]: productPage - 1 }))}>Previous products</button><span>{productPage + 1} / {Math.ceil(store.products.length / 50)}</span><button type="button" disabled={(productPage + 1) * 50 >= store.products.length} onClick={() => setProductPages(state => ({ ...state, [store.key]: productPage + 1 }))}>Next products</button></div>}<button type="button" disabled={disabled} onClick={() => onAdd(store.source)} className="mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#2678b9] hover:bg-blue-50"><Plus size={16} />Add product line</button></div>
      </section>;
    })}
    {stores.length > 10 && <div className="flex justify-end gap-3 text-xs"><button type="button" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Previous stores</button><span>{currentPage + 1} / {Math.ceil(stores.length / 10)}</span><button type="button" disabled={(currentPage + 1) * 10 >= stores.length} onClick={() => setPage(currentPage + 1)}>Next stores</button></div>}
  </section>;
}
