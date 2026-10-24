import StoreEditor from "./shared/StoreEditor";
import { useMemo, type ReactNode } from "react";
import { customerStoreKey } from "../../services/store-location";
import type { TripPreviewRow } from "./TripTablePreview";
import type { LocationDecision } from "./ImportDestinationReview";
import { StoreMasterDetail, StoreProductsTable, StatusChip } from "./shared";
import { cbmDisplay } from "../../services/cbm-display";
import { invalidProduct, navigationNumber, useStoreWorkspaceMemory, type StoreNavigationItem, type StoreWorkspaceMemory } from "./shared/storeWorkspace";

export type StoreProductPreviewRow = {
  source_identity: string; values: Record<string, string | null>; group: string;
  filename?: string; line?: number; duplicate?: boolean; store_only?: boolean;
  preview?: TripPreviewRow;
  file_id?: string; navigation_store_id?: string; navigation_row_id?: string; location_verified?: boolean; errors?: readonly string[];
};

/** Keep individual source products intact; only their destination is grouped. */
export default function ImportStoreProductsPreview({ rows, navigation, locations, toolbar, helper, onAdd, disabled }: { rows: StoreProductPreviewRow[]; navigation?: StoreWorkspaceMemory; locations?: Record<string, LocationDecision>; toolbar?: ReactNode; helper?: ReactNode; onAdd?: () => void; disabled?: boolean }) {
  const local = useStoreWorkspaceMemory(), memory = navigation ?? local;
  const rowId = (row: StoreProductPreviewRow) => row.navigation_row_id ?? (row.file_id != null && row.line != null ? `${row.file_id}:${row.line}` : row.source_identity);
  const stores = useMemo(() => {
    const grouped = new Map<string, { key: string; values: StoreProductPreviewRow["values"]; source: StoreProductPreviewRow; groups: Set<string>; products: StoreProductPreviewRow[] }>();
    for (const row of rows) {
      const key = row.navigation_store_id ?? customerStoreKey(row.values);
      let store = grouped.get(key);
      if (!store) { store = { key, values: row.values, source: row, groups: new Set(), products: [] }; grouped.set(key, store); }
      store.groups.add(row.group);
      if (!row.store_only) store.products.push(row);
    }
    return [...grouped.values()];
  }, [rows]);
  const items: StoreNavigationItem[] = stores.map(store => {
    const location = locations?.[customerStoreKey(store.values)];
    return { id: store.source.navigation_store_id ?? rowId(store.source), title: store.values.ship_to || "Unassigned store", customer: store.values.customer_name ?? "", city: store.values.city ?? "", province: store.values.province ?? "",
      products: store.products.length, qty: store.products.reduce((sum, row) => sum + navigationNumber(row.values.quantity), 0), cbm: store.products.reduce((sum, row) => sum + navigationNumber(row.values.cbm), 0),
      status: store.products.some(row => row.errors?.length || invalidProduct(row.values)) ? "attention" : !store.values.province?.trim() || !store.values.city?.trim() || !(store.source.location_verified || location?.verified || location?.store_verified) ? "location" : "ready",
      members: [rowId(store.source), ...store.products.map(rowId)], searchText: [Object.values(store.values).join(" "), ...store.products.map(row => Object.values(row.values).join(" "))].join(" ") };
  });
  if (!stores.length) return null;
  return <section aria-label="Stores and their products" className="space-y-4">

    <StoreMasterDetail items={items} memory={memory} toolbar={toolbar} helper={helper} onAdd={onAdd} disabled={disabled}>{item => {
      const store = stores.find(candidate => (candidate.source.navigation_store_id ?? rowId(candidate.source)) === item.id)!;
  const products: TripPreviewRow[] = store.products.map(row => ({
    store: row.values.ship_to ?? "", customer: row.values.customer_name ?? "",
    province: row.values.province ?? "", city: row.values.city ?? "",
    product: row.values.customer_model ?? "", category: row.values.product_category ?? "",
    qty: row.values.quantity ?? "", unitCbm: row.values.unit_cbm ?? "", cbm: row.values.cbm ?? "",
    dr: row.values.dr_number ?? "", sapSo: row.values.sap_so_number ?? "",
    customerPo: row.values.customer_po_number ?? "", po: row.values.internal_po_number ?? "",
    warehouse: row.values.source_warehouse ?? "", status: row.duplicate ? "Duplicate — skipped on save" : "Not saved",
    tripGroup: row.group, dn: row.values.dn_reference ?? "", sp: row.values.sp_reference ?? "",
    source: row.filename ? `${row.filename}${row.line == null ? "" : `, row ${row.line}`}` : "Manual entry",
    ...row.preview,
  }));
      return <StoreEditor number={stores.indexOf(store) + 1} name={store.values.ship_to || ""} summary={`${store.products.length} product${store.products.length === 1 ? "" : "s"} · ${item.qty} qty · ${item.cbm} CBM`} products={
        <StoreProductsTable rows={store.products} storeId={item.id} memory={memory} rowKey={rowId} searchText={row => [Object.values(row.values).join(" "), row.group, row.filename, row.line, ...Object.values(row.preview ?? {})].join(" ")}
          columns={[
            { key: "code", label: "Product code", render: row => row.preview?.product ?? row.values.customer_model ?? "\u2014" },
            { key: "qty", label: "Qty", render: row => row.preview?.qty ?? row.values.quantity ?? "\u2014" },
            { key: "cbm", label: "Total CBM", render: row => cbmDisplay(row.preview?.cbm ?? row.values.cbm) },
            { key: "dr", label: "DR", render: row => row.preview?.dr ?? row.values.dr_number ?? "\u2014" },
            { key: "status", label: "Status", render: row => <StatusChip label={row.errors?.length || invalidProduct(row.values) ? "Needs attention" : row.duplicate ? "Duplicate - skipped on save" : row.preview?.status || "Not saved"} tone={row.errors?.length || invalidProduct(row.values) || row.duplicate ? "warning" : "neutral"} /> },
          ]}
          renderMore={row => {
            const product = products[store.products.indexOf(row)];
            return <div className="space-y-3"><dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries({ ...row.values, ...product }).map(([key, value]) => <div key={key}><dt className="text-xs font-medium text-slate-500">{key.replace(/_/g, " ")}</dt><dd className="mt-1 break-words text-xs text-slate-800 tabular-nums">{value || "\u2014"}</dd></div>)}</dl>{Boolean(row.errors?.length) && <p className="text-xs text-rose-700">{row.errors?.join(" / ")}</p>}</div>;
          }} />} />;
    }}</StoreMasterDetail>
  </section>;
}
