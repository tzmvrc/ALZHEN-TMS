export const TRIP_STATUSES = ["PLANNED", "LOADING", "IN_TRANSIT", "DELIVERED", "CANCELLED"];
export const emptyTripDetails = () => ({ trip_type_id: null, trip_type_name: null, status: "PLANNED", loading_date: null, estimated_delivery_date: null, remarks: null, origin_warehouse_id: null });
