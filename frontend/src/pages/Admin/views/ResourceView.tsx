// src/pages/Admin/views/ResourceView.tsx
import type { DashboardData } from "../../../types/dashboard";
import {
  DispatchTable,
  IncidentPanel,
  SectionHeader,
  PageIntro,
  ChecklistPanel,
  SettingsPanel,
  TripIntakePanel,
  PodWorkflowPanel,
  MonitoringPanel,
  StoreCallingPanel,
  ReportsPanel,
} from "../../../components/admin/DashboardPrimitives";
import TruckCardGrid from "../../../components/admin/TruckCardGrid";
import RequestsView from "./RequestsView";

const titleMap: Record<string, [string, string]> = {
  "request-inbox": ["Request inbox", "Review incoming client emails and dispatch requests"],
  "request-import": ["Import requests", "Prepare structured request data from client files"],
  "request-history": ["Request history", "Review submitted client requests and processing status"],
  requests: ["Requests", "Dispatch requests parsed from incoming TCL emails"],
  dispatches: ["Warehouse operations", "Monitor trips, loading progress, and fleet readiness"],
  "dispatch-planning": ["Dispatch planning", "Convert approved requests into scheduled trips"],
  billing: ["Billing", "Phase 2: accounting PODs and invoice preparation"],
  pod: ["POD workflow", "Collect, verify, and organize proof of delivery"],
  monitoring: ["Live monitoring", "Track delivery progress, waiting time, and FOU risk"],
  "store-calling": ["Store calling", "Prepare stores for incoming deliveries"],
  "warehouse-timings": ["Warehouse timings", "Track arrival, loading, departure, and unloading timestamps"],
  transmittals: ["Transmittals", "Track signed transmittals and courier waybills"],
  backloads: ["Backload tracker", "Track returned cargo, serial discrepancies, and reasons"],
  offloads: ["Offload tracker", "Track cargo removed from trips and resolution status"],
  rates: ["Rates matrix", "Manage route, truck-size, markup, and surcharge references"],
  "fuel-cash": ["Fuel & cash advances", "Track fuel prices, manpower, transfer fees, and advances"],
  "fleet-directory": ["Fleet directory", "Manage carriers, drivers, plates, and truck types"],
  "warehouse-directory": ["Warehouse directory", "Manage hubs, warehouse codes, and contacts"],
  "dealer-directory": ["Dealer directory", "Manage customers, branches, addresses, and contacts"],
  reports: ["Reports", "Export dispatch, delivery, and POD status"],
  payables: ["Payables", "Phase 2: payable trips and cash advances"],
  compliance: ["Data controls", "POD, trip, and document controls"],
  alerts: ["Alerts", "Open delivery exceptions and aging"],
  settings: ["Settings", "Dashboard and integration preferences"],
};

const labels: Record<string, string[]> = {
  billing: ["Invoice", "Trip", "Route", "Net amount", "Status"],
  pod: ["Control no.", "Trip", "Receiver", "Received date", "Status"],
  fleet: ["Vehicle", "Carrier", "Assigned trip", "Hub", "Status"],
  customers: ["Customer", "Location", "Active trips", "Last delivery", "Status"],
  reports: ["Report", "Period", "Records", "Owner", "Status"],
  messages: ["Thread", "Related trip", "Last update", "Owner", "Status"],
  calendar: ["Event", "Location", "Date", "Related trip", "Status"],
};

