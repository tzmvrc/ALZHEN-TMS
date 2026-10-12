import { useState, type ComponentProps } from "react";
import ReportDataView from "./ReportDataView";
import TransmittalTrackerView from "./TransmittalTrackerView";

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
  return <section className="space-y-3">
    <div role="tablist" aria-label="Reports views" className="flex gap-1 overflow-x-auto border-b border-slate-200">
      <button type="button" role="tab" aria-selected={activeTab === "reports"} onClick={() => setActiveTab("reports")} className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${activeTab === "reports" ? "border-[#12365a] text-[#12365a]" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{reportLabel}</button>
      <button type="button" role="tab" aria-selected={activeTab === "transmittal"} onClick={() => setActiveTab("transmittal")} className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${activeTab === "transmittal" ? "border-[#12365a] text-[#12365a]" : "border-transparent text-slate-500 hover:text-slate-800"}`}>Transmittal Tracker</button>
    </div>
    <div role="tabpanel" hidden={activeTab !== "reports"}>
      <ReportDataView {...props} />
    </div>
    {activeTab === "transmittal" && <div role="tabpanel"><TransmittalTrackerView /></div>}
  </section>;
}
