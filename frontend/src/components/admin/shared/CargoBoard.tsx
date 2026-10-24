import type { DragEventHandler, ReactNode } from "react";
export type CargoBoardColumn = { id: string; domId?: string; title: string; count: number; drCount: number; description?: string; actions?: ReactNode; children: ReactNode; summary?: ReactNode; onDragOver?: DragEventHandler<HTMLElement>; onDrop?: DragEventHandler<HTMLElement> };
/** Presentational board: assignments and validation remain owned by the flow. */
export default function CargoBoard({ columns, selectedId, onSelect, label = "Cargo assignment board" }: { columns: readonly CargoBoardColumn[]; selectedId: string; onSelect: (id: string) => void; label?: string }) {
  const selected = columns.find(column => column.id === selectedId) ?? columns[0];
  return <div aria-label={label} className="trip-cargo-board">
    <nav className="cargo-truck-list" aria-label="Truck cargo summaries">{columns.map(column => <div key={column.id} className="cargo-truck-summary" data-selected={column.id === selected.id} onDragOver={column.onDragOver} onDrop={column.onDrop}>
      <button type="button" className="cargo-truck-select" aria-pressed={column.id === selected.id} aria-controls={selected.domId} onClick={() => onSelect(column.id)}><span className="cargo-truck-heading"><strong>{column.title}</strong><span>{column.drCount} DRs</span></span>{column.description && <small>{column.description}</small>}<span className="cargo-truck-usage">{column.summary}</span></button>{column.actions && <div className="cargo-truck-actions">{column.actions}</div>}
    </div>)}</nav>
    {selected && <section id={selected.domId} tabIndex={-1} aria-label={`${selected.title} cargo`} onDragOver={selected.onDragOver} onDrop={selected.onDrop} className="trip-cargo-column"><header><h4>{selected.title === "Unassigned" ? "Unassigned cargo" : `${selected.title} · Delivery receipts`}</h4><span>{selected.drCount} DRs · {selected.count} lines</span></header><div className="cargo-dr-list">{selected.children}</div></section>}
  </div>;
}
