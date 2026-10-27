import { Check } from "lucide-react";
import type { ReactNode } from "react";

export type CsvCheckItem = { label: string; done: boolean; detail?: string };

export default function CsvSidePanel({ title, items = [], note, children }: { title: string; items?: CsvCheckItem[]; note?: string; children?: ReactNode }) {
  return <aside className="csv-side-panel" aria-label={title}><h3>{title}</h3><div className="csv-checklist">{items.map((item, index) => <div key={`${item.label}-${index}`} className="csv-check-item"><span aria-hidden="true" className={item.done ? "csv-check-icon is-done" : "csv-check-icon"}>{item.done && <Check size={14} strokeWidth={3} />}</span><span>{item.label}{item.detail && <small>{item.detail}</small>}</span></div>)}</div>{note && <p className="csv-side-note">{note}</p>}{children}</aside>;
}
