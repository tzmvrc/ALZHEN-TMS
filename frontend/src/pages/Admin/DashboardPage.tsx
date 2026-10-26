import {workspaceReportFromLocation} from "../../services/trips-workspace";
import {fetchUserProfile} from "../../services/user-workspace.service";
import { apiGet,invalidateApiCache,type ApiResponse } from "../../services/api.service";
import {useNavigate,useParams,useSearchParams,useLocation} from "react-router-dom";
// src/pages/Admin/DashboardPage.tsx
import { lazy, Suspense, useCallback,useEffect, useMemo, useRef, useState } from "react";
import SidebarNav, {
  type NavEntry,
  type WorkspaceName,
} from "../../components/admin/SidebarNav";
import RouteLoading from "../../components/RouteLoading";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { useAuth } from "../../context/AuthContext";
import {
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
const UserProfilePage = lazy(() => import("./views/UserProfilePage"));
const OverviewView = lazy(() => import("./views/OverviewView"));
import RequestReviewModal from "../../components/admin/RequestDetail";
import LiveTripPingsProvider from "../../components/admin/LiveTripPingsProvider";
import DriverUpdateToast from "../../components/admin/DriverUpdateToast";
const ResourceView = lazy(() => import("./views/ResourceView"));
const BillingView = lazy(() => import("./views/BillingView"));
const ClientWebsiteWorkspace = lazy(() => import("./clientwebsite"));
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
  subscribeToAdminRealtime,
  subscribeToTable,
  startAdminRealtime,
  type RealtimePayload,
} from "../../services/realtime.service";
import { usePendingRequestCount } from "../../components/admin/requestsStore";
import RetainedFeature from "../../components/admin/RetainedFeature";
import {preloadAdminPageData} from "../../services/admin-preload.service";

export interface DashboardPageProps {
  data?: DashboardData;
  loading?: boolean;
  onNavigate?: (id: string) => void;
  onLogout?: () => void;
  onSearch?: (query: string) => void;
}

type ClientTab = "website-preview" | "trucks" | "announcements" | "careers";

