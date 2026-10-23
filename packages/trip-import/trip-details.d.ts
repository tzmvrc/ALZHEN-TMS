export type TripDetails = { trip_type_id: string | null; trip_type_name: string | null; status: string; loading_date: string | null; estimated_delivery_date: string | null; remarks: string | null; origin_warehouse_id: string | null };
export const TRIP_STATUSES: readonly string[];
export function emptyTripDetails(): TripDetails;
