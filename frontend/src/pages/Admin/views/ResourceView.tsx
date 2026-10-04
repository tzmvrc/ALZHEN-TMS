// src/pages/Admin/views/ResourceView.tsx
import { useEffect, useState } from "react";
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
import TruckersView from "./TruckersView";

const titleMap: Record<string, [string, string]> = {
  "request-inbox": [
    "Request inbox",
    "Review incoming client emails and dispatch requests",
  ],
  "request-import": [
    "Import requests",
    "Prepare structured request data from client files",
  ],
  "request-history": [
    "Request history",
    "Review submitted client requests and processing status",
  ],
  requests: ["Requests", "Dispatch requests parsed from incoming TCL emails"],
  dispatches: [
    "All trips",
    "Monitor trips, loading progress, and fleet readiness",
  ],
  deliveries: [
    "Deliveries",
    "Track delivery progress and last-mile completion",
  ],
  "dispatch-planning": [
    "Dispatch planning",
    "Convert approved requests into scheduled trips",
  ],
  billing: ["Billing", "Phase 2: accounting PODs and invoice preparation"],
  pod: ["POD", "Collect, verify, and organize proof of delivery"],
  monitoring: [
    "Dispatch monitoring",
    "Review dispatch status, delivery progress, and store stops",
  ],
  "dispatch-monitoring": [
    "Dispatch monitoring",
    "Review dispatch status, delivery progress, and store stops",
  ],
  "store-calling": ["Store calling", "Prepare stores for incoming deliveries"],
  "warehouse-timings": [
    "Warehouse timings",
    "Track arrival, loading, departure, and unloading timestamps",
  ],
  transmittals: [
    "Transmittals",
    "Track signed transmittals and courier waybills",
  ],
  backloads: [
    "Backload tracker",
    "Track returned cargo, serial discrepancies, and reasons",
  ],
  offloads: [
    "Offload tracker",
    "Track cargo removed from trips and resolution status",
  ],
  rates: [
    "Rates matrix",
    "Manage route, truck-size, markup, and surcharge references",
  ],
  "fuel-cash": [
    "Fuel & cash advances",
    "Track fuel prices, manpower, transfer fees, and advances",
  ],
  "fleet-directory": [
    "Fleet directory",
    "Manage carriers, drivers, plates, and truck types",
  ],
  "warehouse-directory": [
    "Warehouse directory",
    "Manage hubs, warehouse codes, and contacts",
  ],
  "dealer-directory": [
    "Dealer directory",
    "Manage customers, branches, addresses, and contacts",
  ],
  reports: ["Reports", "Export dispatch, delivery, and POD status"],
  database: ["Database", "Browse Supabase tables and report views"],
  payables: ["Payables", "Phase 2: payable trips and cash advances"],
  compliance: ["Data controls", "POD, trip, and document controls"],
  alerts: ["Alerts", "Open delivery exceptions and aging"],
  settings: ["Settings", "Dashboard and integration preferences"],
  truckers: ["Users", "Manage staff and trucker accounts"],
  "cash-tracker": ["Cash Tracker", "Coming soon"],
  "rates-fuel": ["Rates & Fuel", "Coming soon"],
  invoices: ["Invoices", "Coming soon"],
  combined: ["Combined", "Dispatch, trip, delivery, and store data overview"],
  dispatch: ["Dispatch Report", "Operational dispatch and route detail"],
  "trip-booking": ["Trip Booking", "Trip allocation and booking detail"],
};

