import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {createPortal} from "react-dom";
import {
  Bell,
  CalendarDays,
  Download,
  FileSpreadsheet,
  Globe2,
  HelpCircle,
  LayoutGrid,
  LogOut,
  Menu,
  Plus,
  Pencil,
  Search,
  Settings,
  Table2,
  Trash2,
  UserCircle2,
  X,
} from "lucide-react";
import logo from "../../assets/logo.png";
import type { NavItem } from "../../types/dashboard";
import type { AdminNotification } from "../../services/notification.service";
import NotificationsDropdown from "./NotificationsDropdown";
import { usePageSection } from "./pageSection";
import { useTopbarSearch } from "./topbarSearch";
import { useTopbarView } from "./topbarView";
import TopbarFilterButton from "./TopbarFilterButton";
import TableViewers from "./TableViewers";
import {useSidebarPresence} from "./sidebarPresence";
import { useTopbarActions } from "./topbarActions";

export type WorkspaceName = "Operational Admin" | "Client Website";

export interface NavItemWithBadge extends NavItem {
  badge?: number;
}

export type NavEntry =
  | (NavItemWithBadge & { children?: undefined })
  | {
      id: string;
      label: string;
      icon?: ReactNode;
      badge?: number;
      children: NavItemWithBadge[];
    };

export type NavGroup = Extract<NavEntry, { children: NavItemWithBadge[] }>;

export interface SidebarNavProps {
  entries?: NavEntry[];
  groups?: NavGroup[];
  activeId: string;
  onNavigate: (id: string) => void;
  onLogout?: () => void;
  onSettingsClick?: () => void;
  onHelpClick?: () => void;
  onNotificationsClick?: () => void;
  onNotificationBellOpen?: () => void;
  onMarkAllNotificationsRead?: () => void;
  onNotificationOpen?: (item: AdminNotification) => void;
  notificationItems?: AdminNotification[];
  notificationLoading?: boolean;
  notificationError?: string;
  onNotificationRetry?: () => void;
  onNotificationRead?: (id: string, readAt: string) => void;
  notificationCount?: number;
  canAccessNotifications?: boolean;
  workspace?: WorkspaceName;
  canAccessClientWebsite?: boolean;
  onWorkspaceChange?: (workspace: WorkspaceName) => void;
  userName?: string;
  userRole?: string;
  userInitial?: string;
  userPictureUrl?: string | null;
}

const focusRing = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2343] focus-visible:ring-offset-2";
const iconButton = `relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${focusRing}`;

