import { useRef, useState } from "react";
import { IMPORT_COLUMN_DEFINITIONS } from "../../../../packages/trip-import/index.js";
import { importFields, importPayload, sourceAssignments, type ImportField, type ImportFile } from "./tripImportFiles";

type Tab = "source" | "mapped" | "columns";
const tabs: Array<{ id: Tab; label: string }> = [
  { id: "source", label: "CSV preview" },
  { id: "mapped", label: "Mapped CSV" },
  { id: "columns", label: "Column display" },
];

export default function CsvPreviewTabs({ files, disabled, onApply }: {
  files: ImportFile[];
  disabled: boolean;
  onApply: (fileId: string, assignments: Array<ImportField | null>) => void;
}) {
  const [tab, setTab] = useState<Tab>("source");
  const [fileId, setFileId] = useState("");
  const [visibleByFile, setVisibleByFile] = useState<Record<string, number[]>>({});
  const [expanded, setExpanded] = useState(false);
  const [editingField, setEditingField] = useState<ImportField | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const file = files.find(item => item.id === fileId) ?? files[0];
  if (!file) return null;
  const sourceHeaders = file.originalHeaders ?? file.headers;
  const visible = visibleByFile[file.id] ?? sourceHeaders.map((_, index) => index);
  const shown = new Set(visible);
  const sourceRows = file.rows.slice(0, 8);
  const mappedRows = importPayload([{ ...file, rows: sourceRows }])[0].rows;
  const mappedFields = importFields.filter(([field]) => {
    const index = file.mapping[field];
    return index >= 0 ? index >= sourceHeaders.length || shown.has(index) : IMPORT_COLUMN_DEFINITIONS.find(column => column.field === field)?.required;
  });
  const changeTab = (next: number) => { const index = (next + tabs.length) % tabs.length; setTab(tabs[index].id); tabRefs.current[index]?.focus(); };
  const toggleColumn = (index: number) => setVisibleByFile(current => ({ ...current, [file.id]: shown.has(index) ? visible.filter(item => item !== index) : [...visible, index] }));
  const changeMapping = (field: ImportField, sourceIndex: number) => {
    const assignments = sourceAssignments(file);
    for (let index = 0; index < assignments.length; index++) if (assignments[index] === field) assignments[index] = null;
    if (sourceIndex >= 0) assignments[sourceIndex] = field;
    onApply(file.id, assignments);
    setEditingField(null);
  };
  return <section className="csv-preview-card" aria-label="CSV preview and column display">
    <div role="tablist" aria-label="CSV preview views" className="csv-preview-tabs">
      {tabs.map((item, index) => <button key={item.id} ref={node => { tabRefs.current[index] = node; }} type="button" role="tab" id={`csv-tab-${item.id}`} aria-selected={tab === item.id} aria-controls={`csv-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={event => {
        if (event.key === "ArrowRight") { event.preventDefault(); changeTab(index + 1); }
        if (event.key === "ArrowLeft") { event.preventDefault(); changeTab(index - 1); }
        if (event.key === "Home") { event.preventDefault(); changeTab(0); }
        if (event.key === "End") { event.preventDefault(); changeTab(tabs.length - 1); }
      }}>{item.label}</button>)}
    </div>
    {files.length > 1 && <label className="csv-preview-file">File or worksheet<select value={file.id} onChange={event => { setFileId(event.target.value); setEditingField(null); }} aria-label="Preview file or worksheet">{files.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    {tab !== "columns" && <div role="tabpanel" id={`csv-panel-${tab}`} aria-labelledby={`csv-tab-${tab}`} className="csv-preview-panel">
      <div className="csv-preview-table-scroll" role="region" aria-label={tab === "source" ? "Original CSV rows" : "Mapped CSV rows"} tabIndex={0}>
        <table className="csv-preview-table"><thead><tr><th scope="col">Row</th>{tab === "source" ? visible.map(index => <th scope="col" key={index}>{sourceHeaders[index] || `Column ${index + 1}`}</th>) : mappedFields.map(([field, label]) => {
          const index = file.mapping[field];
          return <th scope="col" key={field}><div className="csv-mapped-header"><button type="button" disabled={disabled} aria-label={`Change source column for ${label}`} onClick={() => setEditingField(editingField === field ? null : field)}>{label}</button>{index >= 0 ? <small>✓ from {file.headers[index]}</small> : <small className="csv-mapping-warning">Needs mapping</small>}{editingField === field && <select autoFocus aria-label={`Source column for ${label}`} value={index >= 0 && index < sourceHeaders.length ? index : ""} disabled={disabled} onChange={event => changeMapping(field, event.target.value === "" ? -1 : Number(event.target.value))}><option value="">Not mapped</option>{sourceHeaders.map((header, sourceIndex) => <option key={sourceIndex} value={sourceIndex}>{header || `Column ${sourceIndex + 1}`}</option>)}</select>}</div></th>;
        })}</tr></thead><tbody>{sourceRows.map((row, rowIndex) => <tr key={row.line}><th scope="row">{row.line}</th>{tab === "source" ? visible.map(index => <td key={index}>{(row.originalCells ?? row.cells)[index] ?? ""}</td>) : mappedFields.map(([field]) => <td key={field}>{mappedRows[rowIndex]?.values[field] ?? ""}</td>)}</tr>)}</tbody></table>
      </div>
      <p className="csv-preview-note">Showing {sourceRows.length} of {file.rows.length} rows · {tab === "source" ? "Original headers and cell values from the file." : "What the system will import. Select a header to change its source column."}</p>
    </div>}
    {tab === "columns" && <div role="tabpanel" id="csv-panel-columns" aria-labelledby="csv-tab-columns" className="csv-columns-panel"><div className="csv-columns-heading"><p>Choose which columns appear in the preview tabs</p><div><button type="button" onClick={() => setVisibleByFile(current => ({ ...current, [file.id]: sourceHeaders.map((_, index) => index) }))}>Show all</button><span>·</span><button type="button" onClick={() => setVisibleByFile(current => ({ ...current, [file.id]: [] }))}>Hide all</button></div></div><div className="csv-columns-grid">{sourceHeaders.slice(0, expanded ? undefined : 8).map((header, index) => <button type="button" key={index} className="csv-column-toggle" aria-pressed={shown.has(index)} onClick={() => toggleColumn(index)}><span>{header || `Column ${index + 1}`}</span><span className={shown.has(index) ? "csv-pill-success" : "csv-pill-neutral"}>{shown.has(index) ? "Shown" : "Hidden"}</span></button>)}{sourceHeaders.length > 8 && <button type="button" className="csv-column-toggle csv-column-more" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Show fewer columns" : `+${sourceHeaders.length - 8} more columns`}</button>}</div></div>}
  </section>;
}
