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
  TruckGridView
} from "../../../components/admin/DashboardPrimitives";

const titleMap: Record<string, [string, string]> = {
  dispatches: ["Trips", "Create and manage the master trip record"],
  billing: ["Billing", "Phase 2: accounting PODs and invoice preparation"],
  pod: ["POD workflow", "Collect, verify, and organize proof of delivery"],
  monitoring: ["Live monitoring", "Track delivery progress, waiting time, and FOU risk"],
  "store-calling": ["Store calling", "Prepare stores for incoming deliveries"],
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
  calendar: ["Event", "Location", "Date", "Related trip", "Status"]
};

function GenericResourceTable({ id, data }: { id: string; data: DashboardData }) {
  const headings = labels[id] ?? labels.billing;
  const records = data.operations.dispatches.map((row, index) =>
    id === "billing" ? [`INV-${198 + index}`, row.id, row.route, row.amount, row.status] :
    id === "pod" ? [`POD-${index + 101}`, row.id, row.driver, row.eta, row.status] :
    id === "fleet" ? [row.driver, "Alzhen Trucking", row.id, row.hub, row.status] :
    id === "customers" ? [index % 2 ? "Vic Imperial" : "Robinsons Appliance", row.route, String(index + 1), row.eta, row.status] :
    id === "reports" ? ["Dispatch monitoring", "September 2026", String(index + 1), "Admin", "Ready"] :
    id === "messages" ? [`Operations thread ${index + 1}`, row.id, row.eta, row.driver, "Open"] :
    ["Loading / delivery checkpoint", row.hub, "Sept 16, 2026", row.id, row.status]
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <SectionHeader eyebrow="Integration-ready records" title={`${headings[0]} register`} action="Export" />
      <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-64">
          <input
            placeholder={`Search ${headings[0].toLowerCase()} records`}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-blue-600 focus:bg-white"
          />
        </div>
        <div className="flex gap-2">
          <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">Filter</button>
          <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">Sort</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[620px] w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-400">
              {headings.map((heading) => (
                <th key={heading} className="pb-4 pr-6 font-medium uppercase tracking-wider text-[11px]">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record, index) => (
              <tr key={`${id}-${index}`} className="border-b border-slate-100 last:border-none hover:bg-slate-50/50 transition-colors">
                {record.map((value, valueIndex) => (
                  <td key={`${id}-${index}-${valueIndex}`} className={`py-4 pr-6 ${valueIndex === 0 ? "font-medium text-slate-800" : "text-slate-600"}`}>
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

export default function ResourceView({ id, data }: { id: string; data: DashboardData }) {
  const [title, subtitle] = titleMap[id] ?? ["Operations", "Logistics workspace"];

  return (
    <>
      <PageIntro title={title} subtitle={subtitle} />

      {id === "dispatches" && (
        <div className="space-y-8">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-3">
              <TripIntakePanel />
            </div>
          </div>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Operational Overview</h3>
              <div className="flex gap-2">
                <button className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">Grid View</button>
                <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600">Table View</button>
              </div>
            </div>
            <TruckGridView rows={data.operations.dispatches} />
            <DispatchTable rows={data.operations.dispatches} title="Master trip register" />
          </div>
        </div>
      )}

      {id === "fleet" && (
        <div className="space-y-6">
          <SectionHeader eyebrow="Fleet Management" title="Active Vehicle Board" action="Add Vehicle" />
          <TruckGridView rows={data.operations.dispatches} />
          <GenericResourceTable id="fleet" data={data} />
        </div>
      )}

      {id === "pod" && <PodWorkflowPanel rows={data.operations.dispatches} />}
      {id === "monitoring" && <MonitoringPanel rows={data.operations.dispatches} incidents={data.operations.incidents} />}
      {id === "store-calling" && <StoreCallingPanel />}
      {id === "reports" && <ReportsPanel />}
      {id === "alerts" && <IncidentPanel rows={data.operations.incidents} title="Open delivery exceptions" />}
      {id === "settings" && <SettingsPanel />}
      {id === "compliance" && <ChecklistPanel />}
      {!["dispatches", "pod", "monitoring", "store-calling", "reports", "alerts", "settings", "compliance", "fleet"].includes(id) && <GenericResourceTable id={id} data={data} />}
    </>
  );
}