const labels: Record<string, string[]> = {
  billing: ["Invoice", "Trip", "Route", "Net amount", "Status"],
  pod: ["Control no.", "Trip", "Receiver", "Received date", "Status"],
  fleet: ["Vehicle", "Carrier", "Assigned trip", "Hub", "Status"],
  customers: [
    "Customer",
    "Location",
    "Active trips",
    "Last delivery",
    "Status",
  ],
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
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
            Filter
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
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
                  className="pb-4 pr-6 text-[11px] font-medium uppercase tracking-wider">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record, index) => (
              <tr
                key={`${id}-${index}`}
                className="border-b border-slate-100 transition-colors last:border-none hover:bg-slate-50/50">
                {record.map((value, valueIndex) => (
                  <td
                    key={`${id}-${index}-${valueIndex}`}
                    className={`py-4 pr-6 ${
                      valueIndex === 0
                        ? "font-medium text-slate-800"
                        : "text-slate-600"
                    }`}>
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
  tripScope,
  onTripScopeChange,
  onReportScopeChange,
  billingScope,
  onBillingScopeChange,
}: {
  id: string;
  data: DashboardData;
  onNavigate?: (id: string) => void;
  tripScope?: "dispatches" | "monitoring" | "deliveries";
  onTripScopeChange?: (
    value: "dispatches" | "monitoring" | "deliveries",
  ) => void;
  onReportScopeChange?: (
    value:
      | "combined"
      | "dispatch-monitoring"
      | "dispatch"
      | "trip-booking"
      | "store-calling",
  ) => void;
  billingScope?: "rates-fuel" | "invoices" | "payables" | "cash-tracker";
  onBillingScopeChange?: (
    value: "rates-fuel" | "invoices" | "payables" | "cash-tracker",
  ) => void;
}) {
  const [tripDetailPrefix, tripDetailId, tripReturnView] = id.split(":");
  /* Trip opened from a table/visual card. Held locally so it works even if the
     parent does not route "trip-detail:<id>" ids, and so the list underneath
     keeps its page, search and filters while the trip is open. */
  const [localTripId, setLocalTripId] = useState<string | null>(null);
  useEffect(() => {
    setLocalTripId(null);
  }, [id]);
  const openTrip = (tripId: string) => {
    setLocalTripId(tripId);
    window.scrollTo({ top: 0 });
  };
  const isTripDetail =
    tripDetailPrefix === "trip-detail" && Boolean(tripDetailId);
  const [title, subtitle] = isTripDetail
    ? [
        "Trip details",
        "Dispatch, route, stops, products, and recorded activity",
      ]
    : (titleMap[id] ?? ["Operations", "Logistics workspace"]);
  const isPrototype =
    !isTripDetail &&
    ![
      "dispatches",
      "deliveries",
      "monitoring",
      "dispatch-monitoring",
      "store-calling",
      "reports",
      "combined",
      "dispatch",
      "trip-booking",
      "database",
      "truckers",
      "cash-tracker",
      "rates-fuel",
      "invoices",
    ].includes(id);
  const showPageIntro =
    ![
      "dispatches",
      "deliveries",
      "monitoring",
      "dispatch-monitoring",
      "store-calling",
      "reports",
      "combined",
      "dispatch",
      "trip-booking",
    ].includes(id) && !isTripDetail;

  const showLocalTrip = !isTripDetail && localTripId !== null;

  return (
    <>
      <div hidden={showLocalTrip}>
      {showPageIntro && <PageIntro title={title} subtitle={subtitle} />}
      {isPrototype && <PrototypeNotice />}

      {/* ============ REQUESTS (prototype workflow) ============ */}
      {id === "requests" && <RequestsView />}

      {id === "dispatches" && (
        <>
          <TripsPageHeader scope="dispatches" />
          <ReportDataView
            initialReport="trip-booking"
            showReportPicker={false}
            onOpenTrip={openTrip}
            tripScope={tripScope ?? "dispatches"}
            onTripScopeChange={onTripScopeChange}
          />
        </>
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
      {id === "deliveries" && (
        <>
          <TripsPageHeader scope="deliveries" showAdd={false} />
          <ReportDataView
            initialReport="dispatch-monitoring"
            showReportPicker={false}
            onOpenTrip={openTrip}
            tripScope={tripScope ?? "deliveries"}
            onTripScopeChange={onTripScopeChange}
          />
        </>
      )}
      {id === "monitoring" && (
        <>
          <TripsPageHeader scope="monitoring" showAdd={false} />
          <ReportDataView
            initialReport="dispatch-monitoring"
            showReportPicker={false}
            onOpenTrip={openTrip}
            tripScope={tripScope ?? "monitoring"}
            onTripScopeChange={onTripScopeChange}
          />
        </>
      )}
      {id === "dispatch-monitoring" && (
        <ReportDataView
          initialReport="dispatch-monitoring"
          onOpenTrip={openTrip}
          onReportScopeChange={onReportScopeChange}
        />
      )}
      {id === "store-calling" && (
        <ReportDataView
          initialReport="store-calling"
          onOpenTrip={openTrip}
          onReportScopeChange={onReportScopeChange}
        />
      )}
      {id === "reports" && (
        <ReportDataView
          onOpenTrip={openTrip}
          onReportScopeChange={onReportScopeChange}
        />
      )}
      {id === "combined" && (
        <ReportDataView
          initialReport="combined"
          onOpenTrip={openTrip}
          onReportScopeChange={onReportScopeChange}
        />
      )}
      {id === "dispatch" && (
        <ReportDataView
          initialReport="dispatch"
          onOpenTrip={openTrip}
          onReportScopeChange={onReportScopeChange}
        />
      )}
      {id === "trip-booking" && (
        <ReportDataView
          initialReport="trip-booking"
          onOpenTrip={openTrip}
          onReportScopeChange={onReportScopeChange}
        />
      )}
      {id === "truckers" && <TruckersView />}
      {id === "cash-tracker" && (
        <>
          <BillingFilterBar
            value={billingScope ?? "cash-tracker"}
            onChange={onBillingScopeChange}
          />
          <PlaceholderPage title="Cash Tracker" />
        </>
      )}
      {id === "rates-fuel" && (
        <>
          <BillingFilterBar
            value={billingScope ?? "rates-fuel"}
            onChange={onBillingScopeChange}
          />
          <PlaceholderPage title="Rates & Fuel" />
        </>
      )}
      {id === "invoices" && (
        <>
          <BillingFilterBar
            value={billingScope ?? "invoices"}
            onChange={onBillingScopeChange}
          />
          <PlaceholderPage title="Invoices" />
        </>
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
      {!isTripDetail &&
        ![
          "requests",
          "dispatches",
          "deliveries",
          "pod",
          "monitoring",
          "dispatch-monitoring",
          "store-calling",
          "reports",
          "combined",
          "dispatch",
          "trip-booking",
          "database",
          "alerts",
          "settings",
          "compliance",
          "fleet",
          "truckers",
          "cash-tracker",
          "rates-fuel",
          "invoices",
        ].includes(id) && <GenericResourceTable id={id} data={data} />}
      </div>
      {showLocalTrip && localTripId && (
        <TripDetailView
          tripId={localTripId}
          onBack={() => setLocalTripId(null)}
        />
      )}
    </>
  );
}

type TripScope = "dispatches" | "monitoring" | "deliveries";

const tripScopeCopy: Record<TripScope, string> = {
  dispatches: "Every booked trip, with its route, truck, driver and cargo.",
  monitoring: "Follow dispatches from loading to arrival.",
  deliveries: "Check what has been delivered and what is still assigned.",
};

function TripsPageHeader({
  scope,
  showAdd = true,
}: {
  scope: TripScope;
  showAdd?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-[#0b2341]">
            Trips
          </h1>
          <p className="mt-1 text-sm text-slate-500">{tripScopeCopy[scope]}</p>
        </div>
        {showAdd && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-[#ffd43b] px-4 py-2.5 text-sm font-semibold text-[#0b2341] transition hover:bg-[#f2c200] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/40">
            <span aria-hidden="true" className="text-base leading-none">
              +
            </span>
            Add trip
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b2341]/30 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-trip-title"
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_24px_60px_rgba(11,35,65,0.28)]">
            <h3
              id="add-trip-title"
              className="text-lg font-semibold text-[#0b2341]">
              Add trip
            </h3>
            <p className="mt-3 text-sm text-slate-600">Form coming soon.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-[#f2f6fa]">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BillingFilterBar({
  value,
  onChange,
}: {
  value: "rates-fuel" | "invoices" | "payables" | "cash-tracker";
  onChange?: (
    value: "rates-fuel" | "invoices" | "payables" | "cash-tracker",
  ) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
        Billing View
        <select
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value as
              | "rates-fuel"
              | "invoices"
              | "payables"
              | "cash-tracker";
            onChange?.(nextValue);
          }}
          className="rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-500">
          <option value="rates-fuel">Rates & Fuel</option>
          <option value="invoices">Invoices</option>
          <option value="payables">Payables</option>
          <option value="cash-tracker">Cash Tracker</option>
        </select>
      </label>
    </div>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white">
      <div className="text-center">
        <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-500">Coming soon</p>
      </div>
    </div>
  );
}

function PrototypeNotice() {
  return (
    <p className="mb-4 border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      Prototype area. Displayed data and changes are not connected to the
      backend.
    </p>
  );
}
