import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronDown,
  Search,
  AlertTriangle,
  Download,
  FileText,
  MapPinned,
  Smartphone,
  Truck,
} from "lucide-react";
import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import type { DashboardData, DispatchRecord, IncidentRecord, SalesPoint } from "../../types/dashboard";
import { toneClasses } from "./dashboardStyles";

Chart.register(CategoryScale, Filler, Legend, LineController, LinearScale, LineElement, PointElement, Tooltip);

export function TopBar({ activeLabel, onSearch }: { activeLabel: string; onSearch: (query: string) => void }) {
  const [search, setSearch] = useState("");
  return (
    <header className="sticky top-4 z-20 mx-4 rounded-2xl border border-white/80 bg-white/90 px-4 py-3 shadow-[0_14px_35px_rgba(42,76,120,0.1)] backdrop-blur-xl sm:px-6 sm:py-4 lg:mx-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span className="hidden sm:inline">Operations</span>
          <ChevronDown className="hidden h-4 w-4 shrink-0 sm:block text-slate-300" />
          <span className="text-lg font-semibold text-slate-900">{activeLabel}</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="relative hidden md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
            <input
              value={search}
              onChange={(event) => { setSearch(event.target.value); onSearch(event.target.value); }}
              placeholder="Search records..."
              className="w-64 rounded-lg border border-slate-100 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-600 outline-none placeholder:text-slate-300 transition-all focus:border-blue-200 focus:bg-white focus:ring-4 focus:ring-blue-50"
            />
          </div>
          <button type="button" aria-label="Notifications" className="relative rounded-full bg-white p-2 text-slate-400 shadow-sm border border-slate-100 transition-all hover:text-blue-600 hover:border-blue-100">
            <Bell className="h-4 w-4" />
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-blue-500 border-2 border-white"></span>
          </button>
          <div className="h-8 w-8 rounded-full bg-slate-900 text-xs font-bold text-white flex items-center justify-center ring-4 ring-slate-50">A</div>
        </div>
      </div>
    </header>
  );
}

export function KpiCard({ label, value, change, tone, icon }: { label: string; value: string; change: string; tone: keyof typeof toneClasses; icon: ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
          <h3 className="text-3xl font-bold tracking-tight text-slate-900">{value}</h3>
        </div>
        <div className={`rounded-2xl p-3 ${toneClasses[tone]}`}>
          {icon}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs font-medium">
        <span className={`rounded-full px-2 py-0.5 ${change.startsWith('+') ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
          {change}
        </span>
        <span className="text-slate-300">vs last week</span>
      </div>
    </div>
  );
}

export function RevenueChart({ data }: { data: SalesPoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    Chart.getChart(canvasRef.current)?.destroy();

    const chart = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: data.map((point) => point.label),
        datasets: [
          {
            label: "Revenue",
            data: data.map((point) => point.primary),
            borderColor: "#2563eb",
            backgroundColor: "rgba(37, 99, 235, 0.12)",
            borderWidth: 2,
            pointBackgroundColor: "#2563eb",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            fill: true,
            tension: 0.35,
          },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: {
              label: (context) => `Revenue: ${context.formattedValue}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: "#94a3b8", font: { size: 12 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: "#f1f5f9", drawTicks: false },
            border: { display: false },
            ticks: { color: "#94a3b8", padding: 8, font: { size: 12 } },
          },
        },
      },
    });

    return () => chart.destroy();
  }, [data]);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-slate-900">Revenue Trend</h3>
          <p className="text-sm text-slate-500">Monthly operational income</p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-lg border border-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">Monthly</button>
          <button className="rounded-lg border border-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">Yearly</button>
        </div>
      </div>
      <div className="relative h-64 w-full">
        <canvas ref={canvasRef} aria-label="Revenue trend chart" role="img" />
      </div>
    </div>
  );
}

