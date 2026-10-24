import { useRef } from "react";

export type StoreStatus = "ready" | "location" | "attention";
export type StoreNavigationItem = {
  id: string; title: string; customer?: string; city?: string; province?: string;
  products: number; qty: number; cbm: number; status: StoreStatus;
  searchText: string; members: string[];
};
export type ProductViewState = { search: string; page: number; size: number; expanded: Record<string, boolean>; top: number; left: number };
export type StoreWorkspaceMemory = {
  selected: string; members: string[]; search: string; attention: boolean;
  rail: number; details: Record<string, number>; products: Record<string, ProductViewState>;
};
/** UI memory belongs to the open flow, never to a global cache or saved business draft. */
export const createStoreWorkspaceMemory = (): StoreWorkspaceMemory => ({ selected: "", members: [], search: "", attention: false, rail: 0, details: {}, products: {} });
export function useStoreWorkspaceMemory() {
  return useRef<StoreWorkspaceMemory>(createStoreWorkspaceMemory()).current;
}
export const storeStatusLabels: Record<StoreStatus, string> = { ready: "Ready", location: "Needs location", attention: "Needs attention" };
const decimalText = (value: string | null | undefined) => (value ?? "").trim().replaceAll(",", "");
export const navigationNumber = (value: string | null | undefined) => Number.isFinite(Number(decimalText(value))) ? Number(decimalText(value)) : 0;
export const formatStoreNumber = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 4 });
export function invalidProduct(values: Record<string, string | null>) {
  return !values.customer_model?.trim() || ["quantity", "cbm"].some(field => !/^\d+(?:\.\d+)?$/.test(decimalText(values[field])) || !Number.isFinite(Number(decimalText(values[field])))) || navigationNumber(values.quantity) <= 0;
}
export function productView(memory: StoreWorkspaceMemory, id: string): ProductViewState {
  return memory.products[id] ?? (memory.products[id] = { search: "", page: 0, size: 50, expanded: {}, top: 0, left: 0 });
}

/** Imperative, per-dialog UI memory boundary; never part of trip or import data. */
export function updateWorkspace(memory: StoreWorkspaceMemory, patch: Partial<StoreWorkspaceMemory>) { Object.assign(memory, patch); }
export function updateProductView(view: ProductViewState, patch: Partial<ProductViewState>) { Object.assign(view, patch); }
export function carryProductView(memory: StoreWorkspaceMemory, from: string, to: string) { if (memory.products[from]) memory.products[to] = memory.products[from]; }
export function toggleProductView(view: ProductViewState, key: string) { view.expanded[key] = !view.expanded[key]; }
