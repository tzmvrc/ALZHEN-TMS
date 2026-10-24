import { suggestedAddress } from "../../services/address-review";
import { verifiedStoreCoordinates } from "../../services/trip-location.service";
import { useMemo, useRef, useState } from "react";
import { Table2, Upload } from "lucide-react";
import StoreEditor from "./shared/StoreEditor";
import DeliveryStoreField from "./shared/DeliveryStoreField";
import ProductsSection from "./shared/ProductsSection";
import ImportStoreProductsPreview from "./ImportStoreProductsPreview";
import StoreAddressReview from "./StoreAddressReview";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import { destinationKey, type LocationDecision } from "./ImportDestinationReview";
import { importFields, type ImportField } from "./tripImportFiles";
import { storeIdentityText } from "../../services/store-location";
import { cbmDisplay, isCbmField } from "../../services/cbm-display";

import { StoreMasterDetail, StatusChip } from "./shared";
import { fieldControl } from "./shared/styles";
import { invalidProduct, navigationNumber, useStoreWorkspaceMemory, type StoreNavigationItem, type StoreWorkspaceMemory } from "./shared/storeWorkspace";

export type ImportCardRow = { errors?: readonly string[]; file_id: string; filename: string; line: number; group: string; values: Record<string, string | null> };
type Edit = { fileId: string; line: number; field: ImportField; value: string };
const input = `${fieldControl} w-full`;
const primaryFields = [["customer_model", "Product code", "Product code or model"], ["quantity", "Qty", "0"], ["cbm", "CBM", "0"], ["dr_number", "DR", "DR number"]] as const;
const moreFields = importFields.filter(([field]) => !["customer_name", "ship_to", "province", "city", ...primaryFields.map(([key]) => key)].includes(field));
const displayTotal = (rows: ImportCardRow[], field: string) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(rows.reduce((sum, row) => sum + (Number(row.values[field]) || 0), 0));

