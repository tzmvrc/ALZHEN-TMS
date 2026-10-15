/* Pulls the useful bits (DR number, receiver, model codes, date) out of raw OCR text so the
   admin checks four fields instead of reading a wall of text. Heuristics only: every value
   stays editable, and a wrong guess is cheaper to fix than retyping. */

export type ReceiptFields = { dr: string; receiver: string; models: string; date: string };
export type ReceiptSnapshot = { raw: string; fields: ReceiptFields };

export const EMPTY_SNAPSHOT: ReceiptSnapshot = {
  raw: "",
  fields: { dr: "", receiver: "", models: "", date: "" },
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_RE = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";

function iso(year: number, month: number, day: number): string {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function findDate(text: string): string {
  let match = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (match) return iso(+match[1], +match[2], +match[3]);
  match = text.match(new RegExp(`\\b(\\d{1,2})[-/.\\s]*${MONTH_RE}[-/.,\\s]*(20\\d{2})\\b`, "i"));
  if (match) return iso(+match[3], MONTHS[match[2].toLowerCase()], +match[1]);
  match = text.match(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2}),?\\s+(20\\d{2})\\b`, "i"));
  if (match) return iso(+match[3], MONTHS[match[1].toLowerCase()], +match[2]);
  match = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (match) {
    const [first, second] = [+match[1], +match[2]];
    return first > 12 ? iso(+match[3], second, first) : iso(+match[3], first, second);
  }
  return "";
}

const DR_PATTERNS = [
  /\b(?:d\.?\s?r\.?|delivery\s+receipt)\s*(?:no\.?|number|#)\s*[:.-]?\s*([A-Z0-9][A-Z0-9-]{2,24})/i,
  /\bcontrol\s*(?:no\.?|number|#)\s*[:.-]?\s*([A-Z0-9][A-Z0-9-]{3,24})/i,
];

function findReceiver(text: string): string {
  const match = text.match(
    /(?:received\s+by|receiver|name\s+of\s+receiver|signed\s+by|customer\s+signature)\s*(?:\(?over\s+printed\s+name\)?)?\s*[:.-]?\s*([A-Za-z][A-Za-z .,'-]{2,50})/i,
  );
  const value = match?.[1].replace(/[\s.,'-]+$/, "").trim() ?? "";
  return /^(date|signature|name)\b/i.test(value) ? "" : value;
}

const MONTH_TOKEN = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{2,4}$/;

function findModels(text: string, exclude: string): string {
  const tokens = text.toUpperCase().match(/\b(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{3,17}\b/g) ?? [];
  const unique = [...new Set(tokens)].filter((token) => !MONTH_TOKEN.test(token) && !/^(PO|SO|TIN)-/.test(token) && token !== exclude.toUpperCase());
  return unique.slice(0, 6).join(", ");
}

export function extractFields(raw: string): ReceiptFields {
  let dr = "";
  for (const pattern of DR_PATTERNS) {
    dr = raw.match(pattern)?.[1] ?? "";
    if (dr) break;
  }
  return { dr, receiver: findReceiver(raw), models: findModels(raw, dr), date: findDate(raw) };
}

/* ---- saving: the reviewed fields travel in a small header above the scanned text, so
   nothing has to change in the backend. ---- */

const MARKER = "--- Scanned text ---";
const HEADER_KEYS: Array<[keyof ReceiptFields, string]> = [
  ["dr", "DR Number"],
  ["receiver", "Receiver"],
  ["models", "Model Codes"],
  ["date", "Delivery Date"],
];

export function composeSaved({ fields, raw }: ReceiptSnapshot): string {
  const header = HEADER_KEYS.map(([key, label]) => `${label}: ${fields[key].trim()}`).join("\n");
  return `${header}\n${MARKER}\n${raw.trim()}`;
}

export function splitSaved(text: string): { header: Partial<ReceiptFields>; raw: string } {
  const at = text.indexOf(MARKER);
  if (at === -1) return { header: {}, raw: text };
  const header: Partial<ReceiptFields> = {};
  for (const line of text.slice(0, at).split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const label = line.slice(0, colon).trim();
    const key = HEADER_KEYS.find(([, name]) => name === label)?.[0];
    if (key) header[key] = line.slice(colon + 1).trim();
  }
  return { header, raw: text.slice(at + MARKER.length).replace(/^\n/, "") };
}

export function snapshotOf(text: string, driverDr: string): ReceiptSnapshot {
  const { header, raw } = splitSaved(text);
  const found = extractFields(raw);
  return {
    raw,
    fields: {
      dr: header.dr ?? (driverDr.trim() || found.dr),
      receiver: header.receiver ?? found.receiver,
      models: header.models ?? found.models,
      date: header.date ?? found.date,
    },
  };
}

export function sameSnapshot(a: ReceiptSnapshot, b: ReceiptSnapshot): boolean {
  return a.raw === b.raw && (Object.keys(a.fields) as Array<keyof ReceiptFields>).every((key) => a.fields[key] === b.fields[key]);
}