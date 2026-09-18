import { AlertTriangle, CreditCard, FileText, LayoutDashboard, MapPinned, Settings, ShieldCheck, Truck, Upload, Users, Wallet } from "lucide-react";
import type { DashboardData } from "../../../types/dashboard";

export const defaultDashboardData: DashboardData = {
  user: { name: "Operations Admin" },
  nav: {
    general: [
      { id: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
      { id: "dispatches", label: "Trips", icon: <Truck className="h-4 w-4" /> },
      { id: "pod", label: "POD workflow", icon: <Upload className="h-4 w-4" /> },
      { id: "monitoring", label: "Live monitoring", icon: <MapPinned className="h-4 w-4" /> },
      { id: "store-calling", label: "Store calling", icon: <Users className="h-4 w-4" /> },
      { id: "reports", label: "Reports", icon: <Wallet className="h-4 w-4" /> },
    ],
    support: [
      { id: "alerts", label: "Alerts", icon: <AlertTriangle className="h-4 w-4" /> },
      { id: "billing", label: "Billing", icon: <CreditCard className="h-4 w-4" /> },
      { id: "payables", label: "Payables", icon: <FileText className="h-4 w-4" /> },
      { id: "compliance", label: "Data controls", icon: <ShieldCheck className="h-4 w-4" /> },
      { id: "settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
    ],
    activeId: "overview",
  },
  kpis: [], salesChart: { total: "₱ 8.42M", change: "+18.6%", points: [] }, donut: { title: "Trip mix", slices: [], centerLabel: "100%" }, tasks: [], weekly: { title: "Weekly movement", bars: [] },
  operations: {
    dispatches: [
      { id: "TR-0981", route: "Valenzuela → CDO", tripType: "Regular", status: "In Progress", eta: "Today, 18:30", hub: "PH01", driver: "Plate CBR 6492", amount: "₱ 482,600" },
      { id: "TR-0984", route: "Omni → Cainiao Meycauayan", tripType: "Stock Transfer", status: "Completed", eta: "Completed", hub: "PH8A", driver: "Deceir Trucking", amount: "₱ 168,200" },
      { id: "TR-0992", route: "Cebu → Iloilo", tripType: "Regular", status: "Delayed", eta: "2 days aging", hub: "Visayas", driver: "Alzhen Trucking", amount: "₱ 236,400" },
      { id: "TR-0997", route: "Davao → General Santos", tripType: "Regular", status: "Completed", eta: "Completed", hub: "Mindanao", driver: "TCL Fleet", amount: "₱ 310,900" },
    ],
    incidents: [
      { id: "INC-214", title: "Backload due to incorrect serials", location: "Robinsons Appliance – Cebu", issue: "Incorrect serial number mapping", severity: "High", age: "4 days" },
      { id: "INC-196", title: "Warehouse congestion", location: "Cainiao – Meycauayan", issue: "Offload caused by cargo staging delay", severity: "Medium", age: "6 days" },
      { id: "INC-188", title: "PO missing in store system", location: "Vic Imperial – Iloilo", issue: "Dispatch blocked pending P.O. validation", severity: "High", age: "8 days" },
    ],
    regionalSummary: [{ region: "Luzon", value: "₱ 3.8M", share: 45 }, { region: "Visayas", value: "₱ 2.6M", share: 31 }, { region: "Mindanao", value: "₱ 1.9M", share: 24 }],
    snapshots: [{ label: "Invoices pending receipt", value: "184", change: "+12.4%" }, { label: "PODs signed today", value: "63", change: "+8.1%" }, { label: "Fuel subsidy claims", value: "29", change: "+4.6%" }],
    issueClusters: [{ label: "Backload", value: "18" }, { label: "Offload", value: "12" }, { label: "Demurrage", value: "7" }, { label: "Missing POD", value: "9" }],
  },
};
