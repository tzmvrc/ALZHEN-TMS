import type { ReactNode } from "react";
import "./TripTableLoading.css";

/** Compact loading feedback shared by the Trips tables. */
export function TripTableLoading({ label = "Loading rows…", className = "" }: { label?: string; className?: string }) {
  return <div className={`trip-table-loading ${className}`} role="status" aria-live="polite">
    <span className="trip-table-loading-indicator" aria-hidden="true" />
    <span>{label}</span>
  </div>;
}

export function TripTableLoadingRow({ columns, label }: { columns: number; label?: string }): ReactNode {
  return <tr className="trip-table-loading-row"><td colSpan={columns}><TripTableLoading label={label} /></td></tr>;
}
