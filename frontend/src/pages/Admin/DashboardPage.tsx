import { useMemo, useState } from "react";
import SidebarNav from "../../components/admin/SidebarNav";
import { PageIntro, TopBar } from "../../components/admin/DashboardPrimitives";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";
import type { DashboardData } from "../../types/dashboard";
import OverviewView from "./views/OverviewView";
import ResourceView from "./views/ResourceView";
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
  onLogout = () => {},
  onSearch = () => {},
}: DashboardPageProps) {
  const { profile, logout } = useAuth();
  const { addToast } = useToast();
  const [activeId, setActiveId] = useState(data.nav.activeId);
  const [searchQuery, setSearchQuery] = useState("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const navItems = useMemo(
    () => [...data.nav.general, ...data.nav.support],
    [data.nav.general, data.nav.support],
  );
  const activeLabel =
    navItems.find((item) => item.id === activeId)?.label ?? "Overview";
  const displayName =
    profile?.first_name && profile?.last_name
      ? `${profile.first_name} ${profile.last_name}`
      : (profile?.first_name ?? "User");
  const displayRole = profile?.role ?? "ADMIN";

  const handleConfirmLogout = async () => {
    setLogoutLoading(true);

    try {
      await logout();
      addToast({
        title: "Logged out successfully.",
        variant: "success",
        duration: 2500,
      });
      onLogout();
      setShowLogoutConfirm(false);
      window.location.assign("/login");
    } catch (error) {
      addToast({
        title: "Unable to log out completely. Please try again.",
        variant: "error",
        duration: 3500,
      });
    } finally {
      setLogoutLoading(false);
    }
  };

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
    setActiveId(id);
    onNavigate(id);
  };

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
      </div>
    );

  return (
    <div className="dotted-surface min-h-screen w-full text-slate-900">
      <div className="flex min-h-screen w-full overflow-hidden">
        <SidebarNav
          general={data.nav.general}
          support={data.nav.support}
          activeId={activeId}
          onNavigate={handleNavigate}
          onLogout={() => setShowLogoutConfirm(true)}
          userName={displayName}
          userRole={displayRole}
          userInitial={displayName.charAt(0).toUpperCase()}
        />
        <div className="min-w-0 flex-1 overflow-y-auto lg:ml-[260px]">
          <TopBar
            activeLabel={activeLabel}
            onSearch={(query) => {
              setSearchQuery(query);
              onSearch(query);
            }}
          />
          <main className="p-4 sm:p-6 md:p-8 lg:p-10">
            {activeId === "overview" ? (
              <>
                <PageIntro
                  title="Dispatch command center"
                  subtitle="Monitor billing, delivery, POD, and exception activity across Luzon, Visayas, and Mindanao."
                />
                <OverviewView data={filteredData} />
              </>
            ) : (
              <ResourceView id={activeId} data={filteredData} />
            )}
          </main>
        </div>
      </div>

      <ConfirmDialog
        open={showLogoutConfirm}
        title="Log out"
        description="Are you sure you want to log out?"
        cancelLabel="Cancel"
        confirmLabel="Log out"
        confirmDisabled={logoutLoading}
        isConfirming={logoutLoading}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => void handleConfirmLogout()}
      />
    </div>
  );
}
