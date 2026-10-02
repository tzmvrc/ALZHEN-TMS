import { useMemo, useState } from "react";
import dottedBackground from "../../assets/dotted-bg.svg";
import SidebarNav, {
  type NavEntry,
  type WorkspaceName,
} from "../../components/admin/SidebarNav";
import { PageSkeleton } from "../../components/admin/DashboardPrimitives";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { useAuth } from "../../context/AuthContext";
import {
  BarChart3,
  FileText,
  LayoutDashboard,
  Truck,
  Users,
  WalletCards,
} from "lucide-react";
import type { DashboardData } from "../../types/dashboard";
import OverviewView from "./views/OverviewView";
import ResourceView from "./views/ResourceView";
import ClientWebsiteWorkspace from "./clientwebsite";
import { defaultDashboardData } from "./data/defaultDashboardData";

export interface DashboardPageProps {
  data?: DashboardData;
  loading?: boolean;
  onNavigate?: (id: string) => void;
  onLogout?: () => void;
  onSearch?: (query: string) => void;
}

const normalizeMainSection = (value: string) => {
  if (["dispatches", "deliveries", "monitoring"].includes(value))
    return "trips";
  if (
    [
      "combined",
      "dispatch-monitoring",
      "dispatch",
      "trip-booking",
      "store-calling",
    ].includes(value)
  )
    return "reports";
  if (["rates-fuel", "invoices", "payables", "cash-tracker"].includes(value))
    return "billing";
  if (
    [
      "overview",
      "trips",
      "truckers",
      "pod",
      "reports",
      "billing",
      "settings",
    ].includes(value)
  )
    return value;
  return "overview";
};

