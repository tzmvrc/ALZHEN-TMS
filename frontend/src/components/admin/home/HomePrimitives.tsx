import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { animate, motion } from "motion/react";
import { ArrowUpRight, Inbox, Truck, type LucideIcon } from "lucide-react";
import { STATUS_COLORS, type HomeStatus } from "./home-dashboard-data";

export function AnimatedCount({ value, enabled }: { value: number; enabled: boolean }) {
  const previous = useRef(0);
  const [display, setDisplay] = useState(enabled ? 0 : value);
  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (!enabled || from === value) { setDisplay(value); return; }
    const controls = animate(from, value, { duration: 0.55, ease: "easeOut", onUpdate: next => setDisplay(Math.round(next)) });
    return () => controls.stop();
  }, [value, enabled]);
  return <span className="home-number" aria-label={value.toLocaleString("en-PH")}><span aria-hidden="true">{display.toLocaleString("en-PH")}</span></span>;
}
export function SectionHeading({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: string; children?: ReactNode }) {
  return <header className="home-section-heading"><div>{eyebrow && <p className="home-eyebrow">{eyebrow}</p>}<h2>{title}</h2>{description && <p className="home-description">{description}</p>}</div>{children}</header>;
}
export function EmptyState({ title, children, icon: Icon = Inbox }: { title: string; children?: ReactNode; icon?: LucideIcon }) {
  return <div className="home-empty"><Icon aria-hidden="true" size={25}/><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}
export function StatusPill({ status, label }: { status: HomeStatus; label?: string }) {
  return <span className="home-status" style={{ color: STATUS_COLORS[status] }}><i aria-hidden="true" style={{ background: STATUS_COLORS[status] }}/>{label ?? status}</span>;
}
export type HomeMetric = { label: string; value: number | null; note: string; icon: LucideIcon; tone: string; onClick: () => void };
export function MetricsStrip({ metrics, animate: enabled }: { metrics: HomeMetric[]; animate: boolean }) {
  return <section className="home-metrics" aria-label="Critical operational overview">{metrics.map(({ label, value, note, icon: Icon, tone, onClick }, index) =>
    <motion.button initial={enabled ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: enabled ? index * 0.045 : 0 }} key={label} type="button" className={`home-metric home-metric-${tone}`} onClick={onClick}>
      <span className="home-metric-label"><Icon size={16} aria-hidden="true"/>{label}<ArrowUpRight size={14} className="home-metric-arrow" aria-hidden="true"/></span>
      <strong>{value === null ? <span className="home-unavailable">—</span> : <AnimatedCount value={value} enabled={enabled}/>}</strong>
      <span className="home-metric-note">{note}</span>
    </motion.button>)}</section>;
}
/** Decorative road graphic. It never represents a real location or GPS reading. */
export function TruckJourneyIllustration({loop=false}:{loop?:boolean}) {
  const truckId=useId();
  return <svg className="home-truck-art" viewBox="0 0 360 118" fill="none" aria-hidden="true" focusable="false">
    <path d="M-20 92H390" stroke="white" strokeOpacity=".1" strokeWidth="25"/>
    <path d="M-20 92H390" stroke="#FFD43B" strokeOpacity=".7" strokeWidth="1.5" strokeDasharray="10 12"/>
    <path d="M20 73V45H70V73M29 45V35H62V45M35 55H56M35 62H56" stroke="white" strokeOpacity=".23" strokeWidth="2"/>
    <path d="M270 72V26L302 12L334 26V72M280 72V39H324V72M280 47H324M280 56H324" stroke="white" strokeOpacity=".23" strokeWidth="2"/>
    <path d="M60 21C95 2 138 6 158 25C181 48 216 34 251 24" stroke="white" strokeOpacity=".22" strokeDasharray="3 5"/>
    <circle cx="251" cy="24" r="4" fill="#FFD43B"/><circle cx="60" cy="21" r="4" fill="#5BB5DC"/>
    <g className={`home-moving-truck ${loop?"home-loop-truck":""}`}><g id={truckId}>
      <ellipse cx="166" cy="84" rx="54" ry="4" fill="#020D1C" fillOpacity=".35"/>
      <rect x="113" y="39" width="73" height="36" rx="4" fill="#F4F7FB"/>
      <path d="M186 49H208L224 65V77H186V49Z" fill="#FFD43B"/>
      <path d="M193 53H205L215 64H193V53Z" fill="#143858"/>
      <path d="M121 47V66M130 47V66M139 47V66M148 47V66M157 47V66M166 47V66M175 47V66" stroke="#C8D4E1"/>
      <rect x="110" y="72" width="116" height="6" rx="2" fill="#5483A5"/>
      <circle cx="133" cy="78" r="8" fill="#071B30"/><circle cx="133" cy="78" r="3" fill="#CCDAE7"/>
      <circle cx="177" cy="78" r="8" fill="#071B30"/><circle cx="177" cy="78" r="3" fill="#CCDAE7"/>
      <circle cx="210" cy="78" r="8" fill="#071B30"/><circle cx="210" cy="78" r="3" fill="#CCDAE7"/>
      <rect x="219" y="67" width="5" height="4" rx="1" fill="white"/>
      <path d="M95 52H103M88 61H102" stroke="white" strokeOpacity=".45" strokeLinecap="round"/>
    </g>{loop&&<use href={`#${truckId}`} transform="translate(-360 0)"/>}</g>
  </svg>;
}
export function HomeSkeleton() {
  return <div className="home-command-center home-loading" aria-busy="true" aria-label="Loading operations dashboard">
    <div className="home-skeleton home-skeleton-title"/>
    <div className="home-metrics">{Array.from({ length: 4 }, (_, index) => <div key={index} className="home-skeleton home-skeleton-metric"/>)}</div>
    <div className="home-monitor-grid"><div className="home-skeleton home-skeleton-map"/><div className="home-skeleton home-skeleton-map"/></div>
    <div className="home-skeleton home-skeleton-table"/>
    <span className="sr-only">Loading real trip records and operational totals</span>
  </div>;
}
export function TruckPlaceholder() { return <span className="home-trip-thumbnail"><Truck size={19} aria-hidden="true"/></span>; }
