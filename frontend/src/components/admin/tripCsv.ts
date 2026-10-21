export const csvFields = {
  dispatch: ["dispatch no", "dispatch number"], trip: ["trip no", "trip number"],
  loadingDate: ["loading date", "email date"], eta: ["estimated delivery date", "eta"],
  tripType: ["trip type"], plate: ["plate no", "plate number"],
  phTruck: ["ph truck name", "phtrruck", "phtruck", "truck name"],
  orderItem: ["order item no", "order item number"], stocks: ["stocks", "stock quantity"],
  approvalDate: ["so approval date"],
  warehouse: ["wh code", "warehouse", "ship from"], store: ["ship to", "ship-to", "ship_to", "ship to name", "ship to code", "ship to / destination", "store", "store name", "store code", "destination", "destination name", "delivery destination", "delivered to"],
  customer: ["customer name", "customer"], product: ["customer model", "product code", "model code", "sku"],
  category: ["product category", "category"], qty: ["qty", "quantity"],
  unitCbm: ["cbm", "unit cbm"], cbm: ["total cbm"], dr: ["dr", "dr number", "dr no"],
  sapSo: ["sap so no", "sap so number"], customerPo: ["customer po"], po: ["po no", "internal po number"],
  sp: ["sp", "sp number"], dn: ["dn", "dn no"], so: ["so no", "so number"],
  province: ["province"], city: ["city"], address: ["ship to address", "address"],
  notes: ["remarks", "comments"], itemStatus: ["delivery status", "item status"],
} as const;
export type CsvField = keyof typeof csvFields;
export type CsvTripRow = { line: number; values: Record<CsvField, string>; extra: string };
export type CsvTripGroup = { key: string; label: string; rows: CsvTripRow[] };
const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Quoted commas, escaped quotes, embedded newlines, CRLF and Excel's UTF-8 BOM. */
export function parseCsv(text: string, onRow?: (line: number) => void): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const firstLine = source.split(/\r?\n/, 1)[0];
  const separator = firstLine.startsWith("sep=") ? firstLine.slice(4, 5) : ",";
  const input = firstLine.startsWith("sep=") ? source.slice(source.indexOf("\n") + 1) : source;
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false, closed = false;
  let line = firstLine.startsWith("sep=") ? 2 : 1, rowLine = line;
  const pushRow = () => { row.push(cell); if (row.some(value => value.trim())) { rows.push(row); onRow?.(rowLine); } row = []; cell = ""; closed = false; };
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else { cell += char; if (char === "\n" || (char === "\r" && input[index + 1] !== "\n")) line++; }
    } else if (char === separator) { row.push(cell); cell = ""; closed = false; }
    else if (char === "\n" || char === "\r") { if (char === "\r" && input[index + 1] === "\n") index++; pushRow(); line++; rowLine = line; }
    else if (char === '"' && !cell && !closed) quoted = true;
    else if (closed && char.trim()) throw new Error("Invalid CSV: unexpected text after a quoted value.");
    else if (char === '"') throw new Error("Invalid CSV: quotes inside a value must be escaped.");
    else if (!closed) cell += char;
  }
  if (quoted) throw new Error("Invalid CSV: a quoted value was not closed.");
  if (cell || row.length) pushRow();
  return rows;
}

export function readTripCsv(text: string): CsvTripGroup[] {
  const [headers, ...records] = parseCsv(text);
  if (!headers || !records.length) throw new Error("Choose a CSV containing a header row and at least one data row.");
  const keys = headers.map(normalize);
  const fieldIndexes = Object.fromEntries(Object.entries(csvFields).map(([field, aliases]) => [field, aliases.map(alias => keys.indexOf(normalize(alias))).find(index => index >= 0) ?? -1])) as Record<CsvField, number>;
  if (!["product", "store", "dr", "qty", "cbm"].some(field => fieldIndexes[field as CsvField] >= 0)) throw new Error("No trip columns found. Use the booking or dispatch report CSV headers.");
  const used = new Set(Object.values(fieldIndexes));
  const groups = new Map<string, CsvTripGroup>();
  for (const [index, record] of records.entries()) {
    if (record.length > headers.length) throw new Error(`CSV row ${index + 2} has more values than headers. Put values containing commas in quotes.`);
    const values = Object.fromEntries(Object.entries(fieldIndexes).map(([field, position]) => [field, position < 0 ? "" : (record[position] ?? "").trim()])) as Record<CsvField, string>;
    // Ignore formatting-only rows from Excel exports.
    if (!Object.values(values).some(Boolean)) continue;
    const identity = values.dispatch || [values.loadingDate, values.warehouse, values.plate].join(" / ");
    const key = JSON.stringify([identity, values.trip]);
    const group = groups.get(key) ?? { key, label: `${values.dispatch || identity.replaceAll(" / ", " ").trim() || "Trip without reference"}${values.trip ? ` · Trip ${values.trip}` : ""}`, rows: [] };
    group.rows.push({ line: index + 2, values, extra: headers.flatMap((header, column) => !used.has(column) && record[column]?.trim() ? [`${header}: ${record[column].trim()}`] : []).join(" · ") });
    groups.set(key, group);
  }
  if (!groups.size) throw new Error("No trip records found in the CSV.");
  return [...groups.values()];
}

export function csvNumber(value: string, field: string, line: number, whole = false): string {
  if (!value.trim()) return "";
  const normalized = value.trim().replaceAll(",", "");
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0 || (whole && !Number.isSafeInteger(number))) throw new Error(`CSV row ${line}: ${field} must be a non-negative ${whole ? "whole " : ""}number.`);
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error(`CSV row ${line}: ${field} must be a non-negative decimal.`);
  return normalized;
}

export function csvDate(value: string): string {
  if (!value) return "";
  let date = value.slice(0, 10);
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) date = `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  const timestamp = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(timestamp.getTime()) || timestamp.toISOString().slice(0, 10) !== date) throw new Error(`Invalid date “${value}”. Use YYYY-MM-DD or M/D/YYYY.`);
  return date;
}

export function tripCapacity(total: number, capacities: Array<number | null>) {
  const known = capacities.filter((capacity): capacity is number => capacity !== null && Number.isFinite(capacity) && capacity > 0);
  const capacity = known.reduce((sum, value) => sum + value, 0);
  const unknown = known.length !== capacities.length;
  const difference = Math.round((total - capacity) * 1e8) / 1e8;
  return { capacity, unknown, full: capacities.length > 0 && !unknown && difference >= 0, exceeded: capacities.length > 0 && !unknown && difference > 0, overflow: Math.max(0, difference) };
}