export default function DashboardPage({
  data = defaultDashboardData,
  loading = false,
  onNavigate = () => {},
  onLogout,
}: DashboardPageProps) {
  const { logout, profile, user } = useAuth();
  const displayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    user?.email ||
    data.user.name;
  const [workspace, setWorkspace] =
    useState<WorkspaceName>("Operational Admin");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [activeId, setActiveId] = useState(() =>
    normalizeMainSection(data.nav.activeId),
  );
  const [tripView, setTripView] = useState<
    "dispatches" | "monitoring" | "deliveries"
  >("dispatches");
  const [reportView, setReportView] = useState<
    | "combined"
    | "dispatch-monitoring"
    | "dispatch"
    | "trip-booking"
    | "store-calling"
  >("combined");
  const [billingView, setBillingView] = useState<
    "rates-fuel" | "invoices" | "payables" | "cash-tracker"
  >("invoices");
  const [searchQuery] = useState("");

  const navEntries: NavEntry[] = useMemo(
    () => [
      {
        id: "overview",
        label: "Home",
        icon: <LayoutDashboard className="h-4 w-4" />,
      },
      { id: "trips", label: "Trips", icon: <Truck className="h-4 w-4" /> },
      {
        id: "truckers",
        label: "Truckers",
        icon: <Users className="h-4 w-4" />,
      },
      { id: "pod", label: "POD", icon: <FileText className="h-4 w-4" /> },
      {
        id: "reports",
        label: "Reports",
        icon: <BarChart3 className="h-4 w-4" />,
      },
      {
        id: "billing",
        label: "Billing",
        icon: <WalletCards className="h-4 w-4" />,
      },
    ],
    [],
  );

  const filteredData = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return data;
    return {
      ...data,
      operations: {
        ...data.operations,
        dispatches: data.operations.dispatches.filter((row) =>
          `${row.id} ${row.route} ${row.hub} ${row.driver}`
            .toLowerCase()
            .includes(query),
        ),
        incidents: data.operations.incidents.filter((row) =>
          `${row.id} ${row.title} ${row.location}`
            .toLowerCase()
            .includes(query),
        ),
      },
    };
  }, [data, searchQuery]);

  const handleNavigate = (id: string) => {
    const nextSection = normalizeMainSection(id);
    setActiveId(nextSection);
    onNavigate(nextSection);
  };

  const handleMetricNavigate = (id: string) => {
    const nextSection = normalizeMainSection(id);
    if (id === "dispatches") setTripView("dispatches");
    if (id === "monitoring") setTripView("monitoring");
    if (id === "combined") setReportView("combined");
    if (id === "dispatch") setReportView("dispatch");
    if (id === "trip-booking") setReportView("trip-booking");
    if (id === "store-calling") setReportView("store-calling");
    setActiveId(nextSection);
    onNavigate(nextSection);
  };

  const handleConfirmLogout = async () => {
    setLogoutLoading(true);
    try {
      await (onLogout ?? logout)();
      setShowLogoutConfirm(false);
    } finally {
      setLogoutLoading(false);
    }
  };

  if (loading) {
    return <PageSkeleton />;
  }

  if (workspace === "Client Website") {
    return (
      <>
        <ClientWebsiteWorkspace
          userName={displayName}
          onWorkspaceChange={setWorkspace}
          onLogout={() => setShowLogoutConfirm(true)}
        />
        <ConfirmDialog
          open={showLogoutConfirm}
          title="Log out?"
          description="Are you sure you want to log out?"
          confirmDisabled={logoutLoading}
          isConfirming={logoutLoading}
          onCancel={() => setShowLogoutConfirm(false)}
          onConfirm={() => void handleConfirmLogout()}
        />
      </>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#edf4fd] text-slate-900">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-100"
        style={{
          backgroundColor: "#edf4fd",
          backgroundImage: `url(${dottedBackground})`,
          backgroundRepeat: "repeat",
          backgroundSize: "18px 18px",
          backgroundPosition: "center",
        }}
      />

      <div className="relative z-10">
        <div className="mx-auto max-w-[1500px] px-3 sm:px-4 lg:px-6">
          <SidebarNav
            entries={navEntries}
            activeId={activeId}
            onNavigate={handleNavigate}
            onLogout={() => setShowLogoutConfirm(true)}
            workspace={workspace}
            onWorkspaceChange={setWorkspace}
            userName={displayName}
            userInitial={displayName.charAt(0).toUpperCase()}
          />
        </div>

        <main className="mx-auto min-h-[calc(100vh-4.5rem)] max-w-[1500px] px-3 py-3 sm:px-4 lg:px-5">
          {activeId === "overview" ? (
            <div className="w-full">
              <div className="mb-3">
                <h1 className="text-base font-semibold text-slate-900">
                  Operations overview
                </h1>
              </div>
              <OverviewView
                onOpenTrip={(tripId) =>
                  setActiveId(`trip-detail:${tripId}:overview`)
                }
                onMetricNavigate={handleMetricNavigate}
              />
            </div>
          ) : activeId === "trips" ? (
            <ResourceView
              id={tripView}
              data={filteredData}
              onNavigate={handleNavigate}
              tripScope={tripView}
              onTripScopeChange={(next) => {
                setTripView(next);
                setActiveId("trips");
              }}
            />
          ) : activeId === "truckers" ? (
            <ResourceView
              id="truckers"
              data={filteredData}
              onNavigate={handleNavigate}
            />
          ) : activeId === "pod" ? (
            <ResourceView
              id="pod"
              data={filteredData}
              onNavigate={handleNavigate}
            />
          ) : activeId === "reports" ? (
            <ResourceView
              id={reportView}
              data={filteredData}
              onNavigate={handleNavigate}
              onReportScopeChange={(next) => {
                setReportView(next);
                setActiveId("reports");
              }}
            />
          ) : activeId === "billing" ? (
            <ResourceView
              id={billingView}
              data={filteredData}
              onNavigate={handleNavigate}
              billingScope={billingView}
              onBillingScopeChange={(next) => {
                setBillingView(next);
                setActiveId("billing");
              }}
            />
          ) : activeId === "settings" ? (
            <ResourceView
              id="settings"
              data={filteredData}
              onNavigate={handleNavigate}
            />
          ) : (
            <ResourceView
              id={activeId}
              data={filteredData}
              onNavigate={handleNavigate}
            />
          )}
        </main>

        <ConfirmDialog
          open={showLogoutConfirm}
          title="Log out?"
          description="Are you sure you want to log out?"
          confirmDisabled={logoutLoading}
          isConfirming={logoutLoading}
          onCancel={() => setShowLogoutConfirm(false)}
          onConfirm={() => void handleConfirmLogout()}
        />
      </div>
    </div>
  );
}
