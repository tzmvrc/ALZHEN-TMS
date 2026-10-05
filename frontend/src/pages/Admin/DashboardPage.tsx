import { useEffect, useMemo, useRef, useState } from "react";
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
  X,
  Database,
  CalendarDays,
} from "lucide-react";
import type { DashboardData } from "../../types/dashboard";
import OverviewView from "./views/OverviewView";
import ResourceView from "./views/ResourceView";
import ClientWebsiteWorkspace from "./clientwebsite";
import { defaultDashboardData } from "./data/defaultDashboardData";
import dottedBackground from "../../assets/dotted.svg";
import NotificationsView from "./views/NotificationsView";
import { fetchNotifications, markAllNotificationsAsRead, markNotificationAsRead, type AdminNotification, type AdminNotificationTarget } from "../../services/notification.service";
import { subscribeToTable } from "../../services/realtime.service";
import type { RealtimePayload } from "../../services/realtime.service";

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
      "database",
      "calendar",
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
  const [notificationItems, setNotificationItems] = useState<AdminNotification[]>([]);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [newNotification, setNewNotification] = useState<AdminNotification | null>(null);
  const [notificationTarget, setNotificationTarget] = useState<AdminNotificationTarget | null>(null);
  const notificationItemsRef = useRef<AdminNotification[]>([]);
  const seenNotificationIds = useRef(new Set<string>());
  const notificationOwner = useRef<string | null>(null);
  const notificationReload = useRef<() => void>(() => {});
  const notificationsReadAtById = useRef(new Map<string, string>());

  useEffect(() => {
    if (profile?.role !== "ADMIN" || !accessToken || !profile.id) {
      notificationReload.current = () => {};
      notificationOwner.current = null;
      notificationItemsRef.current = [];
      seenNotificationIds.current.clear();
      setNotificationItems([]);
      setNotificationCount(0);
      setNotificationLoading(false);
      setNewNotification(null);
      setNotificationError("");
      return;
    }
    if (notificationOwner.current !== profile.id) {
      notificationOwner.current = profile.id;
      notificationItemsRef.current = [];
      seenNotificationIds.current.clear();
      setNotificationItems([]);
      setNotificationCount(0);
      setNewNotification(null);
    }
    let active = true;
    let initialLoaded = false;
    let loadInFlight = false;
    const receivedBeforeLoad = new Map<string, AdminNotification>();

    const load = async () => {
      if (loadInFlight) return;
      loadInFlight = true;
      setNotificationLoading(true);
      try {
        const result = await fetchNotifications(accessToken);
        if (!active) return;
        const apiIds = new Set(result.notifications.map((item) => item.id));
        const additional = [...receivedBeforeLoad.values()].filter((item) => !apiIds.has(item.id));
        const items = [...additional, ...result.notifications]
          .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        items.forEach((item) => seenNotificationIds.current.add(item.id));
        notificationItemsRef.current = items;
        setNotificationItems(items);
        setNotificationCount(result.unreadCount + additional.filter((item) => !item.read_at).length);
        setNotificationError("");
      } catch (cause) {
        if (active) setNotificationError(cause instanceof Error ? cause.message : "Unable to load notifications.");
      } finally {
        initialLoaded = true;
        loadInFlight = false;
        if (active) setNotificationLoading(false);
      }
    };
    notificationReload.current = () => void load();

    const onNotificationEvent = (event: RealtimePayload) => {
      if (event.eventType !== "INSERT" || !event.new || event.new.recipient_profile_id !== profile.id) return;
      const row = event.new;
      if (typeof row.id !== "string" || typeof row.created_at !== "string" || typeof row.message !== "string") return;
      const item: AdminNotification = {
        id: row.id,
        actor_profile_id: typeof row.actor_profile_id === "string" ? row.actor_profile_id : null,
        notification_type: typeof row.notification_type === "string" ? row.notification_type : "",
        reference_type: typeof row.reference_type === "string" ? row.reference_type : "",
        reference_id: typeof row.reference_id === "string" ? row.reference_id : "",
        message: row.message,
        metadata: row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {},
        read_at: typeof row.read_at === "string" ? row.read_at : notificationsReadAtById.current.get(row.id) ?? null,
        created_at: row.created_at,
      };
      if (seenNotificationIds.current.has(item.id)) return;
      seenNotificationIds.current.add(item.id);
      if (!initialLoaded) receivedBeforeLoad.set(item.id, item);
      const next = [item, ...notificationItemsRef.current.filter((candidate) => candidate.id !== item.id)].slice(0, 100);
      notificationItemsRef.current = next;
      setNotificationItems(next);
      if (initialLoaded && !item.read_at) setNotificationCount((count) => count + 1);
      setNewNotification(item);
    };

    const unsubscribe = subscribeToTable("admin_notifications", onNotificationEvent, () => void load());
    void load();
    return () => {
      active = false;
      notificationReload.current = () => {};
      unsubscribe();
    };
  }, [accessToken, profile?.id, profile?.role]);

  useEffect(() => {
    if (!newNotification) return;
    const timer = window.setTimeout(() => setNewNotification(null), 7_000);
    return () => window.clearTimeout(timer);
  }, [newNotification]);

  const markNotificationReadLocally = (id: string, readAt: string) => {
    const item = notificationItemsRef.current.find((notification) => notification.id === id);
    if (!item) return;
    if (!item.read_at) setNotificationCount((count) => Math.max(0, count - 1));
    const next = notificationItemsRef.current.map((notification) => notification.id === id
      ? { ...notification, read_at: readAt }
      : notification);
    notificationItemsRef.current = next;
    setNotificationItems(next);
  };

  const handleNotificationBellOpen = async () => {
    if (!accessToken || profile?.role !== "ADMIN") return;
    const optimisticReadAt = new Date().toISOString();
    const next = notificationItemsRef.current.map((item) => item.read_at ? item : { ...item, read_at: optimisticReadAt });
    notificationItemsRef.current = next;
    setNotificationItems(next);
    setNotificationCount(0);
    try {
      const result = await markAllNotificationsAsRead(accessToken);
      const readAtById = new Map(result.notifications.map((item) => [item.id, item.read_at]));
      result.notifications.forEach((item) => notificationsReadAtById.current.set(item.id, item.read_at));
      let unreadArrivedBeforeRead = 0;
      const reconciled = notificationItemsRef.current.map((item) => {
        const readAt = readAtById.get(item.id);
        if (!readAt) return item;
        if (!item.read_at) unreadArrivedBeforeRead += 1;
        return { ...item, read_at: readAt };
      });
      notificationItemsRef.current = reconciled;
      setNotificationItems(reconciled);
      if (unreadArrivedBeforeRead) setNotificationCount((count) => Math.max(0, count - unreadArrivedBeforeRead));
      setNotificationError("");
    } catch (cause) {
      setNotificationError(cause instanceof Error ? cause.message : "Unable to mark notifications as read.");
      notificationReload.current();
    }
  };

  const handleNotificationOpen = (item: AdminNotification) => {
    const validReports = ["combined", "dispatch-monitoring", "dispatch", "trip-booking", "store-calling"] as const;
    const metadataReport = String(item.metadata?.report_key ?? "");
    const reportKey = validReports.includes(metadataReport as typeof validReports[number])
      ? metadataReport as typeof validReports[number]
      : item.reference_type === "store_call" ? "store-calling" : null;
    if (reportKey) {
      setNotificationTarget({
        notificationId: item.id,
        navigationKey: crypto.randomUUID(),
        reportKey,
        referenceType: item.reference_type,
        referenceId: item.reference_id,
        searchText: typeof item.metadata?.dispatch_number === "string" ? item.metadata.dispatch_number : undefined,
      });
      setReportView(reportKey);
      setActiveId("reports");
      onNavigate("reports");
      return;
    }
    setNotificationTarget(null);
    setActiveId(`trip-detail:${item.reference_id}:overview`);
    onNavigate(`trip-detail:${item.reference_id}:overview`);
  };

  const openToastNotification = async (item: AdminNotification) => {
    if (!item.read_at && accessToken) {
      try {
        const result = await markNotificationAsRead(accessToken, item.id);
        markNotificationReadLocally(item.id, result.read_at);
      } catch (cause) {
        setNotificationError(cause instanceof Error ? cause.message : "Unable to mark notification as read.");
        return;
      }
    }
    setNewNotification(null);
    handleNotificationOpen(item);
  };

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
      ...(profile?.role === "ADMIN" || profile?.role === "STAFF" ? [
        { id: "database", label: "Database", icon: <Database className="h-4 w-4" /> },
      ] : []),
      { id: "calendar", label: "Calendar", icon: <CalendarDays className="h-4 w-4" /> },
    ],
    [profile?.role],
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
      {profile?.role === "ADMIN" && newNotification && (
        <div role="status" aria-live="polite" className="fixed right-4 top-20 z-[90] w-[min(25rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-blue-200 bg-white shadow-xl">
          <div className="flex items-start gap-3 p-3.5">
            <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#2678b9]" />
            <button type="button" onClick={() => void openToastNotification(newNotification)} className="min-w-0 flex-1 text-left">
              <span className="block text-xs font-semibold uppercase tracking-wide text-[#2678b9]">New notification</span>
              <span className="mt-1 block text-sm font-medium text-slate-800">{newNotification.message}</span>
            </button>
            <button type="button" aria-label="Dismiss notification" onClick={() => setNewNotification(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X aria-hidden="true" className="h-4 w-4" /></button>
          </div>
        </div>
      )}
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
            onNotificationBellOpen={() => void handleNotificationBellOpen()}
            onNotificationOpen={handleNotificationOpen}
            notificationCount={profile?.role === "ADMIN" ? notificationCount : 0}
            canAccessNotifications={profile?.role === "ADMIN"}
            notificationItems={notificationItems}
            notificationLoading={notificationLoading}
            notificationError={notificationError}
            onNotificationRetry={() => notificationReload.current()}
            onNotificationRead={markNotificationReadLocally}
            workspace={workspace}
            onWorkspaceChange={setWorkspace}
            userName={displayName}
            userInitial={displayName.charAt(0).toUpperCase()}
            userPictureUrl={profile?.profile_picture_url}
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
            profile?.role === "ADMIN" ? <NotificationsView
              items={notificationItems}
              loading={notificationLoading}
              error={notificationError}
              onRetry={() => notificationReload.current()}
              onNotificationRead={markNotificationReadLocally}
              onOpen={handleNotificationOpen}
            /> : <OverviewView onOpenTrip={(tripId) => setActiveId(`trip-detail:${tripId}:overview`)} onMetricNavigate={handleMetricNavigate} />
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
              notificationTarget={notificationTarget}
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
