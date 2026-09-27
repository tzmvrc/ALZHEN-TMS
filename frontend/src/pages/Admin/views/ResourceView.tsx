// src/pages/Admin/views/ResourceView.tsx
import type { DashboardData } from "../../../types/dashboard";
import {
  IncidentPanel,
  SectionHeader,
  PageIntro,
  ChecklistPanel,
  SettingsPanel,
  PodWorkflowPanel,
} from "../../../components/admin/DashboardPrimitives";
import ReportDataView from "../../../components/admin/ReportDataView";
import TruckCardGrid from "../../../components/admin/TruckCardGrid";
import RequestsView from "./RequestsView";
import DatabaseExplorerView from "./DatabaseExplorerView";
import TripDetailView from "./TripDetailView";

const titleMap: Record<string, [string, string]> = {
  "request-inbox": ["Request inbox", "Review incoming client emails and dispatch requests"],
  "request-import": ["Import requests", "Prepare structured request data from client files"],
  "request-history": ["Request history", "Review submitted client requests and processing status"],
  requests: ["Requests", "Dispatch requests parsed from incoming TCL emails"],
  dispatches: ["Warehouse operations", "Monitor trips, loading progress, and fleet readiness"],
  "dispatch-planning": ["Dispatch planning", "Convert approved requests into scheduled trips"],
  billing: ["Billing", "Phase 2: accounting PODs and invoice preparation"],
  pod: ["POD workflow", "Collect, verify, and organize proof of delivery"],
  monitoring: ["Dispatch monitoring", "Review dispatch status, delivery progress, and store stops"],
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
  database: ["Database", "Browse Supabase tables and report views"],
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
  onNavigate,
}: {
  id: string;
  data: DashboardData;
  onNavigate?: (id: string) => void;
}) {
  const [tripDetailPrefix, tripDetailId, tripReturnView] = id.split(":");
  const isTripDetail = tripDetailPrefix === "trip-detail" && Boolean(tripDetailId);
  const [title, subtitle] = isTripDetail
    ? ["Trip details", "Dispatch, route, stops, products, and recorded activity"]
    : titleMap[id] ?? ["Operations", "Logistics workspace"];
  const isPrototype = !isTripDetail && ![
    "dispatches",
    "monitoring",
    "store-calling",
    "reports",
    "database",
  ].includes(id);

  return (
    <>
      <PageIntro title={title} subtitle={subtitle} />
      {isPrototype && <PrototypeNotice />}

      {/* ============ REQUESTS (prototype workflow) ============ */}
      {id === "requests" && <RequestsView />}

      {/* ============ TRIP BOOKING REPORT ============ */}
      {id === "dispatches" && (
        <ReportDataView
          initialReport="trip-booking"
          showReportPicker={false}
          onOpenTrip={(tripId) => onNavigate?.(`trip-detail:${tripId}:${id}`)}
        />
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
        <ReportDataView
          initialReport="dispatch-monitoring"
          showReportPicker={false}
          onOpenTrip={(tripId) => onNavigate?.(`trip-detail:${tripId}:${id}`)}
        />
      )}
      {id === "store-calling" && (
        <ReportDataView
          initialReport="store-calling"
          showReportPicker={false}
          onOpenTrip={(tripId) => onNavigate?.(`trip-detail:${tripId}:${id}`)}
        />
      )}
      {id === "reports" && (
        <ReportDataView
          onOpenTrip={(tripId) => onNavigate?.(`trip-detail:${tripId}:${id}`)}
        />
      )}
      {id === "database" && <DatabaseExplorerView />}
      {isTripDetail && (
        <TripDetailView
          tripId={tripDetailId}
          onBack={() => onNavigate?.(tripReturnView || "dispatches")}
        />
      )}
      {id === "alerts" && (
        <IncidentPanel
          rows={data.operations.incidents}
          title="Open delivery exceptions"
        />
      )}
      {id === "settings" && <SettingsPanel />}
      {id === "compliance" && <ChecklistPanel />}

      {/* ============ FALLBACK ============ */}
      {!isTripDetail && ![
        "requests",
        "dispatches",
        "pod",
        "monitoring",
        "store-calling",
        "reports",
        "database",
        "alerts",
        "settings",
        "compliance",
        "fleet",
      ].includes(id) && <GenericResourceTable id={id} data={data} />}
    </>
  );
}

function PrototypeNotice() {
  return (
    <p className="mb-4 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      Prototype area. Displayed data and changes are not connected to the backend.
    </p>
  );
}