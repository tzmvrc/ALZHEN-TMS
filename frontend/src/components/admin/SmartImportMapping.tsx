import { useState } from "react";
import { IMPORT_COLUMN_DEFINITIONS, mappingConflicts, normalizeColumnName } from "../../../../packages/trip-import/index.js";
import { importColumnReport, importFormatKey, importMappingProblems, sourceAssignments, type ImportField, type ImportFile } from "./tripImportFiles";

type Props = {
  file: ImportFile; owner?: string; disabled: boolean;
  onMap: (index: number, field: ImportField|null) => void;
  onApply: (assignments: Array<ImportField|null>) => void;
  onGroup: (field: "file" | "ph_truck_reference" | "dispatch_number") => void;
};
const fieldLabels = new Map(IMPORT_COLUMN_DEFINITIONS.map(column => [column.field, column.label]));

/** Templates contain only approved destinations, never source row/sample data.
 * Reuse is explicit and restricted to this account and the exact header format.
 */
export default function SmartImportMapping({ file, owner, disabled, onMap, onApply, onGroup }: Props) {
  const [notice, setNotice] = useState("");
  const [showMatched, setShowMatched] = useState(false);
  const report = importColumnReport(file), problems = importMappingProblems(file);
  const missing = IMPORT_COLUMN_DEFINITIONS.filter(column => file.mapping[column.field] < 0);
  const templateKey = `alzhen:trip-import-mapping:v1:${owner ?? ""}:${importFormatKey(file)}`;
  const save = () => {
    try {
      localStorage.setItem(templateKey, JSON.stringify({ version: 1, headers: file.headers.map(normalizeColumnName), assignments: sourceAssignments(file) }));
      setNotice("Mapping saved for this account and header format. Reuse it with Apply saved mapping.");
    } catch { setNotice("This browser could not save the mapping. Your current mapping is unchanged."); }
  };
  const reuse = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(templateKey) ?? "null");
      if (saved?.version !== 1 || JSON.stringify(saved.headers) !== importFormatKey(file) || mappingConflicts(file.headers, saved.assignments).length) {
        setNotice("No approved mapping exists for this exact header format."); return;
      }
      onApply(saved.assignments);
      setNotice("Saved mapping applied to this file. Review it before checking the CSV.");
    } catch { setNotice("No usable saved mapping exists for this header format."); }
  };
  const matched = report.filter(row => row.status === "Automatically Matched" || row.status === "Manually Matched");
  const attention = report.filter(row => !matched.includes(row));
  const visible = showMatched ? [...attention, ...matched] : attention;
  return <details className="border-b border-slate-200 py-4" open>
    <summary className="cursor-pointer text-sm font-semibold text-[#0b2341]">{file.name} · {file.rows.length} source rows · {file.headers.length} columns</summary>
    <p className="mt-2 text-xs text-slate-500">Match each original column to one destination. Identifiers, unit CBM, total CBM, and physical plates stay separate. Unmapped cells remain in provenance and require review before saving.</p>
    <p className="mt-2 text-xs text-slate-500">SO Approval Date accepts year-first dates or month/day/year dates, with optional time. Review day-first source dates in Mapped fields before importing.</p>
    {problems.length > 0 && <p role="alert" className="mt-3 text-xs text-rose-700">{problems.join(" ")}</p>}
    <button type="button" aria-expanded={showMatched} onClick={() => setShowMatched(value => !value)} className="mt-3 text-xs font-medium text-[#2678b9]">{showMatched ? "Hide matched" : "Show all matched"} ({matched.length})</button>
    {!attention.length && !showMatched && <p className="mt-2 text-xs text-emerald-700">All source columns are matched.</p>}
    <div className="trip-horizontal-table mt-3"><table className="trip-mapping-table w-full text-left text-xs"><colgroup><col style={{ width: "22%" }} /><col style={{ width: "34%" }} /><col style={{ width: "24%" }} /><col style={{ width: "20%" }} /></colgroup>
      <thead className="bg-slate-50 text-slate-600"><tr>{["Original column", "Destination", "Sample", "Status"].map(title => <th key={title} className="p-2 font-medium">{title}</th>)}</tr></thead>
      <tbody>{visible.map(row => <tr key={row.index} className="border-t border-slate-100">
        <td className="p-2 whitespace-pre-wrap">{row.header || `Column ${row.index + 1}`}</td>
        <td className="p-2"><select aria-label={`${file.name}: map ${row.header || `Column ${row.index + 1}`} (${row.index + 1})`} disabled={disabled} value={row.field ?? ""} onChange={event => onMap(row.index, event.target.value ? event.target.value as ImportField : null)} className="w-full rounded border border-slate-200 bg-white p-2">
          <option value="">Keep as unmapped source data</option>
          {IMPORT_COLUMN_DEFINITIONS.map(column => <option key={column.field} value={column.field}>{column.label}</option>)}
        </select></td>
        <td className="max-w-72 break-words p-2 font-mono">{row.sample || "—"}</td>
        <td className={`p-2 ${row.status === "Conflicting Mapping" ? "text-rose-700" : row.status === "Needs Manual Mapping" ? "text-amber-700" : "text-emerald-700"}`}>{row.status}</td>
      </tr>)}</tbody>
    </table></div>
    {missing.length > 0 && <details className="mt-3 rounded bg-slate-50 p-3 text-xs text-slate-500"><summary className="cursor-pointer">Missing fields ({missing.length})</summary><ul className="mt-2 space-y-1">{missing.map(column => <li key={column.field}>{fieldLabels.get(column.field)} — {column.required ? "Needs Manual Mapping (required)" : "Missing Optional Field"}</li>)}</ul><p className="mt-2">Missing optional fields stay empty. You can fill them in Mapped fields without renaming the CSV.</p></details>}
    <div className="mt-3 flex flex-wrap gap-2 text-xs">
      <button type="button" disabled={disabled || !owner || problems.length > 0} onClick={save} className="rounded border border-slate-200 px-3 py-2 disabled:opacity-40">Save approved mapping for this format</button>
      <button type="button" disabled={disabled || !owner} onClick={reuse} className="rounded border border-slate-200 px-3 py-2 disabled:opacity-40">Apply saved mapping</button>
      <button type="button" disabled={disabled || file.mapping.ph_truck_reference < 0} onClick={() => onGroup("ph_truck_reference")} className="rounded border border-slate-200 px-3 py-2 disabled:opacity-40">Separate groups by PH reference (optional)</button>
      <button type="button" disabled={disabled || file.mapping.dispatch_number < 0} onClick={() => onGroup("dispatch_number")} className="rounded border border-slate-200 px-3 py-2 disabled:opacity-40">Suggest groups by dispatch / trip</button>
      <button type="button" disabled={disabled} onClick={() => onGroup("file")} className="rounded border border-slate-200 px-3 py-2 disabled:opacity-40">Plan this file together</button>
    </div>
    <p className="mt-2 text-xs text-slate-500">Each file starts as one shared trip plan. PH references stay on the source products; they do not require separate physical trucks. Separate groups only when you intend separate trips. Changing grouping resets group-specific truck plans and trip settings.</p>
    {notice && <p role="status" className="mt-2 text-xs text-slate-600">{notice}</p>}
  </details>;
}
