import { parseCsv, type CsvField } from "./tripCsv";
import { IMPORT_COLUMN_DEFINITIONS, detectColumnAssignments, columnCandidates, mappingConflicts, mappingFromAssignments, normalizeColumnName, type ImportField as SharedImportField } from "../../../../packages/trip-import/index.js";
export const importFields = IMPORT_COLUMN_DEFINITIONS.map(column => [column.field, column.label, column.csvField] as const) as ReadonlyArray<readonly [SharedImportField,string,CsvField]>;
export type ImportField = SharedImportField;
export type ImportFile = { id: string; name: string; headers: string[]; originalHeaders?: string[]; mapping: Record<ImportField, number>; columnMapping?: Array<ImportField|null>; rows: { line: number; cells: string[]; originalCells?: string[]; group: string }[] };
export function editImportRows(files: ImportFile[], changes: Array<{ fileId: string; line: number; field: ImportField; value: string }>): ImportFile[] {
  return files.map(file => {
    const edits = changes.filter(change => change.fileId === file.id);
    if (!edits.length) return file;
    const byRow = new Map<number, typeof edits>();
    for (const edit of edits) { const row = byRow.get(edit.line) ?? []; row.push(edit); byRow.set(edit.line, row); }
    const headers = [...file.headers], mapping = { ...file.mapping }, columnMapping = sourceAssignments(file);
    for (const edit of edits) if (mapping[edit.field] < 0) { mapping[edit.field] = headers.length; headers.push(importFields.find(([field]) => field === edit.field)![1]); columnMapping.push(edit.field); }
    return { ...file, originalHeaders: file.originalHeaders ?? [...file.headers], headers, mapping, columnMapping, rows: file.rows.map(row => {
      const rowEdits = byRow.get(row.line);
      if (!rowEdits) return row;
      const cells = [...row.cells];
      for (const edit of rowEdits) cells[mapping[edit.field]] = edit.value;
      return { ...row, originalCells: row.originalCells ?? [...row.cells], cells };
    }) };
  });
}
export function detectImportMapping(headers: string[]) {
  return mappingFromAssignments(headers, detectColumnAssignments(headers));
}
export function sourceAssignments(file: ImportFile): Array<ImportField|null> {
  if (file.columnMapping?.length === file.headers.length) return [...file.columnMapping];
  return file.headers.map((_, index) => importFields.find(([field]) => file.mapping[field] === index)?.[0] ?? null);
}
export function importMappingProblems(file: ImportFile): string[] {
  const errors = mappingConflicts(file.headers, sourceAssignments(file));
  if (!file.columnMapping) for (const [index, header] of file.headers.entries()) {
    if (importFields.filter(([field]) => file.mapping[field] === index).length > 1) errors.push(`${header} maps to more than one destination. Select its intended field.`);
  }
  return errors;
}
export function setSourceMapping(file: ImportFile, index: number, destination: ImportField|null): ImportFile {
  const columnMapping = sourceAssignments(file); columnMapping[index] = destination;
  return { ...file, columnMapping, mapping: mappingFromAssignments(file.headers, columnMapping) };
}
export function importColumnReport(file: ImportFile) {
  const assignments = sourceAssignments(file), candidates = columnCandidates(file.headers);
  return file.headers.map((header, index) => {
    const field = assignments[index];
    const conflict = field != null && assignments.filter(other => other === field).length > 1
      || !file.columnMapping && importFields.filter(([key]) => file.mapping[key] === index).length > 1;
    const status = conflict ? "Conflicting Mapping" : field ? candidates[index].length === 1 && candidates[index][0] === field ? "Automatically Matched" : "Manually Matched" : candidates[index].length > 1 ? "Conflicting Mapping" : "Needs Manual Mapping";
    return { index, header, field, status, sample: file.rows.find(row => row.cells[index]?.trim())?.cells[index] ?? "" };
  });
}
export const importFormatKey = (file: ImportFile) => JSON.stringify(file.headers.map(normalizeColumnName));
export function importMappingSummary(file: ImportFile) {
  const sourceHeaders = file.originalHeaders ?? file.headers;
  const mapped = new Set(Object.values(file.mapping));
  return {
    sourceColumns: sourceHeaders.length,
    mappedSourceColumns: sourceHeaders.filter((_, index) => mapped.has(index)).length,
    optionalFields: importFields.filter(([key]) => file.mapping[key] < 0 || file.mapping[key] >= sourceHeaders.length).map(([, label]) => label),
    unmappedColumns: sourceHeaders.filter((_, index) => !mapped.has(index)),
  };
}
export function importFileFromGrid(name: string, grid: string[][], lines?: number[], id = name): ImportFile {
  const headers = grid[0];
  if (!headers?.length || grid.length < 2) throw new Error(`${name}: choose a table with headers and data rows.`);
  return { id, name, headers, originalHeaders: [...headers], mapping: detectImportMapping(headers), columnMapping: detectColumnAssignments(headers), rows: grid.slice(1).map((cells, index) => {
    if (cells.length > headers.length) throw new Error(`${name}, row ${lines?.[index + 1] ?? index + 2}: more values than headers. Check quoted commas.`);
    // PH truck names are source references, not physical-truck or trip boundaries.
    // One planning group lets the capacity allocator share trucks across all stops.
    return { line: lines?.[index + 1] ?? index + 2, cells, originalCells: [...cells], group: name };
  }).filter(row => row.cells.some(value => value.trim())) };
}
/** Recognize older automatic PH grouping without changing deliberately edited groups. */
export function hasPhReferenceGroups(file: ImportFile) {
  const index = file.mapping.ph_truck_reference;
  return index >= 0 && new Set(file.rows.map(row => row.group)).size > 1
    && file.rows.every(row => row.group === (row.cells[index]?.trim() ? `${file.name} / ${row.cells[index].trim()}` : file.name));
}

