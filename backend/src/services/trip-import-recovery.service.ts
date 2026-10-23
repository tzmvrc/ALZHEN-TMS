import { supabaseAdmin as db } from "../config/supabase.js";
import { ApiError } from "../utils/api-response.js";
import { isValidUuid } from "../utils/validation.js";
import { workflowFailure } from "./trip-workflow.service.js";
import { readImportSourceHistory } from "./trip-import-history.service.js";
import { validateImportTripDetails } from "./import-trip-details.logic.js";

type Draft = Record<string, any>;
type Batch = { id: string; created_at: string; updated_at: string; workflow_revision: number; workflow_draft: Draft; workflow_outcomes: Record<string,any>; last_error: string | null };
type ImportRow = { batch_id: string; source_identity: string; status: string; line_item_id: string | null; error_details: string | null; group_key: string };
type ImportGroup = { batch_id: string; group_key: string; trip_id: string | null; allocation_plan: unknown; target: Record<string, unknown> };
function summary(batch: Batch, rows: ImportRow[], groups: ImportGroup[]) {
  const sourceRows = batch.workflow_draft.preview?.rows;
  const expected = (Array.isArray(sourceRows) ? sourceRows : []).filter((row: any) => !row.errors?.length);
  const imported = rows.filter(row => row.status === "imported" && row.line_item_id).length;
  const resolved = expected.filter((source:any)=>rows.some(row=>row.source_identity===source.source_identity&&row.status==="imported"&&row.line_item_id)||(batch.workflow_outcomes?.[source.source_identity]?.status==="skipped"&&batch.workflow_outcomes?.[source.source_identity]?.line_item_id)).length;
  const failed = [...new Map([...Object.values(batch.workflow_outcomes ?? {}).filter(row => row.status === "failed" || row.status === "skipped" && !row.line_item_id).map(row => ({ source_identity: row.source_identity, error_details: row.error ?? "Historical import has no remaining product record." })), ...rows.filter(row => row.status === "failed" || row.status === "imported" && !row.line_item_id)].map(row => [row.source_identity, row])).values()];
  const pending = groups.filter(group => !group.allocation_plan && batch.workflow_draft.plans?.[group.group_key]?.trucks?.length).length;
  const location_retry_required = batch.workflow_draft.locationFollowupPending === true || Boolean(batch.last_error?.startsWith("Trip rows were saved, but location details or admin notifications are incomplete."));
  const state = location_retry_required ? "Partially Imported" : failed.length ? imported ? "Partially Imported" : "Failed" : batch.workflow_draft.preview && !expected.length ? "Completed" : !resolved ? batch.last_error ? "Failed" : "Pending" : resolved < expected.length ? "Partially Imported" : pending ? "Awaiting Allocation" : "Completed";
  return { id: batch.id, created_at: batch.created_at, updated_at: batch.updated_at, revision: batch.workflow_revision, state, imported, failed: failed.length, awaiting_allocation: pending, location_retry_required, last_error: batch.last_error ?? failed[0]?.error_details ?? null };
}
async function ownedBatch(actor: string, id: string): Promise<Batch> {
  if (!isValidUuid(id)) throw new ApiError("Choose a valid import batch.", 400);
  const result = await db.from("trip_import_batches").select("id,created_at,updated_at,workflow_revision,workflow_draft,workflow_outcomes,last_error").eq("id", id).eq("created_by", actor).maybeSingle();
  if (result.error) workflowFailure(result.error);
  if (!result.data) throw new ApiError("Import batch not found for this account.", 404);
  return result.data as Batch;
}
async function batchRecords(id: string | string[]) {
  const rows: ImportRow[] = [], groups: ImportGroup[] = [];
  for (const kind of ["rows", "groups"] as const) {
    for (let offset = 0; ; offset += 1000) {
      const result = await db.from(`trip_import_${kind}`).select(kind === "rows" ? "batch_id,source_identity,status,line_item_id,error_details,group_key" : "batch_id,group_key,trip_id,allocation_plan,target").in("batch_id", typeof id === "string" ? [id] : id).order("batch_id").order(kind === "rows" ? "source_identity" : "group_key").range(offset, offset + 999);
      if (result.error) workflowFailure(result.error);
      if (kind === "rows") rows.push(...(result.data ?? []) as unknown as ImportRow[]);
      else groups.push(...(result.data ?? []) as unknown as ImportGroup[]);
      if ((result.data?.length ?? 0) < 1000) break;
      if (offset >= 49000) throw new ApiError("This batch exceeds the recovery page limit. Contact an administrator.", 400);
    }
  }
  return { rows, groups };
}
export async function readImportBatch(actor: string, id: string) {
  const batch = await ownedBatch(actor, id), { rows, groups } = await batchRecords(id);
  const outcomes = {...batch.workflow_outcomes};
  for(const row of rows)outcomes[row.source_identity]={ ...outcomes[row.source_identity], source_identity: row.source_identity, status: row.status, line_item_id: row.line_item_id, trip_id: groups.find(group => group.group_key === row.group_key)?.trip_id, trip_created: groups.find(group => group.group_key === row.group_key)?.target.mode !== "trip", error: row.error_details };
  const sourceRows = batch.workflow_draft.preview?.rows ?? [];
  const history = await readImportSourceHistory(sourceRows.map((row: { source_identity: string }) => row.source_identity));
  // Never modify the frozen signed preview to refresh mutable import history.
  for (const [identity, item] of Object.entries(history)) {
    if (item.status === "missing") outcomes[identity] = { source_identity: identity, status: "failed", error: `CSV row ${item.source_row}, ${item.model}: previous import history has no remaining product record. Review explicit source recovery.` };
    else if (item.status === "live") outcomes[identity] = { ...outcomes[identity], source_identity: identity, status: item.batch_id === id ? "imported" : "skipped", line_item_id: item.line_item_id, trip_id: item.trip_id, original_batch_id: item.batch_id, error: undefined };
  }
  return { ...summary(batch, rows, groups), history, draft: batch.workflow_draft, outcomes: Object.values(outcomes), cargo_saved: Object.fromEntries(groups.filter(group => group.allocation_plan).map(group => [group.group_key, true])) };
}
export async function listImportBatches(actor: string) {
  const result = await db.from("trip_import_batches").select("id,created_at,updated_at,workflow_revision,workflow_draft,workflow_outcomes,last_error").eq("created_by", actor).order("updated_at", { ascending: false }).limit(30);
  if (result.error) workflowFailure(result.error);
  const batches = (result.data ?? []) as Batch[];
  if (!batches.length) return [];
  const { rows, groups } = await batchRecords(batches.map(batch => batch.id));
  return batches.map(batch => summary(batch, rows.filter(row => row.batch_id === batch.id), groups.filter(group => group.batch_id === batch.id)));
}
export async function saveImportDraft(actor: string, id: string, input: Record<string, unknown>) {
  if (!isValidUuid(id) || !Number.isSafeInteger(input.revision) || Number(input.revision) < 0 || !input.draft || typeof input.draft !== "object" || Array.isArray(input.draft)) throw new ApiError("A batch, draft and revision are required.", 400);
  const draft = input.draft as Draft;
  if (draft.trip_details !== undefined) validateImportTripDetails(draft.trip_details, true);
  if (draft.targets && typeof draft.targets === "object") for (const target of Object.values(draft.targets) as Array<Record<string, unknown>>) if (target?.trip_details !== undefined) validateImportTripDetails(target.trip_details, true);
  if (!Array.isArray(draft.files) || !draft.plans || typeof draft.plans !== "object" || Array.isArray(draft.plans) || !draft.targets || typeof draft.targets !== "object" || Array.isArray(draft.targets) || (draft.preview != null && !Array.isArray(draft.preview.rows))) throw new ApiError("Invalid import draft structure.", 400);
  const result = await db.rpc("save_trip_import_draft_v1", { p_actor: actor, p_batch: id, p_revision: input.revision, p_draft: draft });
  if (result.error) workflowFailure(result.error);
  return result.data;
}
export async function rememberImportBatchError(actor: string, id: unknown, error: unknown) {
  if (typeof id !== "string" || !isValidUuid(id)) return;
  const result = await db.from("trip_import_batches").update({ last_error: error instanceof Error ? error.message.slice(0, 2000) : "Import interrupted", updated_at: new Date().toISOString() }).eq("id", id).eq("created_by", actor);
  if (result.error) console.error("Unable to retain import recovery reason", { code: result.error.code });
}