/* ---------------------------------------------------------------- */
/* Warehouse overview KPI strip (used on the Trips page)             */
/* ---------------------------------------------------------------- */
function WarehouseOverview({ data }: { data: DashboardData }) {
  const trips = data.operations.dispatches;
  const trucksInside = trips.filter(
    (t) => t.status === "In Progress" || t.progressPct === 100,
  ).length;
  const unassigned = Math.max(trips.length - 3, 0);
  const activeLoading = trips.filter((t) => t.status === "In Progress").length;
  const ready = trips.filter((t) => (t.progressPct ?? 0) >= 80).length;

  const items = [
    {
      label: "Trucks inside",
      value: String(trucksInside).padStart(2, "0"),
      sub: "Active status",
      icon: "🚚",
    },
    {
      label: "Unassigned shipments",
      value: String(unassigned).padStart(2, "0"),
      sub: "Pending status",
      icon: "📦",
    },
    {
      label: "Active loading docks",
      value: `${activeLoading}/10`,
      sub: "60% total usage",
      icon: "🏭",
    },
    {
      label: "Dispatch ready",
      value: String(ready).padStart(2, "0"),
      sub: "Ready for today",
      icon: "✅",
    },
  ];

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Warehouse overview
          </p>
        </div>
        <span className="text-[11px] text-slate-400">
          Last updated: Today, 14:32 PM
        </span>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="border-slate-100 sm:border-r sm:pr-5 sm:last:border-r-0"
          >
            <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="text-sm">{item.icon}</span>
              {item.label}
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {item.value}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">{item.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Generic fallback table for un-specialized resource IDs            */
/* ---------------------------------------------------------------- */
function GenericResourceTable({
  id,
  data,
}: {
  id: string;
  data: DashboardData;
}) {
  const headings = labels[id] ?? labels.billing;
  const records = data.operations.dispatches.map((row, index) =>
    id === "billing"
      ? [`INV-${198 + index}`, row.id, row.route, row.amount, row.status]
      : id === "pod"
        ? [`POD-${index + 101}`, row.id, row.driver, row.eta, row.status]
        : id === "fleet"
          ? [row.driver, "Alzhen Trucking", row.id, row.hub, row.status]
          : id === "customers"
            ? [
                index % 2 ? "Vic Imperial" : "Robinsons Appliance",
                row.route,
                String(index + 1),
                row.eta,
                row.status,
              ]
            : id === "reports"
              ? [
                  "Dispatch monitoring",
                  "September 2026",
                  String(index + 1),
                  "Admin",
                  "Ready",
                ]
              : id === "messages"
                ? [
                    `Operations thread ${index + 1}`,
                    row.id,
                    row.eta,
                    row.driver,
                    "Open",
                  ]
                : [
                    "Loading / delivery checkpoint",
                    row.hub,
                    "Sept 16, 2026",
                    row.id,
                    row.status,
                  ],
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <SectionHeader
        eyebrow="Integration-ready records"
        title={`${headings[0]} register`}
        action="Export"
      />
      <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-64">
          <input
            placeholder={`Search ${headings[0].toLowerCase()} records`}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-blue-600 focus:bg-white"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600"
          >
            Filter
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600"
          >
            Sort
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-400">
              {headings.map((heading) => (
                <th
                  key={heading}
                  className="pb-4 pr-6 text-[11px] font-medium uppercase tracking-wider"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record, index) => (
              <tr
                key={`${id}-${index}`}
                className="border-b border-slate-100 transition-colors last:border-none hover:bg-slate-50/50"
              >
                {record.map((value, valueIndex) => (
                  <td
                    key={`${id}-${index}-${valueIndex}`}
                    className={`py-4 pr-6 ${
                      valueIndex === 0
                        ? "font-medium text-slate-800"
                        : "text-slate-600"
                    }`}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Main ResourceView                                                 */
/* ---------------------------------------------------------------- */
export default function ResourceView({
  id,
  data,
}: {
  id: string;
  data: DashboardData;
}) {
  const [title, subtitle] = titleMap[id] ?? [
    "Operations",
    "Logistics workspace",
  ];

  return (
    <>
      <PageIntro title={title} subtitle={subtitle} />

      {/* ============ REQUESTS (inbox-style approval workflow) ============ */}
      {id === "requests" && <RequestsView />}

      {/* ============ TRIPS / WAREHOUSE OPERATIONS ============ */}
      {id === "dispatches" && (
        <div className="space-y-6">
          <WarehouseOverview data={data} />
          <TruckCardGrid rows={data.operations.dispatches} />
          <div className="space-y-6">
            <TripIntakePanel />
            <DispatchTable
              rows={data.operations.dispatches}
              title="Master trip register"
            />
          </div>
        </div>
      )}

      {/* ============ FLEET ============ */}
      {id === "fleet" && (
        <div className="space-y-6">
          <SectionHeader
            eyebrow="Fleet Management"
            title="Active Vehicle Board"
            action="Add Vehicle"
          />
          <TruckCardGrid rows={data.operations.dispatches} />
          <GenericResourceTable id="fleet" data={data} />
        </div>
      )}

      {/* ============ OTHER PAGES ============ */}
      {id === "pod" && <PodWorkflowPanel rows={data.operations.dispatches} />}
      {id === "monitoring" && (
        <MonitoringPanel
          rows={data.operations.dispatches}
          incidents={data.operations.incidents}
          monitoring={data.operations.monitoring}
        />
      )}
      {id === "store-calling" && <StoreCallingPanel />}
      {id === "reports" && <ReportsPanel />}
      {id === "alerts" && (
        <IncidentPanel
          rows={data.operations.incidents}
          title="Open delivery exceptions"
        />
      )}
      {id === "settings" && <SettingsPanel />}
      {id === "compliance" && <ChecklistPanel />}

      {/* ============ FALLBACK ============ */}
      {![
        "requests",
        "dispatches",
        "pod",
        "monitoring",
        "store-calling",
        "reports",
        "alerts",
        "settings",
        "compliance",
        "fleet",
      ].includes(id) && <GenericResourceTable id={id} data={data} />}
    </>
  );
}