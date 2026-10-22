import { csvFields, parseCsv, type CsvField } from "./tripCsv";
export const importFields = [
  ["sp_reference", "SP", "sp"], ["ph_truck_reference", "PH TRUCK NAME", "phTruck"],
  ["dn_reference", "DN", "dn"], ["dr_number", "DR", "dr"], ["order_item_number", "Order Item No.", "orderItem"],
  ["customer_name", "Customer Name", "customer"], ["ship_to", "Ship To", "store"],
  ["sap_so_number", "SAP SO No.", "sapSo"], ["so_number", "SO NO.", "so"],
  ["customer_po_number", "Customer PO", "customerPo"], ["internal_po_number", "PO NO.", "po"],
  ["product_category", "Product Category", "category"], ["province", "Province", "province"], ["city", "City", "city"],
  ["customer_model", "Customer Model", "product"], ["quantity", "Qty", "qty"], ["stock_quantity", "stocks", "stocks"],
  ["source_warehouse", "Warehouse", "warehouse"], ["unit_cbm", "CBM", "unitCbm"], ["cbm", "Total CBM", "cbm"],
  ["so_approval_date", "SO Approval Date", "approvalDate"], ["item_status", "Item Status", "itemStatus"],
] as const satisfies ReadonlyArray<readonly [string, string, CsvField]>;
export type ImportField = typeof importFields[number][0];
export type ImportFile = { id: string; name: string; headers: string[]; originalHeaders?: string[]; mapping: Record<ImportField, number>; rows: { line: number; cells: string[]; originalCells?: string[]; group: string }[] };
export function editImportRows(files: ImportFile[], changes: Array<{ fileId: string; line: number; field: ImportField; value: string }>): ImportFile[] {
  return files.map(file => {
    const edits = changes.filter(change => change.fileId === file.id);
    if (!edits.length) return file;
    const byRow = new Map<number, typeof edits>();
    for (const edit of edits) { const row = byRow.get(edit.line) ?? []; row.push(edit); byRow.set(edit.line, row); }
    const headers = [...file.headers], mapping = { ...file.mapping };
    for (const edit of edits) if (mapping[edit.field] < 0) { mapping[edit.field] = headers.length; headers.push(importFields.find(([field]) => field === edit.field)![1]); }
    return { ...file, originalHeaders: file.originalHeaders ?? [...file.headers], headers, mapping, rows: file.rows.map(row => {
      const rowEdits = byRow.get(row.line);
      if (!rowEdits) return row;
      const cells = [...row.cells];
      for (const edit of rowEdits) cells[mapping[edit.field]] = edit.value;
      return { ...row, originalCells: row.originalCells ?? [...row.cells], cells };
    }) };
  });
}
const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function detectImportMapping(headers: string[]) {
  return Object.fromEntries(importFields.map(([key, , field]) => [key,
    headers.findIndex(header => csvFields[field].some(alias => normalize(alias) === normalize(header))),
  ])) as Record<ImportField, number>;
}
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
  return { id, name, headers, originalHeaders: [...headers], mapping: detectImportMapping(headers), rows: grid.slice(1).map((cells, index) => {
    if (cells.length > headers.length) throw new Error(`${name}, row ${lines?.[index + 1] ?? index + 2}: more values than headers. Check quoted commas.`);
    return { line: lines?.[index + 1] ?? index + 2, cells, originalCells: [...cells], group: name };
  }).filter(row => row.cells.some(value => value.trim())) };
}
export async function readImportFile(file: File): Promise<ImportFile[]> {
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
          const places = cell.numFmt?.match(/0\.(0+)/)?.[1].length;
          return places ? scalar.toFixed(places) : String(scalar);
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
  return files.map(file => ({ name: file.name, rows: file.rows.map(row => ({ line: row.line, group: row.group,
    original_values: Object.fromEntries((file.originalHeaders ?? file.headers).map((header,index)=>[`${header || "Column"} [${index+1}]`,(row.originalCells??row.cells)[index]??""])),

    unmapped: Object.fromEntries(file.headers.flatMap((header, index) => !Object.values(file.mapping).includes(index) && row.cells[index]?.trim() ? [[header || `Column ${index + 1}`, row.cells[index]]] : [])),
    values: Object.fromEntries(importFields.map(([key]) => [key, file.mapping[key] < 0 ? null : row.cells[file.mapping[key]]?.trim() || null])),
  })) }));
}
