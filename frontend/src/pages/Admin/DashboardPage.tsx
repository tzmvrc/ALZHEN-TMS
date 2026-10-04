import { useEffect, useMemo, useState } from "react";
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
import dottedBackground from "../../assets/dotted.svg";
import NotificationsView from "./views/NotificationsView";
import { fetchNotifications, type AdminNotification } from "../../services/notification.service";

export interface DashboardPageProps {
  data?: DashboardData;
  loading?: boolean;
  onNavigate?: (id: string) => void;
  onLogout?: () => void;
  onSearch?: (query: string) => void;
}

const normalizeMainSection = (value: string) => {
  if (value === "notifications") return "notifications";
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
  const { logout, profile, user, accessToken } = useAuth();
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
  const [notificationCount, setNotificationCount] = useState(0);

  useEffect(() => {
    if (profile?.role !== "ADMIN" || !accessToken) {
      setNotificationCount(0);
      return;
    }
    let active = true;
    void fetchNotifications(accessToken).then((result) => {
      if (active) setNotificationCount(result.unreadCount);
    }).catch(() => {
      if (active) setNotificationCount(0);
    });
    return () => { active = false; };
  }, [accessToken, profile?.role]);

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
        label: "Users",
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
    if (nextSection === "notifications" && profile?.role !== "ADMIN") return;
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
    <div className="relative min-h-screen bg-[#f2f4f5] text-slate-900">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{ backgroundImage: `url("${dottedBackground}")`, backgroundRepeat: "repeat", backgroundSize: "20px 20px" }}
      />

      <div className="relative z-10">
        <div className="dotted-surface mx-auto max-w-[1500px] px-3 sm:px-4 lg:px-6">
          <SidebarNav
            entries={navEntries}
            activeId={activeId}
            onNavigate={handleNavigate}
            onLogout={() => setShowLogoutConfirm(true)}
            onNotificationsClick={() => handleNavigate("notifications")}
            notificationCount={profile?.role === "ADMIN" ? notificationCount : 0}
            canAccessNotifications={profile?.role === "ADMIN"}
            workspace={workspace}
            onWorkspaceChange={setWorkspace}
            userName={displayName}
            userInitial={displayName.charAt(0).toUpperCase()}
          />
        </div>

        <main className="dotted-surface mx-auto min-h-[calc(100vh-4.5rem)] w-full px-3 py-3 sm:px-4 lg:px-5">
          {activeId === "overview" ? (
            <div className="w-full">
              <h1 className="sr-only">Operations overview</h1>
              <OverviewView
                onOpenTrip={(tripId) =>
                  setActiveId(`trip-detail:${tripId}:overview`)
                }
                onMetricNavigate={handleMetricNavigate}
              />
            </div>
          ) : activeId === "notifications" ? (
            profile?.role === "ADMIN" ? <NotificationsView onOpen={(item: AdminNotification) => {
              if (!item.read_at) setNotificationCount((count) => Math.max(0, count - 1));
              const targetReport = item.metadata?.report_key;
              if (["combined", "dispatch-monitoring", "dispatch", "trip-booking", "store-calling"].includes(String(targetReport))) {
                setReportView(targetReport as "combined" | "dispatch-monitoring" | "dispatch" | "trip-booking" | "store-calling");
                setActiveId("reports");
              } else if (item.reference_type === "store_call") {
                setReportView("store-calling");
                setActiveId("reports");
              } else {
                setActiveId(`trip-detail:${item.reference_id}:overview`);
              }
            }} /> : <OverviewView onOpenTrip={(tripId) => setActiveId(`trip-detail:${tripId}:overview`)} onMetricNavigate={handleMetricNavigate} />
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
