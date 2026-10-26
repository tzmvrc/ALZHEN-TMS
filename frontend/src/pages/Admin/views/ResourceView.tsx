// src/pages/Admin/views/ResourceView.tsx
import { lazy, memo, Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import type { DashboardData } from "../../../types/dashboard";
const IncidentPanel=lazy(()=>import("../../../components/admin/DashboardPrimitives").then(module=>({default:module.IncidentPanel})));
const SectionHeader=lazy(()=>import("../../../components/admin/DashboardPrimitives").then(module=>({default:module.SectionHeader})));
const ChecklistPanel=lazy(()=>import("../../../components/admin/DashboardPrimitives").then(module=>({default:module.ChecklistPanel})));
const SettingsPanel=lazy(()=>import("../../Account/SettingsPage"));
const PodWorkflowPanel=lazy(()=>import("../../../components/admin/DashboardPrimitives").then(module=>({default:module.PodWorkflowPanel})));
import { tableUi } from "../../../components/admin/dashboardStyles";
const ReportDataView=lazy(()=>import("../../../components/admin/ReportDataView"));
const ReportsWorkspace=lazy(()=>import("../../../components/admin/ReportsWorkspace"));
import FlexibleTableSectionTabs from "../../../components/admin/FlexibleTableSectionTabs";
const TruckCardGrid=lazy(()=>import("../../../components/admin/TruckCardGrid"));
const RequestsView=lazy(()=>import("./RequestsView"));
const MasterDataView=lazy(()=>import("./MasterDataView"));
const CalendarView=lazy(()=>import("./CalendarView"));
const TripDetailView=lazy(()=>import("./TripDetailView"));
const TruckersView=lazy(()=>import("./TruckersView"));
import { createTrip } from "../../../services/trip.service";
import { useToast } from "../../../components/ui/Toast";
import { useRegisterTopbarAction } from "../../../components/admin/topbarActions";
import type {NewTripPayload} from "../../../components/admin/AddTripForm";
const AddTripForm=lazy(()=>import("../../../components/admin/AddTripForm"));
import type { AdminNotificationTarget } from "../../../services/notification.service";

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
    "Trips",
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
  calendar: ["Calendar", "View trips, stops, events, and store-call dates"],
  payables: ["Payables", "Phase 2: payable trips and cash advances"],
  compliance: ["Data controls", "POD, trip, and document controls"],
  alerts: ["Alerts", "Open delivery exceptions and aging"],
  settings: ["Settings", "Dashboard and integration preferences"],
  truckers: ["Users", "Manage staff, drivers, and vehicles"],
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
    <div className="space-y-4">
      <div className={`${tableUi.toolbar} flex-wrap`}>
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className={`${tableUi.segmentBtn} bg-white text-slate-600 shadow-[0_1px_2px_rgba(11,35,65,0.06)] hover:text-[#0b2341]`}>
            Filter
          </button>
          <button type="button" className={`${tableUi.segmentBtn} bg-white text-slate-600 shadow-[0_1px_2px_rgba(11,35,65,0.06)] hover:text-[#0b2341]`}>
            Sort
          </button>
        </div>
        </div>
      </div>
      <div className={tableUi.shell}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left">
            <thead className={tableUi.thead}>
              <tr>
                {headings.map((heading) => (
                  <th key={heading} className={tableUi.th}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((record, index) => (
                <tr key={`${id}-${index}`} className={tableUi.row}>
                  {record.map((value, valueIndex) => (
                    <td
                      key={`${id}-${index}-${valueIndex}`}
                      className={valueIndex === 0 ? tableUi.tdStrong : tableUi.td}>
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* Pages whose main content is a table: full width, title in the top bar. */
const TABLE_PAGE_IDS = new Set([
  "dispatches",
  "deliveries",
  "monitoring",
  "dispatch-monitoring",
  "store-calling",
  "reports",
  "combined",
  "dispatch",
  "trip-booking",
  "truckers",
  "database",
  "calendar",
]);

function PageHeading({ title }: { title: string; subtitle?: string }) {
  return <h1 className="sr-only">{title}</h1>;
}

/* ---------------------------------------------------------------- */
/* Main ResourceView                                                 */
/* ---------------------------------------------------------------- */
function ResourceView({
  id,
  data,
  onNavigate,
  onReportScopeChange,
  workspaceReport,
  notificationTarget,
  billingScope,
  onBillingScopeChange,
}: {
  id: string;
  data: DashboardData;
  onNavigate?: (id: string) => void;
  onReportScopeChange?: (
    value:
      | "combined"
      | "dispatch-monitoring"
      | "dispatch"
      | "trip-booking"
      | "store-calling",
  ) => void;
  workspaceReport?: "combined" | "dispatch-monitoring" | "dispatch" | "trip-booking" | "store-calling";
  notificationTarget?: AdminNotificationTarget | null;
  billingScope?: "rates-fuel" | "invoices" | "payables" | "cash-tracker";
  onBillingScopeChange?: (
    value: "rates-fuel" | "invoices" | "payables" | "cash-tracker",
  ) => void;
}) {
  const { accessToken, profile } = useAuth();
  const [tripDetailPrefix, tripDetailId, tripReturnView, stopPrefix, routeStopId] = id.split(":");
  /* Trip opened from a table/visual card. Held locally so it works even if the
     parent does not route "trip-detail:<id>" ids, and so the list underneath
     keeps its page, search and filters while the trip is open. */
  const [localTripId, setLocalTripId] = useState<string | null>(null);
  const [createdTripReference, setCreatedTripReference] = useState<string | null>(null);
  const [localTripStopId, setLocalTripStopId] = useState<string | null>(null);
  useEffect(() => {
    setLocalTripId(null);
    setLocalTripStopId(null);
  }, [id]);
  const openTrip = useCallback((tripId: string, stopId?: string | null) => {
    if(onNavigate){onNavigate(`trip-detail:${tripId}:dispatches${stopId?`:stop:${stopId}`:""}`);return;}

    setLocalTripId(tripId);
    setLocalTripStopId(stopId ?? null);
    window.scrollTo({ top: 0 });
  },[onNavigate]);
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
      "requests",
      "settings",
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
      "calendar",
      "truckers",
      "cash-tracker",
      "rates-fuel",
      "invoices",
    ].includes(id);
  /* Table pages get a compact PageHeading instead of the larger PageIntro block. */
  const showPageIntro = !TABLE_PAGE_IDS.has(id) && !isTripDetail && id !== "requests" && id !== "settings";

  const showLocalTrip = !isTripDetail && localTripId !== null;

  const isTablePage = !isTripDetail && TABLE_PAGE_IDS.has(id);
  const isTripsScope = ["dispatches", "deliveries", "monitoring"].includes(id);
  /* The report picker switches the id to combined / dispatch / trip-booking, etc.
     The page is still "Reports", so the top bar never shows the sub-report name. */
  const isReportsScope = [
    "reports",
    "combined",
    "dispatch",
    "trip-booking",
    "dispatch-monitoring",
    "store-calling",
  ].includes(id);
  const showInlineTableHeading = isTripsScope || isReportsScope || id === "database" || id === "truckers";
  const barTitle = isTripsScope
    ? "Trips"
    : isReportsScope
      ? "Reports"
      : title;
  const barSubtitle = isTripsScope
    ? (titleMap.dispatches?.[1] ?? subtitle)
    : isReportsScope
      ? (titleMap.reports?.[1] ?? subtitle)
      : subtitle;
  // The shared shell supplies consistent page padding; all sections can use its full width.
  const layoutClass = "w-full min-w-0";

  return (
    <>
      <div className={layoutClass}>
      <div hidden={showLocalTrip}>
      {isTablePage && !showInlineTableHeading && <PageHeading title={barTitle} subtitle={barSubtitle} />}
      {showPageIntro && <h1 className="sr-only">{title}</h1>}
      {isPrototype && <PrototypeNotice />}

      {/* ============ REQUESTS (prototype workflow) ============ */}
      {id === "requests" && <RequestsView />}


      {id === "dispatches" && <ReportsWorkspace initialReport={workspaceReport ?? "combined"} notificationTarget={notificationTarget} onOpenTrip={openTrip} onReportScopeChange={onReportScopeChange} createdTripReference={createdTripReference} toolbarActions={<AddTripButton onCreated={setCreatedTripReference} />} />}


      {/* ============ FLEET ============ */}
      {id === "fleet" && (
        <div className="space-y-6">
          <SectionHeader
            eyebrow="Fleet Management"
            title="Active Vehicle Board"
          />
          <TruckCardGrid rows={data.operations.dispatches} />
          <FlexibleTableSectionTabs sectionKey="fleet" sectionLabel="Fleet" accessToken={accessToken} role={profile?.role ?? ""}>
            <GenericResourceTable id="fleet" data={data} />
          </FlexibleTableSectionTabs>
        </div>
      )}

      {/* ============ OTHER PAGES ============ */}
      {id === "pod" && <PodWorkflowPanel rows={data.operations.dispatches} />}
      {id === "deliveries" && (
        <>
          <ReportDataView
            initialReport="dispatch-monitoring"
            topbarSearchScope="deliveries"
            pageTitle={barTitle}
            pageSubtitle={barSubtitle}
            notificationTarget={notificationTarget}
            showReportPicker={false}
            showExport={false}
            onOpenTrip={openTrip}
          />
        </>
      )}
      {id === "monitoring" && (
        <>
          <ReportDataView
            initialReport="dispatch-monitoring"
            topbarSearchScope="monitoring"
            pageTitle={barTitle}
            pageSubtitle={barSubtitle}
            notificationTarget={notificationTarget}
            showReportPicker={false}
            showExport={false}
            onOpenTrip={openTrip}
          />
        </>
      )}
      {isReportsScope && <ReportsWorkspace initialReport={id === "reports" ? "combined" : id as "combined" | "dispatch-monitoring" | "dispatch" | "trip-booking" | "store-calling"} pageTitle={barTitle} pageSubtitle={barSubtitle} notificationTarget={notificationTarget} onOpenTrip={openTrip} onReportScopeChange={onReportScopeChange} />}
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
      {id === "database" && <MasterDataView />}
      {id === "calendar" && <CalendarView />}
      {isTripDetail && (
        <TripDetailView
          tripId={tripDetailId}
          initialStopId={stopPrefix === "stop" ? routeStopId : undefined}
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
          "calendar",
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
          initialStopId={localTripStopId}
          onBack={() => setLocalTripId(null)}
        />
      )}
      </div>
    </>
  );
}

export default memo(ResourceView);

function AddTripButton({ onCreated }: { onCreated: (reference: string) => void }) {
  const [open, setOpen] = useState(false);
  useRegisterTopbarAction("trips:Master List", "add", { label: "Add Trip", onClick: () => setOpen(true) });
  const { addToast } = useToast();

  const { accessToken } = useAuth();
  const createTripHandler = async (payload: NewTripPayload): Promise<void> => {
    if (!accessToken) throw new Error("You are signed out. Please sign in again.");
    const trip = await createTrip(accessToken, payload);
    const reference = String(trip.dispatch_number ?? payload.trip.dispatch_number);
    onCreated(reference);
    addToast({
      variant: "success",
      title: "Trip saved",
      description: `${reference} was saved to the database. The Trips table is refreshing for this dispatch.`,
    });
  };

  return (
    <>
      {open && <Suspense fallback={<div role="status" aria-label="Opening trip form" className="fixed inset-0 z-50 bg-slate-900/10"/>}><AddTripForm onClose={() => setOpen(false)} onSubmit={createTripHandler} onImported={() => window.dispatchEvent(new Event("alzhen:trip-imported"))} /></Suspense>}
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
