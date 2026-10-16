import { apiGet, type ApiResponse } from "./api.service";
import type { OperationsTripChoice } from "./operations-trip-selection";
export type OffloadTransaction = { id: string; trip_id: string; trip_stop_id: string; dr_number: string; dispatch_number: string | null; warehouse: string | null; destination: string | null; driver_name: string | null; plate_number: string | null; route: string; quantity: number | null; total_cbm: number | null };
export type OffloadTransactionPage = { rows: OffloadTransaction[]; page: number; hasMore: boolean };
export async function searchOffloadTransactions(token: string, search: string, page = 1) {
  const response = await apiGet<ApiResponse<OffloadTransactionPage>>(`/reports/operations/offload-transactions?search=${encodeURIComponent(search)}&page=${page}`, token);
  if (!response.success || !response.data) throw new Error("Unable to load DR transactions.");
  return response.data;
}
export function offloadTransactionChoices(rows: readonly OffloadTransaction[]) {
  const unique = [...new Map(rows.filter((row) => row.dr_number.trim()).map((row) => [row.id, row])).values()];
  const label = (row: OffloadTransaction) => `${row.dr_number} — ${row.warehouse || "Warehouse not recorded"} — ${row.destination || "Destination not recorded"}`;
  const counts = new Map<string, number>();
  for (const row of unique) counts.set(label(row), (counts.get(label(row)) ?? 0) + 1);
  return unique.map((row) => ({ value: row.id, label: `${label(row)}${counts.get(label(row))! > 1 ? ` (${row.id})` : ""}` }));
}
export function offloadTransactionChoice(row: OffloadTransaction): OperationsTripChoice {
  return { id: row.id, stopId: row.trip_stop_id, dispatchNumber: row.dispatch_number ?? "", label: offloadTransactionChoices([row])[0]?.label ?? "", selectable: Boolean(row.dr_number.trim() && row.trip_stop_id), trip: {
    id: row.trip_id, trip_number: null, dispatch_number: row.dispatch_number, status: null,
    driver_name: row.driver_name, plate_number: row.plate_number, route: row.route,
    stops: [{ id: row.trip_stop_id, stop_sequence: null, dispatch_number: row.dispatch_number, quantity: row.quantity, total_cbm: row.total_cbm }],
  } };
}
