export const MASTER_IMPORT_FIELDS = ["page_no", "dispatch_number", "added_to_report", "remarks", "trip_type", "letter_status", "plate_number", "trucking_company", "trip_number", "request_received_at", "added_by_name", "warehouse_code", "ship_from", "incident_date", "backload_reason", "backload_number_of_boxes", "ir_status", "ir_submitted_date", "backload_comments", "offload_number_of_boxes", "offload_reason", "delivery_status", "finish_unloading_time", "pod_status", "signed_dr_upload_date", "transmittal_date", "tms_date", "tms_done_by_name", "pod_ac_shipping_date", "lbc_tracking_number", "pod_remarks", "invoice_number"];
const dates = new Set(["request_received_at", "incident_date", "ir_submitted_date", "finish_unloading_time", "signed_dr_upload_date", "transmittal_date", "tms_date", "pod_ac_shipping_date"]);

export function masterImportValues(input: Record<string, unknown>, warnings: string[], errors: string[]) {
  const result: Record<string, string | null> = {};
  for (const key of MASTER_IMPORT_FIELDS) {
    const raw = input[key];
    if (raw == null || raw === "") continue;
    if (typeof raw !== "string" && typeof raw !== "number" && typeof raw !== "boolean") { errors.push(`Invalid ${key} value.`); continue; }
    let value = String(raw).trim();
    if (!value) continue;
    if (/^#(?:ERROR!|REF!|N\/A|VALUE!|DIV\/0!|NAME\?|NUM!|SPILL!)/i.test(value)) {
      warnings.push(`${key} contains an Excel error; its original text is retained in provenance.`); continue;
    }
    try {
      if (["backload_number_of_boxes", "offload_number_of_boxes"].includes(key)) {
        value = value.replaceAll(",", "");
        if (!/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) throw new Error(`${key} must be a non-negative decimal.`);
      }
      if (key === "added_to_report") {
        if (/^(true|yes|1)$/i.test(value)) value = "true";
        else if (/^(false|no|0)$/i.test(value)) value = "false";
        else throw new Error("Added to report? must be yes/no or true/false.");
      }
      if (dates.has(key)) {
        const named = /^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/.exec(value);
        const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
        if (named) {
          const month = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(named[2].toLowerCase()) + 1;
          value = `${named[3].length === 2 ? "20" + named[3] : named[3]}-${String(month).padStart(2,"0")}-${named[1].padStart(2,"0")}`;
        } else if (slash) value = `${slash[3]}-${slash[1].padStart(2,"0")}-${slash[2].padStart(2,"0")}`;
        if (/^(1899|1900)-/.test(value)) { warnings.push(`${key} contains an Excel zero-date; the original cell is retained in provenance.`); continue; }
        const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
        if (!/^\d{4}-\d{2}-\d{2}(?:$|[ T])/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value.slice(0,10)) throw new Error(`${key} must contain a valid date.`);
        value = date.toISOString();
      }
      result[key] = value;
    } catch (error) { errors.push((error as Error).message); }
  }
  if (result.dispatch_number || result.trip_number) warnings.push("Imported dispatch and trip references are retained in provenance; generated trip identifiers and the selected import target remain authoritative.");
  return result;
}
