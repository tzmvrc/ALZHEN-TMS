import type { ComponentType } from "react";
import type { RegionTrip } from "./RegionComparison";

export type MovementPoint = { label: string; distanceKm: number };
export type FlowRow = {
  warehouse: string;
  store: string;
  status: "Completed" | "Delayed" | "In Progress" | "Other";
};
export type StatusSlice = { label: string; value: number; color: string };

type FleetAnalyticsProps = {
  movement: MovementPoint[];
  dailyCounts: { date: string; count: number }[];
  flows: FlowRow[];
  regionTrips: RegionTrip[];
  unlocatedTrips: number;
  isLoading: boolean;
};

/**
 * Fleet analytics are currently disabled in the Overview layout. Keep the
 * component contract and exported chart data types so callers remain stable.
 */
const FleetAnalytics: ComponentType<FleetAnalyticsProps> = () => (
  <section className="space-y-3" />
);

export default FleetAnalytics;
