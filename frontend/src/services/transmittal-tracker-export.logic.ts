type ReconciledTrackerRow = {
  cells?: Record<string, { value: unknown; version: number } | undefined>;
};

const editableCellKeys: Record<string, string> = {
  warehouse_code: "warehouse_code_override",
  delivered_to: "delivered_to_override",
  plate_number: "plate_number_override",
  delivery_receipt_no: "delivery_receipt_no_override",
  sales_order_no: "sales_order_no_override",
  transmittal_ref: "transmittal_ref",
  date_created: "date_created_override",
  status: "tracker_status",
  lbc_waybill_no: "lbc_waybill_no",
  shipping_date_via_lbc: "lbc_shipping_date",
  remarks: "tracker_remarks",
  loading_date: "loading_date_override",
  date_delivered: "delivery_date_override",
};
const projectedFieldsByCell: Record<string, string> = Object.fromEntries(
  Object.entries(editableCellKeys).map(([field, cellKey]) => [cellKey, field]),
);

/** Preserve newer local cell versions when a refresh races with a save, and
 * keep the projected property used by search and non-editor consumers aligned. */
export function reconcileTrackerRows<T extends object>(incomingRows: T[], currentRows: T[]): T[] {
  const currentByStop = new Map(currentRows.map((row) => {
    const values = row as unknown as Record<string, unknown>;
    return [values.trip_stop_id, values] as const;
  }));
  return incomingRows.map((incoming) => {
    const next = { ...(incoming as unknown as Record<string, unknown>) };
    const existing = currentByStop.get(next.trip_stop_id) as (Record<string, unknown> & ReconciledTrackerRow) | undefined;
    if (!existing) return incoming;
    const nextCells = { ...((next.cells as ReconciledTrackerRow["cells"]) ?? {}) };
    for (const [cellKey, cell] of Object.entries(existing.cells ?? {})) {
      if (!cell) continue;
      if ((nextCells[cellKey]?.version ?? -1) > cell.version) continue;
      nextCells[cellKey] = cell;
      const projectedField = projectedFieldsByCell[cellKey];
      if (projectedField && cell.value !== null && cell.value !== undefined) {
        next[projectedField] = cell.value;
      }
    }
    next["cells"] = nextCells;
    return next as T;
  });
}

/** Prefer the version-reconciled flex-cell value over the report projection. */
export function effectiveTrackerExportValue(
  row: ReconciledTrackerRow,
  projectedValue: unknown,
  projectedField: string,
): unknown {
  const cellKey = editableCellKeys[projectedField];
  const cellValue = cellKey ? row.cells?.[cellKey]?.value : undefined;
  return cellValue === null || cellValue === undefined ? projectedValue : cellValue;
}

export function projectTrackerExportRows<T extends object>(
  rows: T[],
  columns: ReadonlyArray<readonly [string, string]>,
): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const values = row as T & Record<string, unknown> & ReconciledTrackerRow;
    return Object.fromEntries(columns.map(([, key]) => [
      key,
      effectiveTrackerExportValue(values, values[key], key),
    ]));
  });
}

/** Keep the client sheet scoped to one exact reference and use reconciled date overrides. */
export function projectTransmittalSheetRows<T extends object>(rows: T[], reference: string) {
  return rows.flatMap((row) => {
    const values = row as T & Record<string, unknown> & ReconciledTrackerRow;
    if (values.transmittal_ref !== reference) return [];
    return [{
      ...values,
      loading_date: effectiveTrackerExportValue(values, values.loading_date, "loading_date"),
      date_delivered: effectiveTrackerExportValue(values, values.date_delivered, "date_delivered"),
    }];
  });
}
