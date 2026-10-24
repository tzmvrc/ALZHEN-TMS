import { useEffect, useId, type ReactNode } from "react";
import { AlertCircle, Check, Circle } from "lucide-react";
import { completionTabs, tabStatus, type CompletionState, type GroupTab } from "./csv-completion";

export type { GroupTab } from "./csv-completion";
export type GroupRailItem = { key: string; lines: number; stores: number; cbm: string; issues: number; ready: boolean };
export default function GroupRail({ items, current, tab, onSelect, onTab, children, completion, visited = [] }: {
  items: GroupRailItem[]; current: string; tab: GroupTab; onSelect: (key: string) => void; onTab: (tab: GroupTab) => void;
  children: ReactNode; completion: CompletionState; visited?: GroupTab[];
}) {
  const owner = useId();
  const index = Math.max(0, items.findIndex(item => item.key === current));
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented || !["ArrowUp", "ArrowDown"].includes(event.key) || document.querySelector('dialog[open]')) return;
      const item = items[index + (event.key === "ArrowDown" ? 1 : -1)];
      if (item) { event.preventDefault(); onSelect(item.key); }
    };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [index, items, onSelect]);
  const status = (item: GroupRailItem) => item.ready ? "Ready" : "Needs review";
  const active = items[index];
  return <div className="group-master-detail" data-active-tab={tab} data-single-group={items.length === 1}>
    <main className="group-detail" data-trip-group={current}>
      <header>
        <div className="group-identity">{items.length > 1 ? <label>Trip group<select aria-label="Current trip group" value={current} onChange={event => onSelect(event.target.value)}>{items.map(item => <option key={item.key} value={item.key}>{item.key} · {status(item)}</option>)}</select></label> : <h3 title={current}>{current}</h3>}<span className={`group-ready-badge ${active?.ready ? "is-ready" : ""}`}>{active?.ready ? <Check size={12} aria-hidden="true" /> : <Circle size={10} aria-hidden="true" />}{active ? status(active) : "Draft"}</span>{items.length > 1 && <small>{index + 1} / {items.length}</small>}</div>
        <nav role="tablist" aria-label="Trip group sections" className="csv-completion-tabs">{completionTabs.map((key, index) => {
          const label = key === "details" ? "Details" : key === "stops" ? "Stops" : "Trucks & cargo";
          const state = tabStatus(completion[key].issues, visited.includes(key) || tab === key);
          const optional = completion[key].issues.length > 0 && completion[key].issues.every(issue => issue.optional);
          const text = state === "complete" ? "Complete" : state === "attention" ? optional ? "Address optional" : "Needs attention" : "Not visited";
          return <button key={key} type="button" role="tab" aria-label={label} aria-describedby={`${owner}-count-${key} ${owner}-status-${key}`} tabIndex={tab === key ? 0 : -1} aria-selected={tab === key} aria-controls={`${owner}-panel-${key}`} id={`${owner}-tab-${key}`} data-status={state} onClick={() => onTab(key)} onKeyDown={event => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
            // Manual activation keeps keyboard exploration independent of validation.
            document.getElementById(`${owner}-tab-${completionTabs[next]}`)?.focus();
          }}><span className="csv-substep-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span><span className="csv-substep-label">{label}<small id={`${owner}-count-${key}`}>{completion[key].count || "Trip information"}</small></span><span className="csv-substep-status">{state === "complete" ? <Check size={16} aria-hidden="true" /> : state === "attention" ? <AlertCircle size={16} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}<span id={`${owner}-status-${key}`}>{text}</span></span></button>;
        })}</nav>
      </header>
      {completionTabs.map(key => <div key={key} role="tabpanel" hidden={tab !== key} tabIndex={-1} id={`${owner}-panel-${key}`} aria-labelledby={`${owner}-tab-${key}`} className="group-tab-content">{tab === key ? children : null}</div>)}
    </main>
  </div>;
}