export function TruckCard({ truck }: { truck: DispatchRecord }) {
  const statusClasses = {
    Completed: "bg-emerald-50 text-emerald-600",
    "In Progress": "bg-amber-50 text-amber-600",
    Delayed: "bg-rose-50 text-rose-600"
  };

  const loadProgress = parseInt(truck.id.replace(/\\D/g, '')) % 100 || 65;

  return (
    <div className="group rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:border-blue-200 hover:shadow-md">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
            <Truck className="h-5 w-5" />
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-bold text-slate-900">{truck.id}</p>
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">{truck.driver}</p>
          </div>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${statusClasses[truck.status]}`}>
          {truck.status}
        </span>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-50/50 p-3 border border-slate-50">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <MapPinned className="h-3.5 w-3.5 text-slate-400" />
          {truck.route}
        </div>
        <span className="text-xs font-bold text-slate-900">{truck.eta}</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Load Progress</span>
          <span className="font-semibold text-slate-900">{loadProgress}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-500"
            style={{ width: `${loadProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function TruckGridView({ rows }: { rows: DispatchRecord[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {rows.map((row) => (
        <TruckCard key={row.id} truck={row} />
      ))}
    </div>
  );
}

export function SectionHeader({ eyebrow, title, action = "Export" }: { eyebrow: string; title: string; action?: string }) {
  return (
    <div className="mb-8 flex items-center justify-between gap-3">
      <div className="space-y-1">
        <p className="text-[11px] font-bold uppercase tracking-widest text-blue-500">{eyebrow}</p>
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
      </div>
      <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-4 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 shadow-sm">
        {action}<ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function PageIntro({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-8 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Logistics operations</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-500">{subtitle}</p>
      </div>
      <span className="shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm">
        September 2026
      </span>
    </div>
  );
}

export function DispatchTable({ rows, title = "Active trips" }: { rows: DispatchRecord[]; title?: string }) {
  const [filter, setFilter] = useState<"All" | "In Progress" | "Completed" | "Delayed">("All");
  const statusClasses = { Completed: "bg-emerald-50 text-emerald-600", "In Progress": "bg-amber-50 text-amber-600", Delayed: "bg-rose-50 text-rose-600" } as const;
  const headings = ["Trip", "Route", "Type", "Status", "ETA", "Hub", "Driver", "Amount"];
  const filteredRows = filter === "All" ? rows : rows.filter((row) => row.status === filter);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <SectionHeader eyebrow="Dispatch monitoring" title={title} action="New trip" />
      <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-100 pb-4">
        {["All", "In Progress", "Completed", "Delayed"].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item as typeof filter)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${filter === item ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400">
              {headings.map((heading) => (
                <th key={heading} className="pb-4 pr-4 font-medium uppercase tracking-wider text-[11px]">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id} className="border-b border-slate-50 last:border-none hover:bg-slate-50/50 transition-colors">
                <td className="py-4 pr-4 font-semibold text-slate-900">{row.id}</td>
                <td className="py-4 pr-4 text-slate-600">{row.route}</td>
                <td className="py-4 pr-4 text-slate-600">{row.tripType}</td>
                <td className="py-4 pr-4">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusClasses[row.status]}`}>
                    {row.status}
                  </span>
                </td>
                <td className="py-4 pr-4 text-slate-600">{row.eta}</td>
                <td className="py-4 pr-4 text-slate-600">{row.hub}</td>
                <td className="py-4 pr-4 text-slate-600">{row.driver}</td>
                <td className="py-4 text-right font-bold text-slate-900">{row.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function IncidentPanel({ rows, title = "Backload & offload log" }: { rows: IncidentRecord[]; title?: string }) {
  const colors = { High: "bg-rose-50 text-rose-600", Medium: "bg-amber-50 text-amber-600", Low: "bg-emerald-50 text-emerald-600" } as const;
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <SectionHeader eyebrow="Exceptions" title={title} action="View all" />
      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-slate-50 bg-slate-50/30 p-4 transition-all hover:bg-white hover:shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-slate-900">{row.title}</p>
                <p className="text-xs text-slate-400">{row.location}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${colors[row.severity]}`}>
                {row.severity}
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">{row.issue}</p>
            <div className="mt-4 flex justify-between text-[11px] font-medium text-slate-400">
              <span>{row.id}</span>
              <span>{row.age} aging</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SnapshotPanel({ data }: { data: DashboardData["operations"]["snapshots"] }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <SectionHeader eyebrow="Operations snapshot" title="Document flow" action="Refresh" />
      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.label} className="flex items-center justify-between rounded-xl bg-slate-50/50 px-4 py-3 transition-colors hover:bg-blue-50/50 border border-transparent hover:border-blue-100">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-slate-400">{item.label}</p>
              <p className="text-lg font-bold text-slate-900">{item.value}</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-600">{item.change}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RegionalPanel({ data }: { data: DashboardData["operations"]["regionalSummary"] }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <SectionHeader eyebrow="Regional summary" title="Service invoice coverage" action="Details" />
      <div className="space-y-5">
        {data.map((item, index) => (
          <div key={item.region}>
            <div className="mb-2 flex justify-between text-sm">
              <span className="font-bold text-slate-700">{item.region}</span>
              <span className="text-slate-400">{item.value}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full transition-all duration-700 ${["bg-blue-600", "bg-emerald-500", "bg-violet-500"][index % 3]}`}
                style={{ width: `${item.share}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function IssuePanel({ data }: { data: DashboardData["operations"]["issueClusters"] }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <SectionHeader eyebrow="Exception overview" title="Issue clusters" action="Review" />
      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.label} className="flex items-center justify-between rounded-xl bg-slate-50/50 px-4 py-3 transition-colors hover:bg-blue-50/50 border border-transparent hover:border-blue-100">
            <span className="text-sm font-medium text-slate-600">{item.label}</span>
            <span className="text-base font-bold text-slate-900">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChecklistPanel() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <SectionHeader eyebrow="Document controls" title="Compliance checklist" action="Run check" />
      <div className="grid gap-3 md:grid-cols-2">
        {["POD signed and archived", "IR submitted for incidents", "Invoice has SAP S.O. number", "Delivery receipt matched", "Serial numbers validated", "Transmittal tracking updated"].map((item) => (
          <div key={item} className="flex items-center gap-3 rounded-xl bg-slate-50/50 p-4 text-sm text-slate-700 transition-all hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-100">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsPanel() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <SectionHeader eyebrow="Configuration" title="Integration preferences" action="Save changes" />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="rounded-xl bg-slate-50/50 p-4 text-sm text-slate-600 block border border-slate-100">
          <span className="font-medium text-slate-500">Default region</span>
          <select className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600">
            <option>All regions</option>
            <option>Luzon</option>
            <option>Visayas</option>
            <option>Mindanao</option>
          </select>
        </label>
        <label className="rounded-xl bg-slate-50/50 p-4 text-sm text-slate-600 block border border-slate-100">
          <span className="font-medium text-slate-500">Data refresh interval</span>
          <select className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600">
            <option>Every 15 minutes</option>
            <option>Every hour</option>
            <option>Manual</option>
          </select>
        </label>
      </div>
    </div>
  );
}

export function ActivityPanel({ rows }: { rows: DispatchRecord[] }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <SectionHeader eyebrow="Timeline" title="Recent activity" action="View all" />
      <div className="space-y-6">
        {rows.slice(0, 5).map((row) => (
          <div key={row.id} className="relative pl-6 before:absolute before:left-0 before:top-1 before:h-full before:w-px before:bg-slate-100 last:before:hidden">
            <div className="absolute left-[-4px] top-1 h-2 w-2 rounded-full bg-blue-600 ring-4 ring-blue-50" />
            <div className="flex items-start justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-slate-900">{row.id}</p>
                <p className="text-xs text-slate-400">{row.route} • {row.driver}</p>
              </div>
              <span className="text-[11px] font-medium text-slate-400">{row.eta}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatusOverviewPanel({ rows }: { rows: DispatchRecord[] }) {
  const stats = {
    total: rows.length,
    completed: rows.filter(r => r.status === "Completed").length,
    inProgress: rows.filter(r => r.status === "In Progress").length,
    delayed: rows.filter(r => r.status === "Delayed").length,
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <SectionHeader eyebrow="Status" title="Delivery overview" />
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-slate-50/50 p-4 text-center border border-slate-100">
          <p className="text-2xl font-bold text-slate-900">{stats.completed}</p>
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Completed</p>
        </div>
        <div className="rounded-xl bg-slate-50/50 p-4 text-center border border-slate-100">
          <p className="text-2xl font-bold text-slate-900">{stats.inProgress}</p>
          <p className="text-[11px] uppercase tracking-wider text-slate-400">In Progress</p>
        </div>
        <div className="rounded-xl bg-slate-50/50 p-4 text-center border border-slate-100">
          <p className="text-2xl font-bold text-slate-900">{stats.delayed}</p>
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Delayed</p>
        </div>
        <div className="rounded-xl bg-slate-50/50 p-4 text-center border border-slate-100">
          <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Total Trips</p>
        </div>
      </div>
    </div>
  );
}

export function FleetBoardPanel({ rows }: { rows: DispatchRecord[] }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <SectionHeader eyebrow="Fleet" title="Vehicles in operation" action="Manage fleet" />
      <TruckGridView rows={rows.slice(0, 8)} />
    </div>
  );
}

export function TripIntakePanel() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-slate-900">New Trip Entry</h3>
        <button className="rounded-full bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 transition-all shadow-sm hover:shadow-blue-100">Save Trip</button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Route</label>
          <input placeholder="e.g. MNL to CEB" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:bg-white transition-all" />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Driver</label>
          <input placeholder="Search driver..." className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:bg-white transition-all" />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Trip Type</label>
          <select className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:bg-white transition-all">
            <option>Regular</option>
            <option>Stock Transfer</option>
          </select>
        </div>
      </div>
    </div>
  );
}

export function PodWorkflowPanel({ rows }: { rows: DispatchRecord[] }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <SectionHeader eyebrow="PODs" title="Workflow Queue" action="Archive all" />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400">
              <th className="pb-4 font-medium uppercase tracking-wider text-[11px]">Control No.</th>
              <th className="pb-4 pr-4 font-medium uppercase tracking-wider text-[11px]">Trip</th>
              <th className="pb-4 pr-4 font-medium uppercase tracking-wider text-[11px]">Receiver</th>
              <th className="pb-4 pr-4 font-medium uppercase tracking-wider text-[11px]">Status</th>
              <th className="pb-4 text-right font-medium uppercase tracking-wider text-[11px]">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} className="border-b border-slate-50 last:border-none hover:bg-slate-50/50 transition-colors">
                <td className="py-4 font-medium text-slate-900">POD-{i + 1001}</td>
                <td className="py-4 pr-4 text-slate-600">{row.id}</td>
                <td className="py-4 pr-4 text-slate-600">{row.driver}</td>
                <td className="py-4 pr-4">
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${row.status === "Completed" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                    {row.status === "Completed" ? "Verified" : "Pending"}
                  </span>
                </td>
                <td className="py-4 text-right">
                  <button className="text-blue-600 hover:underline text-xs font-bold">Verify</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MonitoringPanel({ rows, incidents }: { rows: DispatchRecord[]; incidents: IncidentRecord[] }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <SectionHeader eyebrow="Real-time" title="Live monitoring" />
        <div className="grid gap-4">
          {rows.slice(0, 3).map((row) => (
            <div key={row.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/30 p-4 transition-all hover:bg-white hover:shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-slate-900">{row.id} • {row.driver}</p>
                  <p className="text-xs text-slate-400">{row.route} • Last signal 2m ago</p>
                </div>
              </div>
              <span className="text-xs font-bold text-blue-600 cursor-pointer hover:underline">Track Live</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <SectionHeader eyebrow="Risk" title="FOU & Demurrage" action="Alert IT" />
        <div className="space-y-3">
          {incidents.map((inc) => (
            <div key={inc.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 transition-all hover:bg-slate-50">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-4 w-4 text-rose-500" />
                <p className="text-sm text-slate-700">{inc.title}</p>
              </div>
              <span className="text-xs font-bold text-rose-600">{inc.age}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StoreCallingPanel() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <SectionHeader eyebrow="Communication" title="Store calling queue" action="Call Now" />
      <div className="space-y-3">
        {["Store 042 - Manila", "Store 011 - Quezon City", "Store 089 - Cavite"].map((store, i) => (
          <div key={i} className="flex items-center justify-between rounded-xl border border-slate-100 p-4 transition-all hover:bg-slate-50">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                <Smartphone className="h-4 w-4" />
              </div>
              <p className="text-sm font-medium text-slate-900">{store}</p>
            </div>
            <div className="flex gap-2">
              <button className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors">Skip</button>
              <button className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition-colors shadow-sm">Call</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReportsPanel() {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <SectionHeader eyebrow="Analytics" title="Operational reports" action="Custom Report" />
      <div className="grid gap-4">
        {[
          { name: "Daily Dispatch Summary", type: "CSV", size: "1.2 MB", date: "Today" },
          { name: "Monthly Delivery Performance", type: "PDF", size: "4.5 MB", date: "Yesterday" },
          { name: "POD Compliance Report", type: "XLSX", size: "2.1 MB", date: "2 days ago" },
        ].map((report, i) => (
          <div key={i} className="flex items-center justify-between rounded-xl border border-slate-100 p-4 transition-all hover:bg-slate-50">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <FileText className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-bold text-slate-900">{report.name}</p>
                <p className="text-xs text-slate-400">{report.type} • {report.size} • {report.date}</p>
              </div>
            </div>
            <button className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-white hover:text-blue-600 transition-colors shadow-sm">
              <Download className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
