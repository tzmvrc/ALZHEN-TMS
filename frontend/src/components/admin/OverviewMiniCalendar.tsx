// src/components/admin/OverviewMiniCalendar.tsx
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

type Props = {
  className?: string;
  /** ISO dates (YYYY-MM-DD) that get a dot, e.g. trip delivery dates. */
  markedDates?: string[];
  /** Label for the footer count, e.g. "deliveries". */
  markedLabel?: string;
  onOpenCalendar?: () => void;
};

export default function OverviewMiniCalendar({
  className = "",
  markedDates = [],
  markedLabel = "deliveries",
  onOpenCalendar,
}: Props) {
  const today = new Date();
  const [cursor, setCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );

  const marked = useMemo(() => new Set(markedDates), [markedDates]);

  // Always 6 weeks so the card never changes height when you change months.
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [cursor]);

  const todayKey = dateKey(today);
  const monthPrefix = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
  const monthCount = [...marked].filter((key) => key.startsWith(monthPrefix)).length;
  const isCurrentMonth =
    cursor.getFullYear() === today.getFullYear() &&
    cursor.getMonth() === today.getMonth();

  const shiftMonth = (delta: number) =>
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  const navButton =
    "inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-[#eef3f9] hover:text-[#0b2341] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/30";

  return (
    <section
      aria-label="Calendar"
      className={`flex min-w-0 flex-col rounded-[28px] bg-white p-4 ring-1 ring-slate-900/[0.04] shadow-[0_1px_2px_rgba(11,35,65,0.03)] ${className}`}
    >
      <header className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight text-[#0b2341]">
          {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h2>
        <div className="flex items-center gap-0.5">
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
              className="mr-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-[#0b2341] hover:bg-[#eef3f9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/30"
            >
              Today
            </button>
          )}
          <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)} className={navButton}>
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)} className={navButton}>
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="mt-3 grid grid-cols-7 text-center text-[11px] font-medium text-slate-400">
        {WEEKDAYS.map((day, index) => (
          <span key={index} className="py-1">
            {day}
          </span>
        ))}
      </div>

      <div className="grid min-h-[12rem] auto-rows-fr grid-cols-7 place-items-center">
        {cells.map((date) => {
          const key = dateKey(date);
          const inMonth = date.getMonth() === cursor.getMonth();
          const isToday = key === todayKey;
          const hasMark = marked.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={onOpenCalendar}
              aria-label={`${date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}${hasMark ? `, has ${markedLabel}` : ""}`}
              aria-current={isToday ? "date" : undefined}
              className={`relative flex h-8 w-8 items-center justify-center rounded-full text-[12px] tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/30 ${
                isToday
                  ? "bg-[#0b2341] font-semibold text-white"
                  : inMonth
                    ? "text-slate-700 hover:bg-[#eef3f9]"
                    : "text-slate-300 hover:bg-slate-50"
              }`}
            >
              {date.getDate()}
              {hasMark && (
                <span
                  aria-hidden="true"
                  className={`absolute bottom-1 h-1 w-1 rounded-full ${isToday ? "bg-white" : "bg-[#4f7bb0]"}`}
                />
              )}
            </button>
          );
        })}
      </div>

      <footer className="mt-2 flex shrink-0 items-center justify-between border-t border-slate-100 pt-3">
        <span className="flex items-center gap-1.5 text-[12px] text-slate-500">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#4f7bb0]" />
          {monthCount} {markedLabel} this month
        </span>
        <button
          type="button"
          onClick={onOpenCalendar}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium text-[#0b2341] hover:bg-[#eef3f9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/30"
        >
          <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
          Open
        </button>
      </footer>
    </section>
  );
}