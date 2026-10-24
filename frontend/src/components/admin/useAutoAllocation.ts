import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cargoSignature, validateCargo, type CargoLine, type CargoPlan, type CargoTruck } from "../../services/cargo-planning";
import { allocationGroupKey, proposeAllocation, type AllocationLocks, type AllocationProposal } from "../../services/propose-allocation";

type SessionState = { locks: AllocationLocks; last: string; undo?: { placements: CargoPlan["placements"]; locks: AllocationLocks }; notice?: string; dismissed?: boolean };
export type AllocationSession = { getSnapshot: () => SessionState; subscribe: (listener: () => void) => () => void; update: (patch: Partial<SessionState>) => void };
/** Ephemeral UI store: never included in CargoPlan or the recovery/save payload. */
export function createAllocationSession(): AllocationSession {
  let snapshot: SessionState = { locks: {}, last: "" };
  const listeners = new Set<() => void>();
  return { getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, update: patch => { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()); } };
}
export function useAutoAllocation({ lines, trucks, plan, onChange, excluded, ready, disabled, session: provided, canConfirm = true }: {
  lines: CargoLine[]; trucks: CargoTruck[]; plan: CargoPlan; onChange: (plan: CargoPlan) => void; excluded: string[]; ready: boolean; disabled: boolean; session?: AllocationSession; canConfirm?: boolean;
}) {
  const [local] = useState(createAllocationSession), session = provided ?? local;
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const latest = useRef({ lines, trucks, plan, onChange, excluded, canConfirm });
  useEffect(() => { latest.current = { lines, trucks, plan, onChange, excluded, canConfirm }; });
  const fingerprint = cargoSignature(lines, trucks) + JSON.stringify([...excluded].sort()) + canConfirm;
  const publish = (placements: CargoPlan["placements"]) => {
    const value = latest.current;
    value.onChange({ ...value.plan, trucks: value.trucks, placements, signature: cargoSignature(value.lines, value.trucks), confirmed: value.canConfirm && !value.excluded.some(id => placements.some(item => item.truck_id === id)) && !validateCargo(value.lines, value.trucks, placements) });
  };
  const run = () => {
    const value = latest.current, current = session.getSnapshot();
    const proposal = proposeAllocation({ lines: value.lines, trucks: value.trucks, locked: current.locks, excludedTruckIds: value.excluded });
    const automatic = proposal.assignments.filter(item => { const line = value.lines.find(line => line.key === item.line_key); return line && !Object.hasOwn(current.locks, allocationGroupKey(line)); });
    const assignedGroups = new Set(automatic.flatMap(item => { const line = value.lines.find(line => line.key === item.line_key); return line ? [allocationGroupKey(line)] : []; }));
    const kept = new Set(value.lines.map(allocationGroupKey).filter(key => Object.hasOwn(current.locks, key))).size;
    session.update({ undo: { placements: value.plan.placements.map(item => ({ ...item })), locks: current.locks }, last: cargoSignature(value.lines, value.trucks) + JSON.stringify([...value.excluded].sort()) + value.canConfirm, notice: `Auto-assigned ${assignedGroups.size} DRs to ${new Set(automatic.map(item => item.truck_id)).size} trucks${kept ? ` · ${kept} locked DR${kept === 1 ? "" : "s"} kept` : ""}`, dismissed: false });
    publish(proposal.assignments);
  };
  useEffect(() => {
    if (disabled || !ready || session.getSnapshot().last === fingerprint) return;
    const timer = setTimeout(() => {
      const current = session.getSnapshot();
      if (!current.last && plan.placements.length && !Object.keys(current.locks).length) {
        session.update({ locks: Object.fromEntries([...new Set(lines.map(allocationGroupKey))].map(key => [key, plan.placements.filter(item => lines.some(line => allocationGroupKey(line) === key && line.key === item.line_key))])) });
      }
      run();
    }, 0);
    return () => clearTimeout(timer);
    // Placements change through manual edits; only source/truck/conflict changes trigger auto-allocation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, ready, disabled, session]);
  const manual = (patch: Partial<CargoPlan>) => {
    const value = latest.current, next = patch.placements ?? value.plan.placements, locks = { ...session.getSnapshot().locks };
    for (const key of new Set(value.lines.map(allocationGroupKey))) {
      const belongs = (item: CargoPlan["placements"][number]) => value.lines.some(line => line.key === item.line_key && allocationGroupKey(line) === key);
      if (JSON.stringify(value.plan.placements.filter(belongs)) !== JSON.stringify(next.filter(belongs))) locks[key] = next.filter(belongs).map(item => ({ ...item }));
    }
    session.update({ locks, undo: undefined, notice: "Manual placement kept. Locked DRs stay where you put them.", dismissed: false }); publish(next);
  };
  const unlock = (key: string) => { const locks = { ...session.getSnapshot().locks }; delete locks[key]; session.update({ locks }); run(); };
  const undo = () => {
    const prior = session.getSnapshot().undo; if (!prior) return;
    session.update({ undo: undefined, locks: prior.locks, notice: "Automatic allocation undone. Re-run when you are ready.", dismissed: false });
    publish(prior.placements.filter(item => latest.current.trucks.some(truck => truck.id === item.truck_id)));
  };
  let proposal: AllocationProposal;
  try { proposal = proposeAllocation({ lines, trucks, locked: state.locks, excludedTruckIds: excluded }); }
  catch { proposal = { assignments: [], unassigned: lines, warnings: [{ code: "invalid", message: "Complete cargo quantities before automatic allocation." }], assignedCbm: "0", capacityCbm: "0", overflowCbm: "0" }; }
  return { proposal, locks: state.locks, notice: state.dismissed ? "" : state.notice, canUndo: Boolean(state.undo), run, manual, unlock, undo, dismiss: () => session.update({ dismissed: true }) };
}
