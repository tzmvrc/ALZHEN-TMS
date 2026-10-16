import { AsyncLocalStorage } from "node:async_hooks";
import { ApiError } from "../utils/api-response.js";

// Below the existing 1,000-row database batch size. A background warmup may
// return a complete snapshot or fail; it never returns silently truncated rows.
export const REPORT_PRELOAD_LIMITS = { perRelation: 500, total: 5000 } as const;
type Budget = { limits: { perRelation: number; total: number }; total: number; relations: Map<string, number> };
const context = new AsyncLocalStorage<Budget>();
export function withReportReadBudget<T>(work: () => Promise<T>, limits: { perRelation: number; total: number } = REPORT_PRELOAD_LIMITS) {
  return context.run({ limits, total: 0, relations: new Map() }, work);
}
export function reportReadPageSize(normal: number) {
  const budget = context.getStore();
  return budget ? Math.min(normal, budget.limits.perRelation + 1) : normal;
}
export function consumeReportReadRows(relation: string, count: number) {
  const budget = context.getStore();
  if (!budget) return;
  budget.total += count;
  const consumed = (budget.relations.get(relation) ?? 0) + count;
  budget.relations.set(relation, consumed);
  if (consumed > budget.limits.perRelation || budget.total > budget.limits.total) throw new ApiError("This report exceeds the background snapshot limit. Open the report and retry to load it normally.", 413, "REPORT_PRELOAD_LIMIT_EXCEEDED");
}
