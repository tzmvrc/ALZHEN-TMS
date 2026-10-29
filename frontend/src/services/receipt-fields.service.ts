import {readPodSerialMetadata,type PodSerialMetadata} from './pod-serials';
/* Pulls the useful bits (DR number, receiver, model codes, date) out of raw OCR text so the
   admin checks four fields instead of reading a wall of text. Heuristics only: every value
   stays editable, and a wrong guess is cheaper to fix than retyping. */

export type ReceiptFields = { dr: string; receiver: string; models: string; date: string };
export type PodProductSelection={allocation_id:string;line_item_id:string;assignment_id:string;trip_stop_id:string;product_id?:string|null;dr_number:string;model:string;quantity:number};
export type ReceiptSnapshot = { raw: string; fields: ReceiptFields; modelQuantities?: Record<string,number>; productSelections?:PodProductSelection[]; podSerials?:PodSerialMetadata };

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

export function composeSaved({ fields, raw, modelQuantities, productSelections, podSerials }: ReceiptSnapshot): string {
  const header = HEADER_KEYS.map(([key, label]) => `${label}: ${fields[key].trim()}`).join("\n");
  const quantities=modelQuantities===undefined?'':`\nModel Quantities: ${JSON.stringify(Object.fromEntries(Object.entries(modelQuantities).filter(([,quantity])=>Number.isSafeInteger(quantity)&&quantity>=0)))}`;
  return `${header}${quantities}${productSelections===undefined?'':`\nProduct Selections: ${JSON.stringify(productSelections)}`}${podSerials===undefined?'':`\nPOD Serials: ${JSON.stringify(podSerials)}`}\n${MARKER}\n${raw.trim()}`;
}

export function splitSaved(text: string): { header: Partial<ReceiptFields>; raw: string; modelQuantities?:Record<string,number>;productSelections?:PodProductSelection[];podSerials?:PodSerialMetadata } {
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
  let modelQuantities:Record<string,number>|undefined;
  const metadata=text.slice(0,at).split('\n').find(line=>line.startsWith('Model Quantities: '));
  if(metadata){try{const value:unknown=JSON.parse(metadata.slice('Model Quantities: '.length));if(value&&typeof value==='object'&&!Array.isArray(value))modelQuantities=Object.fromEntries(Object.entries(value).filter((entry):entry is [string,number]=>typeof entry[1]==='number'&&Number.isSafeInteger(entry[1])&&entry[1]>=0));}catch{/* Historical receipt text stays readable without metadata. */}}
  let podSerials:PodSerialMetadata|undefined;
  let productSelections:PodProductSelection[]|undefined;
  const productLine=text.slice(0,at).split('\n').find(line=>line.startsWith('Product Selections: '));
  if(productLine){productSelections=[];try{const value:unknown=JSON.parse(productLine.slice('Product Selections: '.length));if(Array.isArray(value))productSelections=value.filter((item):item is PodProductSelection=>!!item&&typeof item==='object'&&['allocation_id','line_item_id','assignment_id','trip_stop_id','dr_number','model'].every(key=>typeof item[key]==='string'&&item[key].trim().length>0&&item[key].length<=200)&&Number.isSafeInteger(item.quantity)&&item.quantity>=0);}catch{/* An invalid identity block must never fall back to matching every model name. */}}
  const serialLine=text.slice(0,at).split('\n').find(line=>line.startsWith('POD Serials: '));
  if(serialLine){try{const value=JSON.parse(serialLine.slice('POD Serials: '.length));podSerials=readPodSerialMetadata(value);}catch{/* Legacy text is still available for review. */}}
  return { ...(podSerials?{podSerials}:{}),...(productSelections===undefined?{}:{productSelections}),header, raw: text.slice(at + MARKER.length).replace(/^\n/, ""),...(modelQuantities===undefined?{}:{modelQuantities}) };
}

export function snapshotOf(text: string, driverDr: string): ReceiptSnapshot {
  const { header, raw, modelQuantities, productSelections, podSerials } = splitSaved(text);
  const found = extractFields(raw);
  return {
    raw,
    ...(modelQuantities===undefined?{}:{modelQuantities}),
    ...(podSerials?{podSerials}:{}),
    ...(productSelections===undefined?{}:{productSelections}),
    fields: {
      dr: header.dr ?? (driverDr.trim() || found.dr),
      receiver: header.receiver ?? found.receiver,
      models: header.models ?? found.models,
      date: header.date ?? found.date,
    },
  };
}

export function sameSnapshot(a: ReceiptSnapshot, b: ReceiptSnapshot): boolean {
  return JSON.stringify(a.productSelections??null)===JSON.stringify(b.productSelections??null) && JSON.stringify(a.podSerials??null)===JSON.stringify(b.podSerials??null) && JSON.stringify(Object.entries(a.modelQuantities??{}).sort())===JSON.stringify(Object.entries(b.modelQuantities??{}).sort()) && a.raw === b.raw && (Object.keys(a.fields) as Array<keyof ReceiptFields>).every((key) => a.fields[key] === b.fields[key]);
}
/** Link prepared page hashes to actual Storage attachment records, once uploads succeed. */
export function linkPodSerialAttachments(text:string,files:Array<{pageId?:string;uploadedId?:string}>){
 const snapshot=snapshotOf(text,'');if(!snapshot.podSerials)return text;
 const links=new Map(files.filter(file=>file.pageId&&file.uploadedId).map(file=>[file.pageId!,file.uploadedId!]));
 snapshot.podSerials={...snapshot.podSerials,pages:snapshot.podSerials.pages.map(page=>({...page,...(links.has(page.id)?{attachmentId:links.get(page.id)!}:{})}))};
 return composeSaved(snapshot);
}
