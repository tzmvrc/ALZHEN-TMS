import type { OperationsTripChoice } from "./operations-trip-selection";

export function manilaDateTime(value: Date | string = new Date()): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00`;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
export function manilaDateTimeToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}:00+08:00`))) throw new Error("Enter a valid Manila Report Date.");
  if (manilaDateTime(new Date(`${value}:00+08:00`)) !== value) throw new Error("Enter a valid Manila Report Date.");
  return new Date(`${value}:00+08:00`).toISOString();
}
export function selectedTransactionValues(choice: OperationsTripChoice | null) {
  const stop = choice?.stopId ? choice.trip.stops.find((item) => item.id === choice.stopId) : null;
  return { quantity: stop?.quantity == null ? "" : String(stop.quantity), totalCbm: stop?.total_cbm == null ? "" : String(stop.total_cbm) };
}
export function optionalOffloadNumber(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  if (!/^\d+(?:\.\d+)?$/.test(value.trim()) || !Number.isFinite(number) || number < 0) throw new Error("Quantity and Total CBM must be non-negative numbers or blank.");
  return number;
}
