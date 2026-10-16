import { useState, type ComponentProps } from "react";
import ReportDataView from "./ReportDataView";
import TransmittalTrackerView from "./TransmittalTrackerView";
import SlidingSegmentedControl from "./SlidingSegmentedControl";
import OperationsReportsView from "./OperationsReportsView";
import { REPORTS } from "../../services/report.service";

type Props = ComponentProps<typeof ReportDataView>;

export default function ReportsWorkspace(props: Props) {
  const [activeTab, setActiveTab] = useState<"reports" | "transmittal" | "operations">("reports");
  const reportLabel = REPORTS[props.initialReport ?? "combined"].title;
  const tabOptions = [
    { value: "reports", label: reportLabel },
    { value: "transmittal", label: "Transmittal Tracker" },
    { value: "operations", label: "Offload Reports" },
  ] as const;
  const tabs = (
    <SlidingSegmentedControl
      aria-label="Reports views"
      role="tablist"
      options={tabOptions}
      value={activeTab}
      onChange={(value) => setActiveTab(value)}
    />
  );
  return (
    <section className="space-y-3">
      <header>
        <h1 className="text-xl font-bold leading-tight tracking-tight text-[#0b2341]">
          {props.pageTitle ?? "Reports"}
        </h1>
        {props.pageSubtitle && (
          <p className="mt-1 text-xs leading-snug text-slate-600">
            {props.pageSubtitle}
          </p>
        )}
      </header>
      <div role="tabpanel" hidden={activeTab !== "reports"}>
        <ReportDataView {...props} pageTitle={undefined} pageSubtitle={undefined} toolbarLeading={tabs} />
      </div>
      {activeTab === "transmittal" && <div role="tabpanel" className="space-y-3">{tabs}<TransmittalTrackerView /></div>}
      {activeTab === "operations" && <div role="tabpanel" className="space-y-3">{tabs}<OperationsReportsView mode="management" onOpenTrip={props.onOpenTrip} /></div>}
    </section>
  );
}
