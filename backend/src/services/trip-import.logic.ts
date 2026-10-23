import { createHash } from "node:crypto";
import { masterImportValues } from "./master-list-import.logic.js";
import { SOURCE_FIELD_LABELS, mappingConflicts, type ImportField } from "../../../packages/trip-import/index.js";
import type { TripDetails } from "../../../packages/trip-import/trip-details.js";

export const SOURCE_FIELDS = SOURCE_FIELD_LABELS;
export type SourceField = keyof typeof SOURCE_FIELDS;
export type SourceValues = Record<SourceField, string | null>;
export type SourceFile = { name: string; headers?: string[]; column_mapping?: Array<ImportField|null>; mapping_errors?: string[]; rows: Array<{ line: number; values: Record<string, unknown>; group: string; original_values?: Record<string,string>; unmapped?: Record<string, string> }> };
export type ImportTarget = { mode: "new" | "dispatch" | "trip"; value: string; allow_create: boolean; warehouse_ids?: Record<string,string>; origin_warehouse_id?: string; trip_details?: TripDetails };
export type ImportRow = {
  master_values?: Record<string, string | null>;
  filename: string; line: number; group: string; values: SourceValues; errors: string[]; warnings: string[];
  document_hash: string; source_identity: string; fingerprint: string; signature?: string;
  duplicate?: boolean; potential_duplicate?: boolean;
  original_values?: Record<string,string>;
  unmapped?: Record<string, string>;
};
export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const rowFingerprint = (values: SourceValues) => digest([
  values.dr_number, values.dn_reference, values.sp_reference, values.order_item_number,
  values.sap_so_number, values.so_number, values.customer_po_number, values.internal_po_number,
  values.customer_name, values.ship_to, values.customer_model,
]);

/** Keep identifiers as text and decimals as strings; PostgreSQL numeric receives the original precision. */
export function decimal(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim().replaceAll(",", "");
  if (!/^\d+(?:\.\d+)?$/.test(text) || !Number.isFinite(Number(text))) throw new Error(`${label} must be a non-negative decimal.`);
  return text;
}
export function sourceTimestamp(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const input = String(value).trim();
  const match = input.match(/^(?:(\d{4})-(\d{2})-(\d{2})|(\d{1,2})[-/](\d{1,2})[-/](\d{4}))(?:[ T](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,6})?)?)?$/);
  if (!match) throw new Error("SO Approval Date must be YYYY-MM-DD HH:mm:ss or MM-DD-YYYY HH:mm:ss (local source time).");
  const [, y, m, d, mm, dd, yy, h = "00", min = "00", sec = "00", fraction = ""] = match;
  const date = `${y ?? yy}-${(m ?? mm).padStart(2, "0")}-${(d ?? dd).padStart(2, "0")}`;
  const parsed = new Date(`${date}T${h}:${min}:${sec}Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || +h > 23 || +min > 59 || +sec > 59) throw new Error("SO Approval Date is not a valid calendar timestamp.");
  return `${date} ${h}:${min}:${sec}${fraction}`;
}
function scaled(text: string) {
  const [whole, fraction = ""] = text.split(".");
  return { number: BigInt(whole + fraction), scale: fraction.length };
}
export function cbmMatches(qty: string, unit: string, total: string): boolean {
  const q = scaled(qty), u = scaled(unit), t = scaled(total);
  const scale = Math.max(q.scale + u.scale, t.scale);
  return q.number * u.number * 10n ** BigInt(scale - q.scale - u.scale) === t.number * 10n ** BigInt(scale - t.scale);
}
export function prepareImport(files: SourceFile[]): ImportRow[] {
  if (!Array.isArray(files) || !files.length) throw new Error("Choose at least one CSV or XLSX file.");
  const result: ImportRow[] = [];
  for (const file of files) {
    if (!file || typeof file.name !== "string" || !Array.isArray(file.rows)) throw new Error("Invalid import file.");
    if (file.headers !== undefined) {
      if (!Array.isArray(file.headers) || file.headers.some(header => typeof header !== "string")) throw new Error("Invalid source headers.");
      const conflicts = mappingConflicts(file.headers, file.column_mapping ?? []);
      if (conflicts.length) throw new Error(`${file.name}: ${conflicts.join(" ")}`);
    }
    if (file.mapping_errors?.length) throw new Error(`${file.name}: resolve conflicting column mappings before checking rows.`);
    const rows = file.rows.map(row => {
      if (!row || !Number.isSafeInteger(row.line) || row.line < 1 || !row.values || typeof row.group !== "string") throw new Error("Invalid source row.");
      const errors: string[] = [], warnings: string[] = [];
      const master_values = masterImportValues(row.values, warnings, errors);
      const values = Object.fromEntries(Object.keys(SOURCE_FIELDS).map(key => {
        const raw = row.values[key];
        if (raw !== null && raw !== undefined && typeof raw !== "string" && typeof raw !== "number") throw new Error(`Invalid ${key} value.`);
        return [key, raw === null || raw === undefined || String(raw).trim() === "" ? null : String(raw).trim()];
      })) as SourceValues;
      for (const key of ["quantity", "stock_quantity", "unit_cbm", "cbm"] as const) {
        try { values[key] = decimal(values[key], SOURCE_FIELDS[key]); } catch (e) { errors.push((e as Error).message); }
      }
      try { values.so_approval_date = sourceTimestamp(values.so_approval_date); } catch (e) { errors.push((e as Error).message); }
      if (!values.customer_name) errors.push("Map Customer Name to a customer before importing this row.");
      if (!values.ship_to) errors.push("Map Ship To to a destination before importing this row.");
      if (!values.customer_model && !values.dr_number && !values.sp_reference && !values.dn_reference) errors.push("No product or source identifier found.");
      if (!row.group.trim()) errors.push("Choose a trip group for this row.");
      if (values.quantity && values.unit_cbm && values.cbm && !errors.some(e => e.includes("decimal")) && !cbmMatches(values.quantity, values.unit_cbm, values.cbm)) warnings.push("Total CBM differs from Qty × CBM. Confirm the supplied total before importing.");
      if (row.original_values && (typeof row.original_values !== "object" || Object.values(row.original_values).some(value=>typeof value!=="string"))) throw new Error("Original source cells must be text.");
      if (!values.province) warnings.push("Destination province is missing. Keep its location unverified until reviewed.");
      if (!values.city) warnings.push("Destination city is missing. Keep its location unverified until reviewed.");
      const unmapped = Object.fromEntries(Object.entries(row.unmapped ?? {}).map(([key, value]) => {
        if (typeof value !== "string") throw new Error("Unmapped source cells must be text.");
        return [key, value];
      }));
      return { ...row, values, errors, warnings, unmapped, master_values };
    });
    // Filename and grouping are deliberately excluded: renaming a file or changing a trip cannot duplicate it.
    const document_hash = digest(rows.map(row => Object.keys(row.master_values).length ? [row.values, row.unmapped, row.master_values] : Object.keys(row.unmapped).length ? [row.values, row.unmapped] : row.values));
    for (const [index, row] of rows.entries()) result.push({ filename: file.name, line: row.line, group: row.group.trim(), values: row.values, errors: row.errors, warnings: row.warnings, unmapped: row.unmapped, original_values: row.original_values,
      master_values: row.master_values, document_hash, source_identity: digest([document_hash, index]), fingerprint: rowFingerprint(row.values) });
  }
  return result;
}