/** Editable CSV rows retain file/line identity until the checked preview is renewed. */
export default function ImportStoreCards({ token, rows, locations, disabled, identityDisabled = disabled, locationChecking = false, onLocations, onEdit, onAdd, onRemove, navigation, locationProgress, onImport }: {
  token: string; rows: ImportCardRow[]; locations: Record<string, LocationDecision>; disabled: boolean;
  onLocations: (next: Record<string, LocationDecision>) => void; onEdit: (changes: Edit[]) => void;
  onAdd: (row: ImportCardRow) => void; onRemove: (row: ImportCardRow) => void;
  onImport?: () => void; locationChecking?: boolean; identityDisabled?: boolean; navigation?: StoreWorkspaceMemory; locationProgress?: Record<string, string>;
}) {
  const currentLocations = useRef(locations);
  currentLocations.current = locations;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [bulkUndo, setBulkUndo] = useState<{ before: Record<string, LocationDecision | undefined>; after: Record<string, LocationDecision> } | null>(null);
  const localNavigation = useStoreWorkspaceMemory();
  const memory = navigation ?? localNavigation;
  const stores = useMemo(() => {
    const groups = new Map<string, ImportCardRow[]>();
    for (const row of rows) { const key = destinationKey(row.values); const group = groups.get(key) ?? []; group.push(row); groups.set(key, group); }
    return [...groups].map(([key, products]) => ({ key, products, source: products[0] }));
  }, [rows]);
  const items: StoreNavigationItem[] = stores.map(store => {
    const values = store.source.values, location = locations[store.key];
    return { id: `${store.source.file_id}:${store.source.line}`, title: values.ship_to || "Select a destination store", customer: values.customer_name ?? "", city: values.city ?? "", province: values.province ?? "",
      products: store.products.length, qty: store.products.reduce((sum, row) => sum + navigationNumber(row.values.quantity), 0), cbm: store.products.reduce((sum, row) => sum + navigationNumber(row.values.cbm), 0),
      status: store.products.some(row => row.errors?.length || invalidProduct(row.values)) ? "attention" : !values.province?.trim() || !values.city?.trim() || !(location?.verified || location?.store_verified) ? "location" : "ready",
      searchText: store.products.map(row => Object.values(row.values).join(" ")).join(" "), members: store.products.map(row => `${row.file_id}:${row.line}`) };
  });
  const fieldInput = (row: ImportCardRow, field: ImportField, label: string, placeholder = "") => {
    const rowKey = `${row.file_id}:${row.line}`;
    return <label className="min-w-0 text-xs text-slate-500"><span className="sr-only">{label}</span><input key={`${rowKey}:${field}:${row.values[field]}`} aria-label={`${label} source row ${row.line}`} disabled={disabled} className={input} placeholder={placeholder} defaultValue={isCbmField(field) ? cbmDisplay(row.values[field]) : row.values[field] ?? ""} onBlur={event => { const shown = isCbmField(field) ? cbmDisplay(row.values[field]) : row.values[field] ?? ""; if (event.target.value !== shown) onEdit([{ fileId: row.file_id, line: row.line, field, value: event.target.value }]); }} /></label>;
  };
  const suggestions = stores.flatMap(store => {
    const values = store.source.values, decision = locations[store.key] ?? { address: "", province: values.province ?? "", city: values.city ?? "", latitude: "", longitude: "", verified: false, replace_verified: false, update_store_location: false };
    const next = suggestedAddress({ key: store.key, customer: values.customer_name ?? "", shipTo: values.ship_to ?? "", province: values.province ?? "", city: values.city ?? "" }, decision);
    return next ? [{ key: store.key, decision: { ...next, update_store_location: false } }] : [];
  });
  const bulkVerify = () => {
    const before = Object.fromEntries(suggestions.map(item => [item.key, locations[item.key]]));
    const after = Object.fromEntries(suggestions.map(item => [item.key, item.decision]));
    setBulkUndo({ before, after }); onLocations({ ...locations, ...after });
  };
  const undoVerification = () => {
    if (!bulkUndo) return;
    const next = { ...currentLocations.current };
    for (const [key, prior] of Object.entries(bulkUndo.before)) if (JSON.stringify(next[key]) === JSON.stringify(bulkUndo.after[key])) { if (prior) next[key] = prior; else delete next[key]; }
    onLocations(next); setBulkUndo(null);
  };
  const addStop = () => { const source = stores[0]?.source; if (!source) return; memory.search = ""; memory.attention = false; onAdd({ ...source, values: { ...source.values, ship_to: "", province: "", city: "" } }); };
  const controls = <><button type="button" className="stops-view-toggle" aria-pressed={preview} title={preview ? "Edit stops" : "Table preview"} onClick={() => setPreview(value => !value)}><Table2 size={14} /><span>{preview ? "Edit stops" : "Table preview"}</span></button>{onImport && <button type="button" disabled={disabled} className="stops-import-button" title="Import CSV / XLSX" onClick={onImport}><Upload size={14} /><span>Import CSV / XLSX</span></button>}</>;
  const helper = <button type="button" className="text-xs text-[#2678b9]" disabled={disabled || !suggestions.length} onClick={bulkVerify}>Verify all suggested matches ({suggestions.length})</button>;
  return <section aria-label="Delivery stores and products" className="space-y-6">

    {error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
    {bulkUndo && <div role="status" className="address-bulk-notice">Suggested matches confirmed.<button type="button" onClick={undoVerification}>Undo</button></div>}
    {preview ? <ImportStoreProductsPreview rows={rows.map(row => ({ ...row, source_identity: `${row.file_id}:${row.line}` }))} navigation={memory} locations={locations} toolbar={controls} helper={helper} onAdd={addStop} disabled={disabled} /> : <StoreMasterDetail items={items} memory={memory} toolbar={controls} helper={helper} onAdd={addStop} disabled={disabled}>{item => {
      const store = stores.find(candidate => `${candidate.source.file_id}:${candidate.source.line}` === item.id)!;
      const index = stores.indexOf(store);
      const values = store.source.values;
      const decision: LocationDecision = locations[store.key] ?? { address: "", province: values.province ?? "", city: values.city ?? "", latitude: "", longitude: "", verified: false, replace_verified: false, update_store_location: false };
      const updateLocation = (patch: Partial<LocationDecision>) => {
        const current = currentLocations.current;
        onLocations({ ...current, [store.key]: { ...(current[store.key] ?? decision), ...patch } });
      };
      const editStore = (field: ImportField, value: string) => onEdit(store.products.map(row => ({ fileId: row.file_id, line: row.line, field, value })));
      return <StoreEditor key={store.key} number={index + 1} name={values.ship_to || ""} summary={`${store.products.length} product${store.products.length === 1 ? "" : "s"} · ${displayTotal(store.products, "quantity")} qty · ${displayTotal(store.products, "cbm")} CBM`} editing={Boolean(expanded[store.key])} disabled={identityDisabled}
        onEdit={() => setExpanded(state => ({ ...state, [store.key]: !state[store.key] }))}
        deliveryStore={<DeliveryStoreField name={decision.store_label ?? values.ship_to ?? ""} selected={Boolean(values.ship_to)} disabled={identityDisabled}>{onPicked => <SearchableRelationshipEditor presentation="form" token={token} kind="stores" autoFocus={false} disabled={identityDisabled} customerId={decision.customer_id} value={decision.store_label ?? values.ship_to ?? ""} onCommitBlur={() => {}} onCancel={() => {}} onSelect={option => {
            const selected = option.values ?? {};
            if (storeIdentityText(selected.store_name) !== storeIdentityText(values.ship_to) || (values.province && storeIdentityText(selected.province) !== storeIdentityText(values.province)) || (values.city && storeIdentityText(selected.city) !== storeIdentityText(values.city))) { setError("Choose a store matching this Ship To / Province / City. A different branch needs its own card."); return; }
            const changedPoint = ["address", "province", "city", "latitude", "longitude"].some(field => String(selected[field] ?? "").trim() !== String(decision[field as keyof LocationDecision] ?? "").trim());
            if ((decision.verified || decision.store_verified) && !decision.replace_verified && (decision.store_id !== option.id || changedPoint)) { setError("Allow replacing this verified location before choosing a different store record or point."); return; }
            const verified = verifiedStoreCoordinates(selected);
            setError(""); updateLocation({ store_id: option.id, store_label: option.label, customer_id: selected.customer_id, address: selected.address ?? "", province: selected.province ?? "", city: selected.city ?? "", latitude: selected.latitude ?? "", longitude: selected.longitude ?? "", store_verified: verified, verified, replace_verified: false, pin_address_mismatch: false }); onPicked();
          }} />}</DeliveryStoreField>}
        address={<StoreAddressReview token={token} source={{ key: store.key, customer: values.customer_name ?? "", shipTo: values.ship_to ?? "", province: values.province ?? "", city: values.city ?? "" }} decision={decision} disabled={disabled} checking={Boolean(locationProgress?.[store.key]?.startsWith("Checking")) || (locationChecking && !decision.lookup && !locationProgress)} progress={locationProgress?.[store.key]} onChange={updateLocation} />} details={expanded[store.key] && <div className="grid gap-4 sm:grid-cols-2">{([["ship_to", "Ship To"], ["customer_name", "Customer name"], ["province", "Province"], ["city", "City"]] as const).map(([field, label]) => <label key={field} className="text-xs text-slate-500">{label}<input key={`${store.key}:${field}:${values[field]}`} aria-label={label} disabled={disabled} className={`${input} mt-1.5`} defaultValue={values[field] ?? ""} onBlur={event => { if (event.target.value !== (values[field] ?? "")) editStore(field, event.target.value); }} /></label>)}<div className="sm:col-span-2"><span className="mb-1 block text-xs text-slate-500">Customer record</span><SearchableRelationshipEditor presentation="form" token={token} kind="customers" value={values.customer_name ?? ""} autoFocus={false} disabled={identityDisabled} onSelect={option => updateLocation({ customer_id: option.id, store_id: undefined, store_label: undefined, store_verified: false, verified: false })} onCommitBlur={() => {}} onCancel={() => {}} /></div></div>} products={<ProductsSection rows={store.products} storeId={item.id} memory={memory} disabled={disabled}
            rowKey={row => `${row.file_id}:${row.line}`} searchText={row => Object.values(row.values).join(" ") + ` ${row.filename} ${row.line} ${row.group}`}
            columns={[...primaryFields.map(([field, label, placeholder]) => ({ key: field, label, render: (row: ImportCardRow) => fieldInput(row, field, label, placeholder) })),
              { key: "status", label: "Status", render: (row: ImportCardRow) => <div><StatusChip label={row.errors?.length || invalidProduct(row.values) ? "Needs attention" : "Not saved"} tone={row.errors?.length || invalidProduct(row.values) ? "warning" : "neutral"} /><span className="mt-1 block text-[11px] text-slate-500">Source row {row.line}</span></div> }]}
            onRemove={onRemove} removeLabel={row => `Remove product source row ${row.line}`} onAdd={() => onAdd(store.source)}
            renderMore={row => <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{moreFields.map(([field, label]) => <div key={field}><span className="mb-1 block text-xs text-slate-500">{label}</span>{fieldInput(row, field, label)}</div>)}<p className="text-[11px] text-slate-500 sm:col-span-2 lg:col-span-3">{row.filename}, row {row.line} / {row.group}</p>{Boolean(row.errors?.length) && <p role="status" className="text-xs text-rose-700 sm:col-span-2 lg:col-span-3">{row.errors?.join(" / ")}</p>}</div>} />} />;
    }}</StoreMasterDetail>}
  </section>;
}
