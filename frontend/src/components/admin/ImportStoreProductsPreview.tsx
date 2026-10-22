import { useMemo, useState } from "react";
import { customerStoreKey, storeLocationLabel } from "../../services/store-location";
import TripTablePreview, { type TripPreviewRow } from "./TripTablePreview";

export type StoreProductPreviewRow = {
  source_identity: string; values: Record<string, string | null>; group: string;
  filename?: string; line?: number; duplicate?: boolean; store_only?: boolean;
  preview?: TripPreviewRow;
};

/** Keep individual source products intact; only their destination is grouped. */
export default function ImportStoreProductsPreview({ rows }: { rows: StoreProductPreviewRow[] }) {
  const [selected, setSelected] = useState("");
  const [storePage, setStorePage] = useState(0);
  const stores = useMemo(() => {
    const grouped = new Map<string, { key: string; values: StoreProductPreviewRow["values"]; groups: Set<string>; products: StoreProductPreviewRow[] }>();
    for (const row of rows) {
      const key = customerStoreKey(row.values);
      let store = grouped.get(key);
      if (!store) { store = { key, values: row.values, groups: new Set(), products: [] }; grouped.set(key, store); }
      store.groups.add(row.group);
      if (!row.store_only) store.products.push(row);
    }
    return [...grouped.values()];
  }, [rows]);
  if (!stores.length) return null;
  const current = Math.min(storePage, Math.floor((stores.length - 1) / 20));
  const store = stores.find(item => item.key === selected) ?? stores[0];
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
  const cell = "border-b border-slate-100 px-3 py-2.5 text-left align-top";
  return <section aria-label="Stores and their products" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="p-4 sm:p-5"><h3 className="text-sm font-semibold text-[#0b2341]">Stores &amp; products by delivery location</h3><p className="mt-1 text-xs text-slate-500">Each Ship To + Province + City is a separate store location within its customer. All products for that location appear together, with their original trip groups preserved.</p></div>
    <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-50 text-slate-600"><tr>{["Ship To", "Province", "City", "Customer / trip group", "Products"].map(label => <th key={label} className={cell}>{label}</th>)}</tr></thead><tbody>
      {stores.slice(current * 20, current * 20 + 20).map(item => <tr key={item.key} className={item.key === store.key ? "bg-blue-50/60" : ""}>
        <td className={cell}>{item.values.ship_to}</td><td className={cell}>{item.values.province || "Missing province"}</td><td className={cell}>{item.values.city || "Missing city"}</td><td className={cell}>{item.values.customer_name}<span className="mt-1 block text-slate-500">{[...item.groups].join(", ")}</span></td>
        <td className={cell}><button type="button" aria-pressed={item.key === store.key} className="whitespace-nowrap font-medium text-[#2678b9] hover:underline" onClick={() => setSelected(item.key)}>{item.products.length} product line{item.products.length === 1 ? "" : "s"} — View</button></td>
      </tr>)}
    </tbody></table></div>
    {stores.length > 20 && <div className="flex items-center justify-end gap-3 p-3 text-xs"><button type="button" disabled={!current} onClick={() => setStorePage(current - 1)}>Previous stores</button><span>{current + 1} / {Math.ceil(stores.length / 20)}</span><button type="button" disabled={(current + 1) * 20 >= stores.length} onClick={() => setStorePage(current + 1)}>Next stores</button></div>}
    <div className="border-t border-slate-200 bg-slate-50/60 p-4"><TripTablePreview key={store.key} rows={products} title={`Products for ${storeLocationLabel(store.values)}`} description="Read-only preview. Each product stays linked to this store location. Use the input forms to make changes." productColumns /></div>
  </section>;
}
