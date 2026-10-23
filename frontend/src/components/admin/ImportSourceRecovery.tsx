import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import type { ImportRow, ImportOutcome, ImportSourceHistory, ImportRowResolution } from "../../services/trip-import.service";

export default function ImportSourceRecovery({ token, rows, history, outcomes, resolutions, disabled, onChange }: {
  token: string; rows: ImportRow[]; history: Record<string, ImportSourceHistory>; outcomes: Record<string, ImportOutcome>;
  resolutions: Record<string, ImportRowResolution>; disabled: boolean;
  onChange: (identity: string, patch: Partial<ImportRowResolution>) => void;
}) {
  const review = rows.filter(row => history[row.source_identity]?.status === "missing" || outcomes[row.source_identity]?.status === "failed" || row.potential_duplicate);
  if (!review.length) return null;
  return <section className="space-y-3 rounded-2xl border border-amber-200 bg-white p-5">
    <h3 className="font-semibold text-[#0b2341]">Source history and failed product review</h3>
    <p className="text-xs text-slate-600">Missing historical products require explicit recovery approval. Select existing product matches where needed; source identifiers, quantities and CBM remain unchanged. Resolve missing customers and stores in their cards below. Existing records are never replaced by these choices.</p>
    {review.map(row => {
      const identity = row.source_identity, item = history[identity], choice = resolutions[identity] ?? {};
      return <div key={identity} className="space-y-2 rounded-xl border border-slate-200 p-3 text-xs">
        <strong>{row.filename}, CSV row {row.line}: {row.values.customer_model}</strong>
        <p>{row.values.ph_truck_reference} / DR {row.values.dr_number} / DN {row.values.dn_reference} / SO {row.values.so_number}</p>
        <p>Expected Qty {row.values.quantity}; Total CBM {row.values.cbm}</p>
        <p className="text-amber-800">{outcomes[identity]?.error ?? (item?.status === "missing" ? "Imported history has no remaining product record. This is not a live duplicate." : "Potential business match: review the full source identity, including product model.")}</p>
        {item?.status === "missing" && <label className="flex gap-2"><input type="checkbox" disabled={disabled} checked={Boolean(choice.restore_missing_source && choice.restore_history_version === item.imported_at)} onChange={event => onChange(identity, { restore_missing_source: event.target.checked, restore_history_version: event.target.checked ? item.imported_at : undefined })} />I reviewed history batch {item.batch_id}, row {item.source_row}. Recreate this missing source product only if it is still absent when saving.</label>}
        <div><p className="mb-1 text-slate-500">Explicit existing product match (optional when its original model already matches)</p><SearchableRelationshipEditor presentation="form" token={token} kind="products" autoFocus={false} disabled={disabled} value={choice.product_label ?? row.values.customer_model ?? ""} onSelect={option => onChange(identity, { product_id: option.id, product_label: option.label, product_match_confirmed: true })} onCancel={() => {}} onCommitBlur={() => {}} /></div>
        {choice.product_id && <button type="button" disabled={disabled} onClick={() => onChange(identity, { product_id: undefined, product_label: undefined, product_match_confirmed: false })} className="text-blue-700">Use original model lookup instead</button>}
      </div>;
    })}
  </section>;
}
