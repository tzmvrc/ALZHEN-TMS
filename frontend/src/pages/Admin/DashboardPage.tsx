// src/pages/Admin/DashboardPage.tsx
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
  Inbox,
  LayoutDashboard,
  Truck,
  Users,
  WalletCards,
  X,
  Database,
  CalendarDays,
  Monitor,
  Megaphone,
  BriefcaseBusiness,
} from "lucide-react";
import type { DashboardData } from "../../types/dashboard";
import OverviewView from "./views/OverviewView";
import LiveTripAlerts from "../../components/admin/LiveTripAlerts";
import ResourceView from "./views/ResourceView";
import ClientWebsiteWorkspace from "./clientwebsite";
import { defaultDashboardData } from "./data/defaultDashboardData";
import NotificationsView from "./views/NotificationsView";
import {
  fetchNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type AdminNotification,
  type AdminNotificationTarget,
} from "../../services/notification.service";
import {
  subscribeToTable,
  startAdminRealtime,
  type RealtimePayload,
} from "../../services/realtime.service";
import { usePendingRequestCount } from "../../components/admin/requestsStore";

export interface DashboardPageProps {
  data?: DashboardData;
  loading?: boolean;
  onNavigate?: (id: string) => void;
  onLogout?: () => void;
  onSearch?: (query: string) => void;
}

