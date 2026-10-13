import { useState, type ComponentProps } from "react";
import ReportDataView from "./ReportDataView";
import TransmittalTrackerView from "./TransmittalTrackerView";
import SlidingSegmentedControl from "./SlidingSegmentedControl";

type Props = ComponentProps<typeof ReportDataView>;

const REPORT_LABELS: Record<NonNullable<Props["initialReport"]>, string> = {
  combined: "Combined Report",
  "dispatch-monitoring": "Dispatch Monitoring",
  dispatch: "Dispatch Report",
  "trip-booking": "Trip Booking",
  "store-calling": "Store Calling",
};

export default function ReportsWorkspace(props: Props) {
  const [activeTab, setActiveTab] = useState<"reports" | "transmittal">("reports");
  const reportLabel = REPORT_LABELS[props.initialReport ?? "combined"];
  const tabOptions = [
    { value: "reports", label: reportLabel },
    { value: "transmittal", label: "Transmittal Tracker" },
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
    </section>
  );
}