const normalizeMainSection = (value: string) => {
  if(value.startsWith("trip-detail:")||value==="profile"||value.startsWith("profile:"))return value;
  if(["reports","offloads","offload-reports","operations-reports","backloads"].includes(value))return "trips";
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
    return "trips";
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

const noopNavigate=()=>{};
export default function DashboardPage({
  data = defaultDashboardData,
  loading = false,
  onNavigate = noopNavigate,
  onLogout,
}: DashboardPageProps) {
  const { logout, profile, user, accessToken } = useAuth();
  const [personalProfile,setPersonalProfile]=useState<{id:string;first_name?:string;last_name?:string;profile_picture_url?:string|null}|null>(null);
  useEffect(()=>{
    if(!accessToken||!profile?.id)return;let live=true;let timer:ReturnType<typeof setTimeout>|undefined;
    const refresh=()=>{if(timer)return;timer=setTimeout(()=>{timer=undefined;invalidateApiCache(`/users/${profile.id}/profile`);void fetchUserProfile(accessToken,profile.id).then(value=>{if(live)setPersonalProfile(value);}).catch(()=>{});},200);};
    const stop=subscribeToAdminRealtime(event=>{if(event.kind==="resume"||event.kind==="batch"&&event.tables.includes("profiles")||event.kind==="change"&&event.payload.table==="profiles"&&(event.payload.new?.id===profile.id||event.payload.old?.id===profile.id))refresh();});
    const local=(event:Event)=>{const value=(event as CustomEvent).detail;if(value?.id===profile.id)setPersonalProfile(current=>({...current,...value}));};window.addEventListener("alzhen:profile-updated",local);
    return()=>{live=false;clearTimeout(timer);stop();window.removeEventListener("alzhen:profile-updated",local);};
  },[accessToken,profile?.id]);
  const displayName =
    [personalProfile?.id===profile?.id?personalProfile?.first_name??profile?.first_name:profile?.first_name, personalProfile?.id===profile?.id?personalProfile?.last_name??profile?.last_name:profile?.last_name].filter(Boolean).join(" ") ||
    user?.email ||
    data.user.name;
  const pendingRequestCount = usePendingRequestCount();
  const [workspace, setWorkspace] =
    useState<WorkspaceName>("Operational Admin");
  const [clientTab, setClientTab] = useState<ClientTab>("website-preview");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const location=useLocation();
  const requestedSheet=workspaceReportFromLocation(location.pathname,location.search);
  const [localActiveId, setLocalActiveId] = useState(() =>
    requestedSheet ? "trips" : new URLSearchParams(location.search).get("database") === "trucks" ? "database" : normalizeMainSection(data.nav.activeId),
  );
  const route=useParams<{tripId:string;userId:string}>(),navigate=useNavigate(),[routeQuery]=useSearchParams();
  const activeId=location.pathname==="/settings"?"settings":location.pathname==="/profile"||route.userId?`profile:${route.userId??profile?.id??""}`:route.tripId?`trip-detail:${route.tripId}:dispatches${routeQuery.get("stop")?`:stop:${routeQuery.get("stop")}`:""}`:localActiveId;
  const setActiveId=useCallback((next:string)=>{
    if(next==="settings"){navigate("/settings");return;}
    if(next==="profile"||next.startsWith("profile:")){navigate(next==="profile"?"/profile":`/users/${encodeURIComponent(next.slice(8))}`);return;}
    if(next.startsWith("trip-detail:")){const [,trip,,scope,stop]=next.split(":");navigate(`/trips/${encodeURIComponent(trip)}${scope==="stop"&&stop?`?stop=${encodeURIComponent(stop)}`:""}`);}
    else {setLocalActiveId(next);if(route.tripId||location.pathname!=="/")navigate("/");}
  },[navigate,route.tripId,location.pathname]);
  const [reportView, setReportView] = useState<
    | "combined"
    | "dispatch-monitoring"
    | "dispatch"
    | "trip-booking"
    | "store-calling"
  >(requestedSheet ?? (["combined","dispatch-monitoring","dispatch","trip-booking","store-calling"].includes(data.nav.activeId) ? data.nav.activeId as "combined"|"dispatch-monitoring"|"dispatch"|"trip-booking"|"store-calling" : "combined"));
  const [seenRequestedSheet,setSeenRequestedSheet]=useState(requestedSheet);
  if(seenRequestedSheet!==requestedSheet){setSeenRequestedSheet(requestedSheet);if(requestedSheet){setReportView(requestedSheet);setLocalActiveId("trips");}}
  useEffect(()=>{
    if(!accessToken||!profile)return;
    // Trips owns one paced sheet queue; do not start a second report queue here.
    if(activeId==="truckers")void preloadAdminPageData(accessToken,profile.role,"users");
  },[accessToken,profile,activeId,reportView]);
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
    const notificationProfileId = profile?.id;
    if (!(["ADMIN", "STAFF"] as unknown[]).includes(profile?.role) || !accessToken || !notificationProfileId) {
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
    if (notificationOwner.current !== notificationProfileId) {
      notificationOwner.current = notificationProfileId;
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
        if (changedRecipient === notificationProfileId) void load();
        return;
      }
      if (
        !event.new ||
        event.new.recipient_profile_id !== notificationProfileId
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
      if (!item.metadata?.recovered && !item.read_at) setNewNotification(item);
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
    if (!accessToken || !(["ADMIN", "STAFF"] as unknown[]).includes(profile?.role)) return;
    notificationReload.current();
  };

  const handleMarkAllNotificationsRead = async () => {
    if (!accessToken || !(["ADMIN", "STAFF"] as unknown[]).includes(profile?.role)) return;
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

  const handleNotificationOpen = async (item: AdminNotification) => {
    if (item.metadata?.event_kind === "driver_update") {
      const stopId = typeof item.metadata.stop_id === "string" ? item.metadata.stop_id : null;
      const params = new URLSearchParams();
      if (stopId) params.set("stop", stopId);
      if (item.metadata.source === "trip_events" && typeof item.metadata.source_id === "string") params.set("event", item.metadata.source_id);
      if (typeof item.metadata.assignment_id === "string") params.set("assignment", item.metadata.assignment_id);
      setNotificationTarget(null); setWorkspace("Operational Admin");
      navigate(`/trips/${encodeURIComponent(item.reference_id)}${params.size ? `?${params}` : ""}`);
      return;
    }
    const source=String(item.reference_type??"").replace(/s$/i,"").toUpperCase();
    if(["OFFLOAD","BACKLOAD","DEMURRAGE","INCIDENT"].includes(source)&&accessToken){
      try{
        const response=await apiGet<ApiResponse<{trip_id:string;trip_stop_id:string|null}>>(`/reports/trip-issues/${source}/${encodeURIComponent(item.reference_id)}`,accessToken);
        if(!response.success||!response.data)return;
        const target=`trip-detail:${response.data.trip_id}:dispatches${response.data.trip_stop_id?`:stop:${response.data.trip_stop_id}`:""}`;
        setNotificationTarget(null);setActiveId(target);onNavigate(target);return;
      }catch{setActiveId("trips");setReportView("combined");onNavigate("trips");return;}
    }
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
      setActiveId("trips");
      onNavigate("trips");
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

  const handleNavigate = useCallback((id: string) => {
    const nextSection = normalizeMainSection(id);
    if (nextSection === "notifications" && !(["ADMIN", "STAFF"] as unknown[]).includes(profile?.role)) return;
    if (["combined","dispatch-monitoring","dispatch","trip-booking","store-calling"].includes(id)) setReportView(id as typeof reportView);
    else if (id === "reports") setReportView("combined");
    setActiveId(nextSection);
    onNavigate(nextSection);
  },[profile?.role,setActiveId,onNavigate]);

  const handleMetricNavigate = (id: string) => {
    const nextSection = normalizeMainSection(id);
    if (id === "dispatches") setReportView("combined");
    if (id === "monitoring") setReportView("dispatch-monitoring");
    if (id === "combined") setReportView("combined");
    if (id === "dispatch-monitoring") setReportView("dispatch-monitoring");
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
    return <RouteLoading />;
  }

  const isClientWebsite = workspace === "Client Website";
  const showOverview = !isClientWebsite && (
    activeId === "overview" ||
    (activeId === "notifications" && !(["ADMIN", "STAFF"] as unknown[]).includes(profile?.role))
  );
  const currentNavEntries = isClientWebsite ? clientNavEntries : navEntries;
  const currentActiveId = isClientWebsite ? clientTab : activeId;

  return (
    <LiveTripPingsProvider>
    <div className="al-workspace relative min-h-screen overflow-x-hidden text-slate-900">
      <RequestReviewModal/>
      {(["ADMIN", "STAFF"] as unknown[]).includes(profile?.role) && newNotification && (
        newNotification.metadata?.event_kind === "driver_update" ? (
          <DriverUpdateToast
            item={newNotification}
            onOpen={() => void openToastNotification(newNotification)}
            onDismiss={() => setNewNotification(null)}
          />
        ) : (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-20 z-[90] w-[min(25rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-blue-200 bg-white shadow-xl"
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
        )
      )}

      <div data-delivery-workspace={route.tripId?true:undefined} className="al-workspace-grid relative z-10 w-full">
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
          onMarkAllNotificationsRead={() => void handleMarkAllNotificationsRead()}
          onNotificationOpen={handleNotificationOpen}
          notificationCount={(["ADMIN", "STAFF"] as unknown[]).includes(profile?.role) ? notificationCount : 0}
          canAccessNotifications={(["ADMIN", "STAFF"] as unknown[]).includes(profile?.role)}
          notificationItems={notificationItems}
          notificationLoading={notificationLoading}
          notificationError={notificationError}
          onNotificationRetry={() => notificationReload.current()}
          onNotificationRead={markNotificationReadLocally}
          workspace={workspace}
          canAccessClientWebsite={profile?.role === "ADMIN" || profile?.role === "STAFF"}
          onWorkspaceChange={setWorkspace}
          userName={displayName}
          userRole={
            profile?.role === "ADMIN" && isClientWebsite
              ? "Website management"
              : profile?.role
          }
          userInitial={displayName.charAt(0).toUpperCase()}
          userPictureUrl={personalProfile && personalProfile.id===profile?.id?personalProfile.profile_picture_url:profile?.profile_picture_url}
        />

        <main className="al-workspace-main w-full min-w-0">
          <Suspense fallback={<div role="status" aria-label="Opening page" className="min-h-40 animate-pulse bg-slate-50" />}><div className="w-full min-w-0">
            <RetainedFeature key={`home:${profile?.id}:${profile?.role}`} active={showOverview}><div
              className={showOverview ? "page-enter" : "hidden"}
            >
              <OverviewView
                key={profile?.id ?? "no-profile"}
                active={showOverview}
                onOpenTrip={(tripId) =>
                  setActiveId(`trip-detail:${tripId}:overview`)
                }
                onMetricNavigate={handleMetricNavigate}
              />
            </div></RetainedFeature>
            <RetainedFeature key={`trips:${profile?.id}:${profile?.role}`} active={!isClientWebsite&&activeId==="trips"}><ResourceView id="dispatches" workspaceReport={reportView} data={filteredData} onNavigate={handleNavigate} notificationTarget={notificationTarget} onReportScopeChange={setReportView}/></RetainedFeature>
            <RetainedFeature key={`billing:${profile?.id}:${profile?.role}`} active={!isClientWebsite&&activeId==="billing"}><BillingView/></RetainedFeature>
            <RetainedFeature key={`database:${profile?.id}:${profile?.role}`} active={!isClientWebsite&&activeId==="database"}><ResourceView id="database" data={filteredData} onNavigate={handleNavigate}/></RetainedFeature>
            <RetainedFeature key={`users:${profile?.id}:${profile?.role}`} active={!isClientWebsite&&activeId==="truckers"}><ResourceView id="truckers" data={filteredData} onNavigate={handleNavigate}/></RetainedFeature>
            <div key={`${workspace}:${activeId.startsWith("trip-detail:")?`trip-detail:${activeId.split(":")[1]}`:activeId}:${clientTab}`} className="page-enter" hidden={showOverview}>
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
                      (["ADMIN", "STAFF"] as unknown[]).includes(profile?.role) ? notificationCount : 0,
                    canAccessNotifications: (["ADMIN", "STAFF"] as unknown[]).includes(profile?.role),
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
                (["ADMIN", "STAFF"] as unknown[]).includes(profile?.role) ? (
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
                null
              ) : activeId.startsWith("profile:") ? (<UserProfilePage key={activeId} userId={activeId.slice(8)} />) : activeId === "truckers" || activeId === "database" ? (
                null
              ) : activeId === "pod" ? (
                <ResourceView
                  id="pod"
                  data={filteredData}
                  onNavigate={handleNavigate}
                />
              ) : activeId === "reports" ? (
                null
              ) : activeId === "billing" ? (
                null
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
          </Suspense>
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
    </LiveTripPingsProvider>
  );
}
