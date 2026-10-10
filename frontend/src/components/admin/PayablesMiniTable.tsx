// src/components/admin/PayablesMiniTable.tsx
// Compact payables / bills table for the Home page.
// The payables backend is a Phase 2 feature, so rows are passed in as a prop.
// Until real data is wired up, the sample rows below are shown and labelled as such.
import { ChevronRight } from "lucide-react";
import { surface } from "./dashboardStyles";

export type PayableRow = {
  id: string;
  payee: string;
  reference: string;
  dueDate: string; // YYYY-MM-DD
  amount: number;
  status: "Unpaid" | "Due soon" | "Overdue" | "Paid";
};

export const SAMPLE_PAYABLES: PayableRow[] = [
  { id: "p1", payee: "Fuel supplier", reference: "BILL-0412", dueDate: "2026-10-12", amount: 48250, status: "Due soon" },
  { id: "p2", payee: "Trucking partner", reference: "BILL-0409", dueDate: "2026-10-07", amount: 125000, status: "Overdue" },
  { id: "p3", payee: "Manpower agency", reference: "BILL-0415", dueDate: "2026-10-20", amount: 36400, status: "Unpaid" },
  { id: "p4", payee: "Toll & parking", reference: "BILL-0401", dueDate: "2026-10-03", amount: 9800, status: "Paid" },
];

const STATUS_TONE: Record<PayableRow["status"], string> = {
  Paid: "bg-emerald-50 text-emerald-700",
  Unpaid: "bg-slate-100 text-slate-600",
  "Due soon": "bg-amber-50 text-amber-700",
  Overdue: "bg-rose-50 text-rose-700",
};

const peso = (value: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(value);

function shortDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function PayablesMiniTable({
  rows = SAMPLE_PAYABLES,
  isSample = rows === SAMPLE_PAYABLES,
  onViewAll,
  className = "",
}: {
  rows?: PayableRow[];
  /** Shows a "Sample data" tag when the rows are placeholders. */
  isSample?: boolean;
  onViewAll?: () => void;
  className?: string;
}) {
  const open = rows.filter((row) => row.status !== "Paid");
  const outstanding = open.reduce((sum, row) => sum + row.amount, 0);
  const overdue = rows.filter((row) => row.status === "Overdue").length;

  return (
    <section aria-label="Payables" className={`${surface.card} flex min-w-0 flex-col overflow-hidden ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className={surface.heading}>Payables &amp; bills</h2>
            {isSample && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                Sample data
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            <span className="font-semibold text-[#0b2341]">{peso(outstanding)}</span> outstanding
            {overdue > 0 && <span className="font-medium text-rose-600"> · {overdue} overdue</span>}
          </p>
        </div>
        {onViewAll && (
          <button type="button" onClick={onViewAll} className={surface.chipGhost}>
            View all
            <ChevronRight aria-hidden="true" className="ml-1 h-3 w-3" />
          </button>
        )}
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left">
          <thead>
            <tr className="border-y border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="px-5 py-2.5">Payee</th>
              <th className="px-3 py-2.5">Bill no.</th>
              <th className="px-3 py-2.5">Due</th>
              <th className="px-3 py-2.5 text-right">Amount</th>
              <th className="px-5 py-2.5 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-400">
                  No bills to show.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100/80 last:border-0 hover:bg-[#f2f6fa]/70">
                  <td className="px-5 py-3 text-[13px] font-medium text-[#0b2341]">{row.payee}</td>
                  <td className="px-3 py-3 text-[12px] text-slate-500">{row.reference}</td>
                  <td className="px-3 py-3 text-[12px] text-slate-600">{shortDate(row.dueDate)}</td>
                  <td className="px-3 py-3 text-right text-[13px] font-medium tabular-nums text-slate-700">
                    {peso(row.amount)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${STATUS_TONE[row.status]}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}