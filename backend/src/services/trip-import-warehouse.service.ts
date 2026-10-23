import { supabaseAdmin } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import type { ImportRow, ImportTarget } from "./trip-import.logic.js";

const identity = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
// Legacy code-only RPC targets use workflow_identity, which does not apply NFKC.
const legacyCodeIdentity = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const active = (status: unknown) => !["INACTIVE", "DISABLED", "ARCHIVED", "RETIRED"].includes(String(status ?? "ACTIVE").toUpperCase());
export type WarehouseMatch = { status: "matched"|"missing"|"conflict"; id?: string; label?: string; candidates: Array<{id:string;code:string;name:string}> };

/** Read the catalog once per preview, not once per row. Codes and names match
 * exactly; word reordering and inferred locations cannot create a match. */
export async function matchImportWarehouses(rows: ImportRow[]): Promise<Record<string, WarehouseMatch>> {
  const sources = [...new Set(rows.map(row => row.values.source_warehouse).filter((value): value is string => Boolean(value)))];
  if (!sources.length) return {};
  const catalog: Array<{id:string;code:string;name:string}> = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin.from("warehouses").select("id,code,name,status").order("id").range(offset, offset + 999);
    if (error) throw new ApiError("Unable to match source warehouses. Retry the preview.", 503);
    for (const warehouse of data ?? []) if (active(warehouse.status)) catalog.push({ id: String(warehouse.id), code: String(warehouse.code ?? ""), name: String(warehouse.name ?? "") });
    if ((data?.length ?? 0) < 1000) break;
  }
  const byNameOrCode = new Map<string, Map<string, typeof catalog[number]>>();
  for (const warehouse of catalog) for (const value of [warehouse.code, warehouse.name]) {
    if (!value) continue;
    const key = identity(value), matches = byNameOrCode.get(key) ?? new Map();
    matches.set(warehouse.id, warehouse); byNameOrCode.set(key, matches);
  }
  return Object.fromEntries(sources.map(source => {
    const candidates = [...(byNameOrCode.get(identity(source))?.values() ?? [])];
    return [source, candidates.length === 1 ? { status: "matched", candidates, id: candidates[0].id, label: `${candidates[0].code} / ${candidates[0].name}` } : { status: candidates.length ? "conflict" : "missing", candidates }];
  }));
}

/** Recheck selected IDs once at commit. Unknown labels never create warehouses;
 * mutable warehouse records are not cached across requests. */
export async function checkImportWarehouseTargets(rows: ImportRow[], target: ImportTarget) {
  const ids = new Set<string>();
  const legacyCodes: string[] = [];
  if (target.origin_warehouse_id) ids.add(target.origin_warehouse_id);
  if (target.trip_details?.origin_warehouse_id) ids.add(target.trip_details.origin_warehouse_id);
  for (const source of new Set(rows.map(row => row.values.source_warehouse).filter((value): value is string => Boolean(value)))) {
    const id = target.warehouse_ids?.[source];
    if (id) ids.add(id); else legacyCodes.push(source);
  }
  // Older recoverable batches may contain code-only targets. Keep their immutable
  // target snapshot intact, while ensuring the RPC can only reuse existing codes.
  if (legacyCodes.length) {
    const matches = await matchImportWarehouses(rows.filter(row => legacyCodes.includes(row.values.source_warehouse ?? "")));
    for (const source of legacyCodes) {
      const match = matches[source];
      if (match?.status !== "matched" || legacyCodeIdentity(match.candidates[0].code) !== legacyCodeIdentity(source)) {
        throw new ApiError(`Choose an existing warehouse for ${source} before saving this group.`, 400, "IMPORT_WAREHOUSE_REVIEW_REQUIRED");
      }
      ids.add(match.id!);
    }
  }
  if (!ids.size) return;
  const { data, error } = await supabaseAdmin.from("warehouses").select("id,status").in("id", [...ids]);
  if (error) throw new ApiError("Unable to confirm selected import warehouses.", 503);
  const available = new Set((data ?? []).filter(warehouse => active(warehouse.status)).map(warehouse => String(warehouse.id)));
  if ([...ids].some(id => !available.has(id))) throw new ApiError("A selected warehouse is no longer available. Review the existing warehouse selection.", 409);
}
