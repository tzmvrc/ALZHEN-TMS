export default function HiddenColumnsControl({ columns, onRestore, onRestoreAll }: { columns: readonly { key: string; title: string }[]; onRestore: (key: string) => void; onRestoreAll: () => void }) {
  if (!columns.length) return null;
  return <details className="relative inline-block w-fit text-xs text-slate-600">
    <summary className="cursor-pointer rounded-full border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">Hidden columns ({columns.length})</summary>
    <div className="absolute bottom-full left-0 z-[100] mb-1 max-h-64 min-w-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
      <button type="button" className="w-full rounded px-3 py-2 text-left font-semibold hover:bg-blue-50" onClick={onRestoreAll}>Restore all</button>
      {columns.map((column) => <button type="button" key={column.key} className="block w-full rounded px-3 py-2 text-left hover:bg-slate-50" onClick={() => onRestore(column.key)}>Restore {column.title}</button>)}
    </div>
  </details>;
}