export default function SidebarNav({
  entries = [],
  activeId,
  onNavigate,
  onLogout = () => {},
  onSettingsClick,
  onHelpClick = () => {},
  onNotificationsClick = () => {},
  onNotificationBellOpen = () => {},
  onMarkAllNotificationsRead = () => {},
  onNotificationOpen = () => {},
  notificationItems = [],
  notificationLoading = false,
  notificationError = "",
  onNotificationRetry = () => {},
  onNotificationRead = () => {},
  notificationCount = 0,
  canAccessNotifications = false,
  workspace = "Operational Admin",
  canAccessClientWebsite = false,
  onWorkspaceChange = () => {},
  userName,
  userRole,
  userInitial,
  userPictureUrl,
}: SidebarNavProps) {
  const flatEntries = entries.flatMap((entry) => entry.children ?? [entry]);
  const hasCalendar = flatEntries.some((entry) => entry.id === "calendar");
  const navItems = flatEntries.filter((entry) => entry.id !== "calendar");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState<"sidebar" | "topbar">("topbar");
  const [profilePosition, setProfilePosition] = useState({ left: 80, bottom: 14 });
  const [notifPosition, setNotifPosition] = useState({ left: 80, top: 80 });
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [sidebarTooltip, setSidebarTooltip] = useState<{label:string;left:number;top:number;visible:boolean}|null>(null);
  const tooltipExitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const sidebarProfileRef = useRef<HTMLDivElement>(null);
  const topbarSearchRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => {
    if (tooltipExitTimer.current) clearTimeout(tooltipExitTimer.current);
  }, []);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!mobileNavRef.current?.contains(target)) setMobileNavOpen(false);
      if (!profileRef.current?.contains(target) && !sidebarProfileRef.current?.contains(target)) setProfileOpen(false);
      if (!notifRef.current?.contains(target)) setNotifOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileNavOpen(false);
      setProfileOpen(false);
      setNotifOpen(false);
      setSidebarTooltip(null);
    };
    const closeOnResize = () => { setProfileOpen(false); setNotifOpen(false); setSidebarTooltip(null); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnResize);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnResize);
    };
  }, []);

  const avatarLabel = userInitial ?? userName?.charAt(0)?.toUpperCase() ?? "A";
  const avatarContent = userPictureUrl && userPictureUrl !== failedAvatarUrl
    ? <img src={userPictureUrl} alt="" onError={() => setFailedAvatarUrl(userPictureUrl)} className="h-full w-full rounded-full object-cover" />
    : userName ? avatarLabel : <UserCircle2 className="h-5 w-5" />;

  const navigate = (id: string) => {
    if (tooltipExitTimer.current) clearTimeout(tooltipExitTimer.current);
    setSidebarTooltip(null);
    setMobileNavOpen(false);
    setNotifOpen(false);
    setProfileOpen(false);
    onNavigate(id);
  };
  const showSidebarTooltip = (label:string, element:HTMLElement) => {
    if (tooltipExitTimer.current) clearTimeout(tooltipExitTimer.current);
    const bounds=element.getBoundingClientRect();
    setSidebarTooltip({label,left:bounds.right+12,top:bounds.top+bounds.height/2,visible:true});
  };
  const hideSidebarTooltip = () => {
    if (tooltipExitTimer.current) clearTimeout(tooltipExitTimer.current);
    setSidebarTooltip(current => current ? {...current,visible:false} : null);
    tooltipExitTimer.current = setTimeout(() => setSidebarTooltip(null), 160);
  };
  const activeNavIndex = navItems.findIndex(entry => entry.id === activeId);
  const pageTitle = activeId.startsWith("trip-detail:") ? "Trip details"
    : activeId.startsWith("profile:") ? "Profile"
    : ({ settings: "Settings", pod: "POD & Documents", notifications: "Notifications", reports: "Reports" } as Record<string, string>)[activeId]
      ?? flatEntries.find((entry) => entry.id === activeId)?.label
      ?? "Workspace";
  const tripSection = usePageSection("trips");
  const databaseSection = usePageSection("database");
  const usersSection = usePageSection("truckers");
  const billingSection = usePageSection("billing");
  const pageSection = activeId === "trips" ? tripSection : activeId === "database" ? databaseSection : activeId === "truckers" ? usersSection : activeId === "billing" ? billingSection : "";
  const searchScope = activeId === "trips" ? `trips:${tripSection || "Master List"}`
    : activeId === "database" ? `database:${databaseSection || "Warehouses"}`
    : activeId === "truckers" ? `users:${usersSection || "Admin & Staff"}`
    : activeId === "billing" ? `billing:${billingSection || "Invoices"}` : activeId;
  const presenceTable = activeId === "trips" ? ({
    "Master List":"trips", "Dispatch Monitoring":"dispatch-monitoring", "Dispatch Report":"dispatch",
    "Trip Booking":"trip-booking", "Store Calling":"store-calling", "Transmittal Tracker":"transmittal-tracker",
  } as Record<string,string>)[tripSection || "Master List"]
    : activeId === "database" ? `master:${({"Warehouses":"warehouses","Trucks":"trucks","Trucking Companies":"trucking-companies","Stores":"stores","Store Contacts":"store-contacts","Products":"products"} as Record<string,string>)[databaseSection || "Warehouses"] ?? "warehouses"}`
    : activeId === "truckers" ? `users:${usersSection === "Truckers" ? "truckers" : "staff"}`
    : null;
  const visiblePresenceTable = useSidebarPresence() ?? presenceTable;
  const registeredSearch = useTopbarSearch(searchScope);
  const searchConfig = activeId === "overview" ? null : registeredSearch;
  const viewConfig = useTopbarView(searchScope);
  const topbarActions = useTopbarActions(searchScope);
  useEffect(() => {
    if (!searchConfig) return;
    const focusSearch = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k" || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      topbarSearchRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    };
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, [Boolean(searchConfig)]);

  const toggleNotifications = () => {
    const bellRight = notifRef.current?.getBoundingClientRect().right ?? window.innerWidth - 16;
    const rightInset = Math.max(16, window.innerWidth - bellRight);
    const width = Math.min(380, window.innerWidth - rightInset * 2);
    const headerBottom = document.querySelector(".al-topbar")?.getBoundingClientRect().bottom ?? 60;
    setNotifPosition({ left: window.innerWidth - width - rightInset, top: headerBottom + 4 });
    setProfileOpen(false);
    setMobileNavOpen(false);
    if (!notifOpen) onNotificationBellOpen();
    setNotifOpen(!notifOpen);
  };
  const toggleProfile = (anchor: "sidebar" | "topbar") => {
    if (anchor === "sidebar") {
      const rect = sidebarProfileRef.current?.getBoundingClientRect();
      if (rect) setProfilePosition({ left: Math.max(84, rect.right + 12), bottom: Math.max(12, window.innerHeight - rect.bottom) });
    }
    setNotifOpen(false);
    setMobileNavOpen(false);
    setProfileAnchor(anchor);
    setProfileOpen(!(profileOpen && profileAnchor === anchor));
  };
  const renderNotifications = () => notifOpen ? (
    <NotificationsDropdown items={notificationItems} loading={notificationLoading} error={notificationError}
      placement={notifPosition}
      onRetry={onNotificationRetry} onNotificationRead={onNotificationRead}
      onMarkAllRead={onMarkAllNotificationsRead}
      onOpenItem={(item) => { setNotifOpen(false); onNotificationOpen(item); }}
      onViewAll={() => { setNotifOpen(false); onNotificationsClick(); }}
    />
  ) : null;
  const renderProfileMenu = (anchor: "sidebar" | "topbar") => profileOpen && profileAnchor === anchor ? (
    <div role="menu" style={anchor === "sidebar" ? profilePosition : undefined} className={`${anchor === "sidebar" ? "fixed z-[1200]" : "absolute right-0 top-full z-50 mt-3"} w-60 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg`}>
      <div className="border-b border-slate-100 px-3 py-2.5">
        <span className="block truncate text-sm font-semibold text-[#0b2341]">{userName ?? "Profile"}</span>
        {userRole && <span className="block truncate text-xs text-slate-500">{userRole}</span>}
      </div>
      <button type="button" role="menuitem" onClick={() => navigate("profile")} className={`mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 ${focusRing}`}><UserCircle2 className="h-4 w-4" />My Profile</button>
      <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); onSettingsClick ? onSettingsClick() : navigate("settings"); }} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 ${focusRing}`}><Settings className="h-4 w-4" />Settings</button>
      {canAccessClientWebsite && <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); onWorkspaceChange(workspace === "Client Website" ? "Operational Admin" : "Client Website"); }} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 ${focusRing}`}><Globe2 className="h-4 w-4" />{workspace === "Client Website" ? "Operational Admin" : "Client Website"}</button>}
      <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); onHelpClick(); }} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 ${focusRing}`}><HelpCircle className="h-4 w-4" />Help</button>
    </div>
  ) : null;

  return (
    <>
    <aside className="al-sidebar" aria-label="Primary navigation" onScroll={() => setSidebarTooltip(null)}>
      <div className="al-sidebar-brand"><img src={logo} alt="ALZHEN TMS" /></div>
      <nav aria-label="Primary" className="al-sidebar-group" data-has-active={activeNavIndex >= 0} style={{"--al-active-index": Math.max(activeNavIndex, 0)} as CSSProperties}>
        {navItems.map((entry) => <button key={entry.id} type="button" onClick={() => navigate(entry.id)} onMouseEnter={event => showSidebarTooltip(entry.label,event.currentTarget)} onMouseLeave={hideSidebarTooltip} onFocus={event => showSidebarTooltip(entry.label,event.currentTarget)} onBlur={hideSidebarTooltip} aria-describedby={sidebarTooltip?.visible && sidebarTooltip.label===entry.label?"al-sidebar-tooltip":undefined} aria-current={entry.id === activeId ? "page" : undefined} aria-label={entry.label} className={`al-sidebar-item ${entry.id === activeId ? "al-sidebar-item-active" : ""}`}><span>{entry.icon}</span>{!!entry.badge && <span className="al-sidebar-badge">{entry.badge}</span>}</button>)}
      </nav>

      <div className="al-sidebar-profile">
        <div ref={sidebarProfileRef} className="relative">
          <button type="button" aria-label="User menu" aria-describedby={sidebarTooltip?.visible && sidebarTooltip.label==="Profile"?"al-sidebar-tooltip":undefined} aria-expanded={profileOpen} aria-haspopup="menu" onMouseEnter={event => showSidebarTooltip("Profile",event.currentTarget)} onMouseLeave={hideSidebarTooltip} onFocus={event => showSidebarTooltip("Profile",event.currentTarget)} onBlur={hideSidebarTooltip} onClick={() => { setSidebarTooltip(null); toggleProfile("sidebar"); }} className={focusRing}><span className="al-profile-avatar flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[#0b2341] text-xs font-semibold text-white">{avatarContent}</span></button>
          {renderProfileMenu("sidebar")}
        </div>
        <button type="button" aria-label="Logout" aria-describedby={sidebarTooltip?.visible && sidebarTooltip.label==="Logout"?"al-sidebar-tooltip":undefined} onMouseEnter={event => showSidebarTooltip("Logout",event.currentTarget)} onMouseLeave={hideSidebarTooltip} onFocus={event => showSidebarTooltip("Logout",event.currentTarget)} onBlur={hideSidebarTooltip} onClick={() => { setSidebarTooltip(null); setProfileOpen(false); onLogout(); }} className={`al-sidebar-logout ${focusRing}`}><LogOut aria-hidden="true" size={18}/></button>
      </div>
    </aside>
    <header aria-label="Application header" className="al-topbar">
      <div className="grid h-full w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3">
        <div className="al-topbar-leading">
          <nav className="al-breadcrumb" aria-label="Current page">
            <span className="al-page-title">{pageTitle}</span>
            {pageSection && <><span className="al-breadcrumb-separator" aria-hidden="true">/</span><span className="al-breadcrumb-section" aria-current="page">{pageSection}</span></>}
          </nav>
        </div>

        <div ref={topbarSearchRef} className="al-topbar-center">
          {(topbarActions?.edit || topbarActions?.delete) && <div role="group" aria-label="Selected row actions" className="al-topbar-selection-actions">
            {topbarActions.edit && <button type="button" className="al-topbar-selection-action" title={topbarActions.edit.label} aria-label={topbarActions.edit.label} disabled={topbarActions.edit.disabled} onClick={topbarActions.edit.onClick}><Pencil aria-hidden="true" size={16}/></button>}
            {topbarActions.delete && <button type="button" className="al-topbar-selection-action al-topbar-selection-delete" title={topbarActions.delete.label} aria-label={topbarActions.delete.label} disabled={topbarActions.delete.disabled} onClick={topbarActions.delete.onClick}><Trash2 aria-hidden="true" size={16}/></button>}
          </div>}
          {visiblePresenceTable && <div className="al-toolbar-viewers" aria-label="People viewing this table"><TableViewers key={visiblePresenceTable} table={visiblePresenceTable} toolbar/></div>}
          {searchConfig?.kind === "field" && <div className="al-quick-search" data-search-scope={searchScope}>
            <Search aria-hidden="true" className="h-4 w-4 shrink-0" />
            <input type="search" aria-label={searchConfig.label} placeholder={searchConfig.placeholder} value={searchConfig.value} disabled={searchConfig.disabled} onChange={event => searchConfig.onChange(event.target.value)} />
            {searchConfig.value && <button type="button" aria-label="Clear search" onClick={() => searchConfig.onChange("")} className="rounded-full p-1 text-slate-500 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>}
            <TopbarFilterButton scope={searchScope}/>
          </div>}
          {searchConfig?.kind === "custom" && <div key={searchScope} className="al-topbar-search-custom">{searchConfig.content}</div>}
          {viewConfig && <div role="group" aria-label="Display mode" className="al-topbar-view-toggle">
            <button type="button" title={viewConfig.gridLabel ?? "Grid view"} aria-label={viewConfig.gridLabel ?? "Grid view"} aria-pressed={viewConfig.value === "grid"} onClick={() => viewConfig.onChange("grid")}><LayoutGrid aria-hidden="true" size={16}/></button>
            <button type="button" title={viewConfig.tableLabel ?? "Table view"} aria-label={viewConfig.tableLabel ?? "Table view"} aria-pressed={viewConfig.value === "table"} onClick={() => viewConfig.onChange("table")}><Table2 aria-hidden="true" size={16}/></button>
          </div>}
          {topbarActions?.prepare && <button type="button" className="al-topbar-primary-action" title={topbarActions.prepare.label} aria-label={topbarActions.prepare.label} disabled={topbarActions.prepare.disabled} onClick={topbarActions.prepare.onClick}><FileSpreadsheet aria-hidden="true" size={16}/><span>{topbarActions.prepare.label}</span></button>}
          {topbarActions?.export && <button type="button" className="al-topbar-primary-action" title={topbarActions.export.label} aria-label={topbarActions.export.label} disabled={topbarActions.export.disabled} onClick={topbarActions.export.onClick}><Download aria-hidden="true" size={16}/><span>{topbarActions.export.label}</span></button>}
          {topbarActions?.add && <button type="button" className="al-topbar-primary-action" title={topbarActions.add.label} aria-label={topbarActions.add.label} disabled={topbarActions.add.disabled} onClick={topbarActions.add.onClick}><Plus aria-hidden="true" size={17}/><span>{topbarActions.add.label}</span></button>}
        </div>
        <div ref={mobileNavRef} className="relative justify-self-center lg:hidden">
          <button type="button" aria-label="Navigation" aria-expanded={mobileNavOpen} aria-haspopup="menu"
            onClick={() => setMobileNavOpen((value) => !value)}
            className={`${iconButton} text-[#0b2341] hover:bg-slate-100`}>
            {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          {mobileNavOpen && (
            <nav aria-label="Primary" className="absolute left-1/2 top-full z-50 mt-3 w-56 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg">
              {navItems.map((entry) => (
                <button key={entry.id} type="button" aria-current={entry.id === activeId ? "page" : undefined}
                  onClick={() => navigate(entry.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${focusRing} ${entry.id === activeId ? "bg-[#0b2341] font-semibold text-white" : "text-slate-700 hover:bg-slate-100"}`}>
                  <span className="[&>svg]:h-[18px] [&>svg]:w-[18px]">{entry.icon}</span>
                  <span className="flex-1">{entry.label}</span>
                  {!!entry.badge && <span className="rounded-full bg-rose-500 px-1.5 text-xs font-semibold text-white">{entry.badge}</span>}
                </button>
              ))}
              <button type="button" onClick={() => { setMobileNavOpen(false); onLogout(); }} className={`mt-1 flex w-full items-center gap-3 border-t border-slate-100 px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 ${focusRing}`}><LogOut aria-hidden="true" className="h-[18px] w-[18px]" />Logout</button>
            </nav>
          )}
        </div>

        <div className="al-topbar-actions flex min-w-0 items-center justify-self-end gap-1 sm:gap-2">
          {hasCalendar && (
            <button type="button" onClick={() => navigate("calendar")} aria-label="Calendar" title="Calendar"
              aria-current={activeId === "calendar" ? "page" : undefined}
              className={`al-topbar-mobile-only ${iconButton} ${activeId === "calendar" ? "bg-[#0b2341] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              <CalendarDays className="h-[19px] w-[19px] stroke-[1.7]" />
            </button>
          )}
          {canAccessNotifications && (
            <div ref={notifRef} className="relative">
              <button type="button" aria-expanded={notifOpen} aria-haspopup="dialog"
                aria-label={notificationCount ? `Notifications, ${notificationCount} unread` : "Notifications"}
                title="Notifications"
                onClick={toggleNotifications}
                className={`${iconButton} text-slate-600 hover:bg-slate-100`}>
                <Bell className="h-[19px] w-[19px] stroke-[1.7]" />
                {notificationCount > 0 && <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">{notificationCount > 99 ? "99+" : notificationCount}</span>}
              </button>
              {renderNotifications()}
            </div>
          )}
          <div ref={profileRef} className="al-topbar-mobile-only relative">
            <button type="button" aria-label="User menu" aria-expanded={profileOpen} aria-haspopup="menu"
              onClick={() => toggleProfile("topbar")}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-slate-100 ${focusRing}`}>
              <span className="al-profile-avatar flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[#0b2341] text-xs font-semibold text-white">
                {avatarContent}
              </span>
            </button>
            {renderProfileMenu("topbar")}
          </div>
        </div>
      </div>
    </header>
    {sidebarTooltip && createPortal(<div id="al-sidebar-tooltip" role="tooltip" className="al-sidebar-tooltip" data-visible={sidebarTooltip.visible} style={{left:sidebarTooltip.left,top:sidebarTooltip.top}}>{sidebarTooltip.label}</div>,document.body)}
    </>
  );
}