type ClientTab = "website-preview" | "trucks" | "announcements" | "careers";

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
      "requests",
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
  const pendingRequestCount = usePendingRequestCount();
  const [workspace, setWorkspace] =
    useState<WorkspaceName>("Operational Admin");
  const [clientTab, setClientTab] = useState<ClientTab>("website-preview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
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
    if (workspace === "Client Website") setClientTab("website-preview");
  }, [workspace]);

  useEffect(
    () => startAdminRealtime(accessToken, profile?.id, profile?.role),
    [accessToken, profile?.id, profile?.role],
  );

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
        const additional = [...receivedBeforeLoad.values()].filter(
          (item) => !apiIds.has(item.id),
        );
        const items = [...additional, ...result.notifications]
          .filter(
            (item, index, all) =>
              all.findIndex((candidate) => candidate.id === item.id) === index,
          )
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
        items.forEach((item) => seenNotificationIds.current.add(item.id));
        notificationItemsRef.current = items;
        setNotificationItems(items);
        setNotificationCount(
          result.unreadCount + additional.filter((item) => !item.read_at).length,
        );
        setNotificationError("");
      } catch (cause) {
        if (active)
          setNotificationError(
            cause instanceof Error
              ? cause.message
              : "Unable to load notifications.",
          );
      } finally {
        initialLoaded = true;
        loadInFlight = false;
        if (active) setNotificationLoading(false);
      }
    };
    notificationReload.current = () => void load();

    const onNotificationEvent = (event: RealtimePayload) => {
      if (event.eventType !== "INSERT") {
        const changedRecipient = event.new?.recipient_profile_id ?? event.old?.recipient_profile_id;
        if (changedRecipient === profile.id) void load();
        return;
      }
      if (
        !event.new ||
        event.new.recipient_profile_id !== profile.id
      )
        return;
      const row = event.new;
      if (
        typeof row.id !== "string" ||
        typeof row.created_at !== "string" ||
        typeof row.message !== "string"
      )
        return;
      const item: AdminNotification = {
        id: row.id,
        actor_profile_id:
          typeof row.actor_profile_id === "string" ? row.actor_profile_id : null,
        notification_type:
          typeof row.notification_type === "string" ? row.notification_type : "",
        reference_type:
          typeof row.reference_type === "string" ? row.reference_type : "",
        reference_id:
          typeof row.reference_id === "string" ? row.reference_id : "",
        message: row.message,
        metadata:
          row.metadata && typeof row.metadata === "object"
            ? (row.metadata as Record<string, unknown>)
            : {},
        read_at:
          typeof row.read_at === "string"
            ? row.read_at
            : notificationsReadAtById.current.get(row.id) ?? null,
        created_at: row.created_at,
      };
      if (seenNotificationIds.current.has(item.id)) return;
      seenNotificationIds.current.add(item.id);
      if (!initialLoaded) receivedBeforeLoad.set(item.id, item);
      const next = [
        item,
        ...notificationItemsRef.current.filter(
          (candidate) => candidate.id !== item.id,
        ),
      ].slice(0, 100);
      notificationItemsRef.current = next;
      setNotificationItems(next);
      if (initialLoaded && !item.read_at)
        setNotificationCount((count) => count + 1);
      setNewNotification(item);
    };

    const unsubscribe = subscribeToTable(
      "admin_notifications",
      onNotificationEvent,
      () => void load(),
    );
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
    const item = notificationItemsRef.current.find(
      (notification) => notification.id === id,
    );
    if (!item) return;
    if (!item.read_at) setNotificationCount((count) => Math.max(0, count - 1));
    const next = notificationItemsRef.current.map((notification) =>
      notification.id === id
        ? { ...notification, read_at: readAt }
        : notification,
    );
    notificationItemsRef.current = next;
    setNotificationItems(next);
  };

  const handleNotificationBellOpen = async () => {
    if (!accessToken || profile?.role !== "ADMIN") return;
    const optimisticReadAt = new Date().toISOString();
    const next = notificationItemsRef.current.map((item) =>
      item.read_at ? item : { ...item, read_at: optimisticReadAt },
    );
    notificationItemsRef.current = next;
    setNotificationItems(next);
    setNotificationCount(0);
    try {
      const result = await markAllNotificationsAsRead(accessToken);
      const readAtById = new Map(
        result.notifications.map((item) => [item.id, item.read_at]),
      );
      result.notifications.forEach((item) =>
        notificationsReadAtById.current.set(item.id, item.read_at),
      );
      let unreadArrivedBeforeRead = 0;
      const reconciled = notificationItemsRef.current.map((item) => {
        const readAt = readAtById.get(item.id);
        if (!readAt) return item;
        if (!item.read_at) unreadArrivedBeforeRead += 1;
        return { ...item, read_at: readAt };
      });
      notificationItemsRef.current = reconciled;
      setNotificationItems(reconciled);
      if (unreadArrivedBeforeRead)
        setNotificationCount((count) =>
          Math.max(0, count - unreadArrivedBeforeRead),
        );
      setNotificationError("");
    } catch (cause) {
      setNotificationError(
        cause instanceof Error
          ? cause.message
          : "Unable to mark notifications as read.",
      );
      notificationReload.current();
    }
  };

  const handleNotificationOpen = (item: AdminNotification) => {
    const validReports = [
      "combined",
      "dispatch-monitoring",
      "dispatch",
      "trip-booking",
      "store-calling",
    ] as const;
    const metadataReport = String(item.metadata?.report_key ?? "");
    const reportKey = validReports.includes(
      metadataReport as (typeof validReports)[number],
    )
      ? (metadataReport as (typeof validReports)[number])
      : item.reference_type === "store_call"
        ? "store-calling"
        : null;
    if (reportKey) {
      setNotificationTarget({
        notificationId: item.id,
        navigationKey: crypto.randomUUID(),
        reportKey,
        referenceType: item.reference_type,
        referenceId: item.reference_id,
        searchText:
          typeof item.metadata?.dispatch_number === "string"
            ? item.metadata.dispatch_number
            : undefined,
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
        setNotificationError(
          cause instanceof Error
            ? cause.message
            : "Unable to mark notification as read.",
        );
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
      {
        id: "requests",
        label: "Requests",
        icon: <Inbox className="h-4 w-4" />,
        badge: pendingRequestCount || undefined,
      },
      { id: "trips", label: "Trips", icon: <Truck className="h-4 w-4" /> },
      { id: "truckers", label: "Users", icon: <Users className="h-4 w-4" /> },
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
      ...(profile?.role === "ADMIN" || profile?.role === "STAFF"
        ? [
            {
              id: "database",
              label: "Database",
              icon: <Database className="h-4 w-4" />,
            },
          ]
        : []),
      {
        id: "calendar",
        label: "Calendar",
        icon: <CalendarDays className="h-4 w-4" />,
      },
    ],
    [pendingRequestCount, profile?.role],
  );

  const clientNavEntries: NavEntry[] = useMemo(
    () => [
      {
        id: "public-website",
        label: "Public website",
        children: [
          {
            id: "website-preview",
            label: "Website Preview",
            icon: <Monitor className="h-4 w-4" />,
          },
          { id: "trucks", label: "Trucks", icon: <Truck className="h-4 w-4" /> },
          {
            id: "announcements",
            label: "Announcements",
            icon: <Megaphone className="h-4 w-4" />,
          },
          {
            id: "careers",
            label: "Careers",
            icon: <BriefcaseBusiness className="h-4 w-4" />,
          },
        ],
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
    if (nextSection === "trips") setTripView("dispatches");
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

  const isClientWebsite = workspace === "Client Website";
  const showOverview = !isClientWebsite && (
    activeId === "overview" ||
    (activeId === "notifications" && profile?.role !== "ADMIN")
  );
  const currentNavEntries = isClientWebsite ? clientNavEntries : navEntries;
  const currentActiveId = isClientWebsite ? clientTab : activeId;

  return (
    <LiveTripAlerts key={profile?.id ?? "no-profile"} onOpenTrip={(tripId, stopId) => {
      setWorkspace("Operational Admin");
      setActiveId(`trip-detail:${tripId}:overview${stopId ? `:stop:${stopId}` : ""}`);
    }}>
    <div className="dotted-surface relative min-h-screen overflow-x-hidden text-slate-900">
      {profile?.role === "ADMIN" && newNotification && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-20 z-[90] w-[min(25rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-blue-200 shadow-xl"
        >
          <div className="flex items-start gap-3 p-3.5">
            <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" />
            <button
              type="button"
              onClick={() => void openToastNotification(newNotification)}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block text-xs font-semibold uppercase tracking-wide text-[#2678b9]">
                New notification
              </span>
              <span className="mt-1 block text-sm font-medium text-slate-800">
                {newNotification.message}
              </span>
            </button>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setNewNotification(null)}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div
        className={`relative z-10 pl-[5.5rem] pr-4 transition-[padding-left] duration-300 motion-reduce:transition-none ${
          sidebarCollapsed ? "" : "lg:pl-[17rem]"
        }`}
      >
        <SidebarNav
          entries={currentNavEntries}
          activeId={currentActiveId}
          onNavigate={
            isClientWebsite
              ? (id) => setClientTab(id as ClientTab)
              : handleNavigate
          }
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
          userRole={
            profile?.role === "ADMIN" && isClientWebsite
              ? "Website management"
              : profile?.role
          }
          userInitial={displayName.charAt(0).toUpperCase()}
          userPictureUrl={profile?.profile_picture_url}
          onCollapseChange={setSidebarCollapsed}
        />

        <main className="min-h-[calc(100vh-5.5rem)] w-full px-3 pb-6 pt-4 sm:px-5 lg:px-7">
          <div className="mx-auto min-h-[calc(100vh-7rem)] w-full max-w-[1680px] rounded-[1.75rem] p-4 sm:p-5 lg:p-6">
            <div
              hidden={!showOverview}
              className={showOverview ? "page-enter" : "hidden"}
            >
              <h1 className="sr-only">Operations overview</h1>
              <OverviewView
                key={profile?.id ?? "no-profile"}
                active={showOverview}
                onOpenTrip={(tripId) =>
                  setActiveId(`trip-detail:${tripId}:overview`)
                }
                onMetricNavigate={handleMetricNavigate}
              />
            </div>
            <div key={`${workspace}:${activeId}:${clientTab}`} className="page-enter" hidden={showOverview}>
              {isClientWebsite ? (
                <ClientWebsiteWorkspace
                  userName={displayName}
                  activeTab={clientTab}
                  onTabChange={setClientTab}
                  onWorkspaceChange={setWorkspace}
                  onLogout={() => setShowLogoutConfirm(true)}
                  notificationProps={{
                    onNotificationsClick: () => handleNavigate("notifications"),
                    onNotificationBellOpen: () =>
                      void handleNotificationBellOpen(),
                    onNotificationOpen: handleNotificationOpen,
                    notificationCount:
                      profile?.role === "ADMIN" ? notificationCount : 0,
                    canAccessNotifications: profile?.role === "ADMIN",
                    notificationItems,
                    notificationLoading,
                    notificationError,
                    onNotificationRetry: () => notificationReload.current(),
                    onNotificationRead: markNotificationReadLocally,
                  }}
                />
              ) : activeId === "overview" ? (
                null
              ) : activeId === "notifications" ? (
                profile?.role === "ADMIN" ? (
                  <NotificationsView
                    items={notificationItems}
                    loading={notificationLoading}
                    error={notificationError}
                    onRetry={() => notificationReload.current()}
                    onNotificationRead={markNotificationReadLocally}
                    onOpen={handleNotificationOpen}
                  />
                ) : null
              ) : activeId === "trips" ? (
                <ResourceView
                  id={tripView}
                  data={filteredData}
                  onNavigate={handleNavigate}
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
            </div>
          </div>
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
    </LiveTripAlerts>
  );
}
