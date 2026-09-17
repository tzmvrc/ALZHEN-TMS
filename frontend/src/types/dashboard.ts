// src/types/dashboard.ts
import type { ReactNode } from "react";

export type Trend = "up" | "down";
export type Tone = "blue" | "emerald" | "amber" | "violet" | "rose";
export type TaskStatus = "Received" | "Shipping" | "Cancelled" | "Pending";

export interface KpiItem {
  id: string;
  label: string;
  value: string;
  change: string;
  trend: Trend;
  tone: Tone;
  /** Optional — if omitted, a derived sparkline is used */
  sparkline?: number[];
  icon?: ReactNode;
}

export interface TaskRow {
  id: string;
  name: string;
  sublabel?: string;
  avatarUrl?: string;
  owner: string;
  date: string;
  status: TaskStatus;
  price?: string;
}

export interface SalesPoint {
  label: string;
  primary: number;
  secondary: number;
  /** Optional bar height 0–100 for the vertical column behind the line */
  bar?: number;
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export interface WeeklyBar {
  label: string;
  total: number;
  paid: number;
}

export interface NavItem {
  id: string;
  label: string;
  icon?: ReactNode;
  href?: string;
}

export type DispatchStatus = "Completed" | "In Progress" | "Delayed";
export type IncidentSeverity = "High" | "Medium" | "Low";

export interface DispatchRecord {
  id: string;
  route: string;
  tripType: "Regular" | "Stock Transfer";
  status: DispatchStatus;
  eta: string;
  hub: string;
  driver: string;
  amount: string;
}

export interface IncidentRecord {
  id: string;
  title: string;
  location: string;
  issue: string;
  severity: IncidentSeverity;
  age: string;
}

export interface RegionalSummary {
  region: "Luzon" | "Visayas" | "Mindanao";
  value: string;
  share: number;
}

export interface SnapshotRecord {
  label: string;
  value: string;
  change: string;
}

export interface OperationsData {
  dispatches: DispatchRecord[];
  incidents: IncidentRecord[];
  regionalSummary: RegionalSummary[];
  snapshots: SnapshotRecord[];
  issueClusters: { label: string; value: string }[];
}

export interface DashboardData {
  user: { name: string; avatarUrl?: string };
  nav: { general: NavItem[]; support: NavItem[]; activeId: string };
  kpis: KpiItem[];
  salesChart: { total: string; change: string; points: SalesPoint[] };
  donut: { title: string; slices: DonutSlice[]; centerLabel: string };
  tasks: TaskRow[];
  weekly: { title: string; bars: WeeklyBar[] };
  operations: OperationsData;
}