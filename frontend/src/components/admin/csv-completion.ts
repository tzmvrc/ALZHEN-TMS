import { cargoCapacity, cargoSignature, validateCargo, type CargoLine, type CargoPlan } from "../../services/cargo-planning";
import { allocationGroupKey } from "../../services/propose-allocation";
export { confirmedStopAddress } from "../../services/address-review";

export const completionTabs = ["details", "stops", "cargo"] as const;
export type GroupTab = typeof completionTabs[number];
export type CompletionIssue = { group: string; tab: GroupTab; message: string; section: string; stop?: string; optional?: boolean };
export type CompletionState = Record<GroupTab, { issues: CompletionIssue[]; count?: string }>;

/** Read-only UI projection of the existing detail, destination and cargo checks. */
export function csvCompletion({ group, index, detailIssues, stops, lines, plan, cargoSaved, dirty }: {
  group: string; index: number; detailIssues: string[]; stops: Array<{ key: string; verified: boolean; label: string }>;
  lines: CargoLine[]; plan: CargoPlan; cargoSaved: boolean; dirty: boolean;
}): CompletionState {
  const issue = (tab: GroupTab, message: string, section: string, stop?: string): CompletionIssue => ({ group, tab, message, section, stop });
  const details = detailIssues.map(message => issue("details", message, /warehouse/.test(message) ? `csv-group-${index}-warehouses` : /select the existing/.test(message) ? `csv-group-${index}-destination` : `csv-trip-details-${index}`));
  const locations: CompletionIssue[] = stops.filter(stop => !stop.verified).map(stop => ({ ...issue("stops", `Verify address for ${stop.label}`, `csv-group-${index}-stores`, stop.key), optional: true }));
  if (dirty) locations.unshift(issue("stops", "Apply store & product changes", `csv-group-${index}-stores`));
  const cargo: CompletionIssue[] = [];
  if (lines.length && !cargoSaved) {
    const problem = validateCargo(lines, plan.trucks, plan.placements);
    const unassigned = new Set(lines.filter(line => {
      const placements = plan.placements.filter(item => item.line_key === line.key);
      const quantity = cargoCapacity(line.quantity, placements.map(item => ({ ...item, allocated_cbm: item.quantity }))).remaining;
      const cbm = cargoCapacity(line.cbm, placements).remaining;
      const positive = (value: string) => /^\d+(?:\.\d+)?$/.test(value) && !/^0+(?:\.0+)?$/.test(value);
      return positive(quantity) || positive(cbm);
    }).map(allocationGroupKey)).size;
    const schedulePending = plan.schedule && (!plan.schedule.loading_date || !plan.schedule.estimated_delivery_date) && !plan.schedule.unreserved_confirmed;
    const message = !plan.trucks.length ? "Add at least one truck" : unassigned ? `${unassigned} DR${unassigned === 1 ? "" : "s"} unassigned` : problem || (schedulePending ? "Set trip dates or choose Plan without reserving dates" : !plan.confirmed || plan.signature !== cargoSignature(lines, plan.trucks) ? "Review and confirm the current cargo proposal" : "");
    if (message) cargo.push(issue("cargo", message, `csv-group-${index}-cargo`));
  }
  return { details: { issues: details }, stops: { issues: locations, count: String(stops.length) }, cargo: { issues: cargo, count: `${plan.trucks.length} trucks · ${new Set(lines.map(allocationGroupKey)).size} DRs` } };
}

export function tabStatus(issues: readonly CompletionIssue[], visited: boolean) {
  return !issues.length ? "complete" : visited ? "attention" : "unvisited";
}

export function blockingIssues(states: CompletionState[], before?: GroupTab): CompletionIssue[] {
  return states.flatMap(state => completionTabs.filter(tab => before === undefined || completionTabs.indexOf(tab) < completionTabs.indexOf(before)).flatMap(tab => state[tab].issues.filter(issue => !issue.optional)));
}
