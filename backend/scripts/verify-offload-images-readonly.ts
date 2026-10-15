/** Read-only receipt access check. Never prints signed URLs, storage paths or keys. */
import { supabaseAdmin } from "../src/config/supabase.js";
import { getOperationsOverview } from "../src/services/operations-report.service.js";

async function main() {
const { data: receipts, error } = await supabaseAdmin.from("report_receipts").select("storage_path,mime_type").not("offload_id", "is", null).limit(10);
if (error) throw new Error(`Receipt metadata read failed (${error.code}).`);
let verified = 0;
for (const receipt of receipts ?? []) {
  const { data, error: signingError } = await supabaseAdmin.storage.from("report-receipts").createSignedUrl(receipt.storage_path, 60);
  if (signingError || !data?.signedUrl) throw new Error("Existing receipt signing failed.");
  const response = await fetch(data.signedUrl, { method: "HEAD" });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error(`Existing receipt access failed (${response.status}).`);
  verified++;
}
console.log(JSON.stringify({ existingOffloadImagesChecked: verified, allAccessible: true }));
const { data: profile, error: profileError } = await supabaseAdmin.from("profiles").select("id,role").in("role", ["ADMIN", "STAFF"]).limit(1).maybeSingle();
if (profileError || !profile) throw new Error("No management profile is available for a read-only service projection check.");
const overview = await getOperationsOverview({ profileId: profile.id, role: profile.role });
for (const row of overview.event_rows.filter((row) => row.source_type === "OFFLOAD")) {
  if (row.offload_records.length !== 1 || row.offload_records[0].id !== row.source_record_id || row.offload_records[0].trip_id !== row.trip_id || row.offload_records[0].trip_stop_id !== row.trip_stop_id) throw new Error("Offload projection identity mismatch.");
}
console.log(JSON.stringify({ readOnlyServiceOffloadRows: overview.event_rows.filter((row) => row.source_type === "OFFLOAD").length, transactionChoices: overview.trip_options.reduce((count, trip) => count + (trip.stops.length || 1), 0), physicalIdentitiesMatch: true }));
}
void main().catch((cause) => { console.error(cause instanceof Error ? cause.message : "Receipt verification failed."); process.exitCode = 1; });
