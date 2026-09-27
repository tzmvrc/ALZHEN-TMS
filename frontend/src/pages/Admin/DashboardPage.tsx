import { useMemo, useState } from "react";
import SidebarNav, {
  type NavEntry,
  type NavItemWithBadge,
  type WorkspaceName,
} from "../../components/admin/SidebarNav";
import { TopBar } from "../../components/admin/DashboardPrimitives";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { useAuth } from "../../context/AuthContext";
import {
  FileCheck2,
  HelpCircle,
  LayoutDashboard,
  Mail,
  Database,
  Truck,
  WalletCards,
} from "lucide-react";
import type { DashboardData } from "../../types/dashboard";
import OverviewView from "./views/OverviewView";
import ResourceView from "./views/ResourceView";
import ClientWebsiteWorkspace from "./ClientWebsiteWorkspace";
import { defaultDashboardData } from "./data/defaultDashboardData";

export interface DashboardPageProps {
  data?: DashboardData;
  loading?: boolean;
  onNavigate?: (id: string) => void;
  onLogout?: () => void;
  onSearch?: (query: string) => void;
}

export default function DashboardPage({
  data = defaultDashboardData,
  loading = false,
  onNavigate = () => {},
  onLogout
}: DashboardPageProps) {
  const { logout, profile, user } = useAuth();
  const displayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    user?.email ||
    data.user.name;
  const [workspace, setWorkspace] = useState<WorkspaceName>("Operations Admin");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [activeId, setActiveId] = useState(data.nav.activeId);
  const [searchQuery] = useState("");

  /* ---------------------------------------------------------------- */
  /* Build sidebar entries                                             */
  /* ---------------------------------------------------------------- */
  const navEntries: NavEntry[] = useMemo(() => {
    const general = Object.fromEntries(
      data.nav.general.map((item) => [item.id, item]),
    );
    const support = Object.fromEntries(
      data.nav.support.map((item) => [item.id, item]),
    );

    const custom = (id: string, label: string) => ({ id, label });

    const withDefaults = (
      id: string,
      label: string,
      icon: React.ReactNode,
      children: (NavItemWithBadge | undefined)[],
    ): NavEntry | null => {
      const resolved = children.filter(
        (child): child is NavItemWithBadge => Boolean(child),
      );
      if (resolved.length === 0) return null;
      return { id, label, icon, children: resolved };
    };

    const entries: (NavEntry | null)[] = [
      // Home — flat item
      general.overview
        ? {
            id: "overview",
            label: "Home",
            icon: <LayoutDashboard className="h-4 w-4" />,
          }
        : null,

      // Requests — flat item
      general.requests
        ? {
            ...general.requests,
            icon: <Mail className="h-4 w-4" />,
          }
        : null,

      // Trips — group
      withDefaults("trips", "Trips", <Truck className="h-4 w-4" />, [
        general.dispatches,
        custom("dispatch-planning", "New Trip"),
        general.monitoring,
      ]),

      // Deliveries — group
      withDefaults(
        "deliveries",
        "Deliveries",
        <FileCheck2 className="h-4 w-4" />,
        [
          custom("delivery-list", "Delivery List"),
          general.pod,
          custom("returns", "Returns & Pull-Outs"),
        ],
      ),

      // Issues — group
      withDefaults("issues", "Issues", <HelpCircle className="h-4 w-4" />, [
        custom("report-issue", "Report an Issue"),
        support.alerts,
        custom("resolved-issues", "Resolved"),
      ]),

      // Billing — group
      withDefaults("billing", "Billing", <WalletCards className="h-4 w-4" />, [
        support.billing,
        support.payables,
        custom("rates-fuel", "Rates & Fuel"),
      ]),

      // Store calling — flat
      general["store-calling"] ? { ...general["store-calling"] } : null,

      // Reports — flat
      general.reports ? { ...general.reports } : null,

      // Data controls — flat
      support.compliance ? { ...support.compliance } : null,

      profile?.role === "ADMIN"
        ? { id: "database", label: "Database", icon: <Database className="h-4 w-4" /> }
        : null,
    ];

    return entries.filter(Boolean) as NavEntry[];
  }, [data.nav, profile?.role]);

  /* ---------------------------------------------------------------- */
  /* Flatten for active label lookup                                   */
  /* ---------------------------------------------------------------- */
  const navItems = useMemo(
    () =>
      navEntries.flatMap((entry) =>
        "children" in entry && Array.isArray(entry.children)
          ? entry.children
          : [entry],
      ),
    [navEntries],
  );
  const activeLabel = activeId.startsWith("trip-detail:")
    ? "Trip details"
    : navItems.find((item) => item.id === activeId)?.label ?? "Overview";

  /* ---------------------------------------------------------------- */
  /* Search filtering                                                  */
  /* ---------------------------------------------------------------- */
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

  /* ---------------------------------------------------------------- */
  /* Handlers                                                          */
  /* ---------------------------------------------------------------- */
  const handleNavigate = (id: string) => {
    setActiveId(id);
    onNavigate(id);
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

  /* ---------------------------------------------------------------- */
  /* Loading                                                           */
  /* ---------------------------------------------------------------- */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Client Website workspace                                          */
  /* ---------------------------------------------------------------- */
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

  /* ---------------------------------------------------------------- */
  /* Operations Admin workspace                                        */
  /* ---------------------------------------------------------------- */
  return (
    <div className="min-h-screen w-full dotted-surface text-slate-900">
      <div className="flex min-h-screen w-full">
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

        <div className="min-w-0 flex-1 lg:pl-[288px] dotted-surface">
          <TopBar
            activeLabel={activeLabel}
            onNotifications={() => handleNavigate("alerts")}
            onProfile={() => handleNavigate("settings")}
            onSettings={() => handleNavigate("settings")}
            onHelp={() => handleNavigate("compliance")}
            userName={displayName}
            userInitial={displayName.charAt(0).toUpperCase()}
            notificationCount={0}
          />

          <main className="min-h-[calc(100vh-3rem)] px-6 py-2 lg:px-6">
            {activeId === "overview" ? (
              <>
                <div className="mb-6">
                  <h1 className="text-lg font-semibold text-slate-900">
                    Operations overview
                  </h1>
                </div>
                <OverviewView
                  onOpenTrip={(tripId) => setActiveId(`trip-detail:${tripId}:overview`)}
                />
              </>
            ) : (
              <ResourceView
                id={activeId}
                data={filteredData}
                onNavigate={handleNavigate}
              />
            )}
          </main>
        </div>
      </div>

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
  );
}