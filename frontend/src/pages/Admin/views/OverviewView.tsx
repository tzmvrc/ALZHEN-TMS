import { AlertTriangle, FileText, Package, Wallet } from "lucide-react";
import type { DashboardData } from "../../../types/dashboard";
import {
  ActivityPanel,
  DispatchTable,
  FleetBoardPanel,
  IncidentPanel,
  IssuePanel,
  KpiCard,
  RegionalPanel,
  SnapshotPanel,
  StatusOverviewPanel,
  RevenueChart
} from "../../../components/admin/DashboardPrimitives";

export default function OverviewView({ data }: { data: DashboardData }) {
  const operations = data.operations;
  const kpis = [
    { label: "Trip revenue", value: data.salesChart.total, change: data.salesChart.change, tone: "blue" as const, icon: <Wallet className="h-5 w-5" /> },
    { label: "Completed loads", value: String(operations.dispatches.filter((row) => row.status === "Completed").length), change: "+11.2%", tone: "emerald" as const, icon: <Package className="h-5 w-5" /> },
    { label: "Delayed trips", value: String(operations.dispatches.filter((row) => row.status === "Delayed").length), change: "-6.3%", tone: "amber" as const, icon: <AlertTriangle className="h-5 w-5" /> },
    { label: "PODs captured", value: "96.4%", change: "+4.1%", tone: "violet" as const, icon: <FileText className="h-5 w-5" /> },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Section */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
      </div>

      {/* Main Analytics Section */}
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <RevenueChart data={data.salesChart.points} />
        <div className="space-y-6">
          <StatusOverviewPanel rows={operations.dispatches} />
          <ActivityPanel rows={operations.dispatches} />
        </div>
      </div>

      {/* Operational Fleet View - Now using the new Truck Grid layout */}
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <FleetBoardPanel rows={operations.dispatches} />
        <div className="space-y-6">
          <RegionalPanel data={operations.regionalSummary} />
          <IssuePanel data={operations.issueClusters} />
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <IncidentPanel rows={operations.incidents.slice(0, 3)} />
        <SnapshotPanel data={operations.snapshots} />
      </div>

      {/* Detailed Dispatch Table at the bottom for operational reference */}
      <DispatchTable rows={operations.dispatches} title="All Active Trips" />
    </div>
  );
}
