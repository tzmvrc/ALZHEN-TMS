import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";

export type SourceHistory = { status: "live" | "missing" | "failed"; batch_id: string; line_item_id: string | null; trip_id?: string; source_row: number; model: string | null; imported_at: string | null };
/** A ledger flag alone is not proof that the product still exists. */
export async function readImportSourceHistory(identities: string[]): Promise<Record<string, SourceHistory>> {
  const history: Record<string, SourceHistory> = {};
  const unique = [...new Set(identities)];
  for (let offset = 0; offset < unique.length; offset += 100) {
    const result = await supabaseAdmin.from("trip_import_rows").select("source_identity,batch_id,status,line_item_id,source_row,imported_at,model:source_values->>customer_model").in("source_identity", unique.slice(offset, offset + 100));
    if (result.error) throw new ApiError("Unable to inspect source import history. Retry before saving.", 503);
    const ids = [...new Set((result.data ?? []).map(row => row.line_item_id).filter((id): id is string => Boolean(id)))];
    const lines = ids.length ? await supabaseAdmin.from("trip_line_items").select("id,trip_id").in("id", ids) : { data: [], error: null };
    if (lines.error) throw new ApiError("Unable to confirm imported product records. Retry before saving.", 503);
    const byId = new Map((lines.data ?? []).map(line => [line.id, line]));
    for (const row of result.data ?? []) {
      const line = row.line_item_id ? byId.get(row.line_item_id) : undefined;
      history[row.source_identity] = { status: row.status === "imported" ? line ? "live" : "missing" : "failed", batch_id: row.batch_id, line_item_id: line?.id ?? null,
        ...(line ? { trip_id: line.trip_id } : {}), source_row: row.source_row, model: row.model, imported_at: row.imported_at };
    }
  }
  return history;
}