/** Regroup source rows only: cells, identities and original file order stay intact. */
export function regroupImportFile(file: ImportFile, field: "file" | "ph_truck_reference" | "dispatch_number"): ImportFile {
  return { ...file, rows: file.rows.map(row => {
    const value = field === "file" ? "" : row.cells[file.mapping[field]]?.trim() ?? "";
    const trip = field === "dispatch_number" ? row.cells[file.mapping.trip_number]?.trim() ?? "" : "";
    return { ...row, group: value ? `${file.name} / ${value}${trip ? ` / Trip ${trip}` : ""}` : file.name };
  }) };
}
export async function readImportFile(file: File): Promise<ImportFile[]> {
  // Keep the existing parser/mapping rules; move CPU-heavy CSV/XLSX work off
  // the UI thread for large files. Each worker is released on success/error.
  if(file.size<256*1024||typeof Worker==="undefined")return readImportFileOnThread(file);
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL("./tripImportFile.worker.ts",import.meta.url),{type:"module"});
    worker.onmessage=(event:MessageEvent<{files?:ImportFile[];error?:string}>)=>{
      worker.terminate();
      if(event.data.error)reject(new Error(event.data.error));
      else if(event.data.files)resolve(event.data.files);
      else reject(new Error(`${file.name}: the file could not be read.`));
    };
    worker.onerror=()=>{worker.terminate();reject(new Error(`${file.name}: unable to read the file. Try again.`));};
    worker.onmessageerror=()=>{worker.terminate();reject(new Error(`${file.name}: unable to receive parsed rows. Try again.`));};
    worker.postMessage(file);
  });
}
export async function readImportFileOnThread(file: File): Promise<ImportFile[]> {
  if (/\.csv$/i.test(file.name)) {
    const lines: number[] = [];
    const grid = parseCsv(await file.text(), line => lines.push(line));
    return [importFileFromGrid(file.name, grid, lines, crypto.randomUUID())];
  }
  if (!/\.xlsx$/i.test(file.name)) throw new Error(`${file.name}: choose CSV or XLSX.`);
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const files: ImportFile[] = [];
  for (const sheet of workbook.worksheets) {
    const grid: string[][] = [], lines: number[] = [];
    sheet.eachRow({ includeEmpty: false }, row => {
      const cells = Array.from({ length: Math.max(sheet.columnCount, row.cellCount) }, (_, index) => {
        const cell = row.getCell(index + 1), value = cell.value;
        if (value instanceof Date) return value.toISOString().slice(0, 19).replace("T", " ");
        const scalar = value && typeof value === "object" && "result" in value ? value.result : value;
        if (typeof scalar === "number") {
          // A display format must not round away stored decimal precision.
          // Simple identifier zero masks can retain leading zeroes from XLSX.
          const zeroMask = /^0+$/.test(cell.numFmt ?? "") ? cell.numFmt : "";
          return zeroMask && Number.isSafeInteger(scalar) && scalar >= 0 ? String(scalar).padStart(zeroMask.length, "0") : String(scalar);
        }
        return cell.text;
      });
      if (cells.some(value => value.trim())) { grid.push(cells); lines.push(row.number); }
    });
    if (grid.length > 1) files.push(importFileFromGrid(`${file.name} / ${sheet.name}`, grid, lines, crypto.randomUUID()));
  }
  if (!files.length) throw new Error(`${file.name}: no worksheet contains data rows.`);
  return files;
}
export function importPayload(files: ImportFile[]) {
  return files.map(file => {const mappedColumns=new Set(Object.values(file.mapping));return ({ name: file.name, headers: file.headers, column_mapping: sourceAssignments(file), mapping_errors: importMappingProblems(file), rows: file.rows.map(row => ({ line: row.line, group: row.group,
    original_values: Object.fromEntries((file.originalHeaders ?? file.headers).map((header,index)=>[`${header || "Column"} [${index+1}]`,(row.originalCells??row.cells)[index]??""])),

    unmapped: Object.fromEntries(file.headers.flatMap((header, index) => !mappedColumns.has(index) && row.cells[index]?.trim() ? [[`${header || "Column"} [${index + 1}]`, row.cells[index]]] : [])),
    values: Object.fromEntries(importFields.map(([key]) => [key, file.mapping[key] < 0 ? null : row.cells[file.mapping[key]]?.trim() || null])),
  })) });});
}
