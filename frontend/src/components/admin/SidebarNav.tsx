import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  HelpCircle,
  LogOut,
  Menu,
  Settings,
  UserCircle2,
  X,
} from "lucide-react";
import logo from "../../assets/logo.png";
import type { NavItem } from "../../types/dashboard";
import type { AdminNotification } from "../../services/notification.service";
import NotificationsDropdown from "./NotificationsDropdown";

export type WorkspaceName = "Operational Admin" | "Client Website";

export function WorkspaceSwitcher({
  workspace,
  onChange,
}: {
  workspace: WorkspaceName;
  onChange: (workspace: WorkspaceName) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-11 items-center gap-2 rounded-lg px-1 text-left text-sm font-semibold text-[#0b2341] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]"
      >
        <img src={logo} alt="" className="h-7 w-7 rounded-full object-cover" />
        <span>{workspace}</span>
        <ChevronDown className="h-4 w-4 text-slate-500" />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-2 min-w-52 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg">
          {(["Operational Admin", "Client Website"] as WorkspaceName[]).map((option) => (
            <button key={option} type="button" role="menuitemradio" aria-checked={workspace === option}
              onClick={() => { onChange(option); setOpen(false); }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]"
            >
              {option}{workspace === option && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  onWorkspaceChange?: (workspace: WorkspaceName) => void;
  userName?: string;
  userRole?: string;
  userInitial?: string;
  userPictureUrl?: string | null;
}

const focusRing = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] focus-visible:ring-offset-2";
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
  onWorkspaceChange = () => {},
  userName,
  userRole,
  userInitial,
  userPictureUrl,
}: SidebarNavProps) {
  const flatEntries = entries.flatMap((entry) => entry.children ?? [entry]);
  const hasCalendar = flatEntries.some((entry) => entry.id === "calendar");
  const navItems = flatEntries.filter((entry) => entry.id !== "calendar");
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!workspaceRef.current?.contains(target)) setWorkspaceOpen(false);
      if (!mobileNavRef.current?.contains(target)) setMobileNavOpen(false);
      if (!profileRef.current?.contains(target)) setProfileOpen(false);
      if (!notifRef.current?.contains(target)) setNotifOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setWorkspaceOpen(false);
      setMobileNavOpen(false);
      setProfileOpen(false);
      setNotifOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const avatarLabel = userInitial ?? userName?.charAt(0)?.toUpperCase() ?? "A";
  const avatarContent = userPictureUrl && userPictureUrl !== failedAvatarUrl
    ? <img src={userPictureUrl} alt="" onError={() => setFailedAvatarUrl(userPictureUrl)} className="h-full w-full rounded-full object-cover" />
    : userName ? avatarLabel : <UserCircle2 className="h-5 w-5" />;

  const navigate = (id: string) => {
    setMobileNavOpen(false);
    setWorkspaceOpen(false);
    setNotifOpen(false);
    setProfileOpen(false);
    onNavigate(id);
  };

  return (
    <header aria-label="Application header" className="fixed inset-x-4 top-3 z-[1101] h-14 rounded-full border border-white/80 bg-white/95 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.12)] backdrop-blur-lg sm:inset-x-6">
      <div className="grid h-full w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-2 sm:px-3">
        <div ref={workspaceRef} className="relative flex min-w-0 justify-self-start">
          <button type="button" onClick={() => setWorkspaceOpen((value) => !value)}
            aria-expanded={workspaceOpen} aria-haspopup="menu" aria-label={`ALZHEN TMS, switch workspace. Current: ${workspace}`}
            className={`flex h-11 min-w-0 items-center gap-2 rounded-full pr-2 text-[#0b2341] ${focusRing}`}>
            <img src={logo} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
            <span className="hidden truncate text-sm font-bold tracking-tight sm:inline">ALZHEN TMS</span>
            <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-slate-500 sm:block" />
          </button>
          {workspaceOpen && (
            <div role="menu" aria-label="Switch workspace" className="absolute left-0 top-full z-50 mt-2 min-w-52 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg">
              {(["Operational Admin", "Client Website"] as WorkspaceName[]).map((option) => (
                <button key={option} type="button" role="menuitemradio" aria-checked={workspace === option}
                  onClick={() => { onWorkspaceChange(option); setWorkspaceOpen(false); }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 ${focusRing} ${workspace === option ? "font-semibold text-[#0b2341]" : "text-slate-600"}`}>
                  {option}{workspace === option && <Check className="h-4 w-4" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <nav aria-label="Primary" className="hidden items-center justify-center gap-3 xl:gap-4 lg:flex">
          {navItems.map((entry) => {
            const active = entry.id === activeId;
            return (
              <button key={entry.id} type="button" onClick={() => navigate(entry.id)}
                aria-current={active ? "page" : undefined} aria-label={entry.label} title={entry.label}
                className={`${iconButton} ${active ? "bg-[#0b2341] text-white" : "text-slate-500 hover:bg-slate-100 hover:text-[#0b2341]"}`}>
                <span className="[&>svg]:h-[19px] [&>svg]:w-[19px] [&>svg]:stroke-[1.7]">{entry.icon}</span>
                {!!entry.badge && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">{entry.badge}</span>}
              </button>
            );
          })}
        </nav>
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
            </nav>
          )}
        </div>

        <div className="flex min-w-0 items-center justify-self-end gap-1 sm:gap-2">
          {hasCalendar && (
            <button type="button" onClick={() => navigate("calendar")} aria-label="Calendar" title="Calendar"
              aria-current={activeId === "calendar" ? "page" : undefined}
              className={`${iconButton} ${activeId === "calendar" ? "bg-[#0b2341] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              <CalendarDays className="h-[19px] w-[19px] stroke-[1.7]" />
            </button>
          )}
          {canAccessNotifications && (
            <div ref={notifRef} className="relative">
              <button type="button" aria-expanded={notifOpen} aria-haspopup="dialog"
                aria-label={notificationCount ? `Notifications, ${notificationCount} unread` : "Notifications"}
                title="Notifications"
                onClick={() => {
                  setProfileOpen(false);
                  setMobileNavOpen(false);
                  if (!notifOpen) onNotificationBellOpen();
                  setNotifOpen((value) => !value);
                }}
                className={`${iconButton} text-slate-600 hover:bg-slate-100`}>
                <Bell className="h-[19px] w-[19px] stroke-[1.7]" />
                {notificationCount > 0 && <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">{notificationCount > 99 ? "99+" : notificationCount}</span>}
              </button>
              {notifOpen && (
                <NotificationsDropdown items={notificationItems} loading={notificationLoading} error={notificationError}
                  onRetry={onNotificationRetry} onNotificationRead={onNotificationRead}
                  onMarkAllRead={onMarkAllNotificationsRead}
                  onOpenItem={(item) => { setNotifOpen(false); onNotificationOpen(item); }}
                  onViewAll={() => { setNotifOpen(false); onNotificationsClick(); }}
                />
              )}
            </div>
          )}
          <div ref={profileRef} className="relative">
            <button type="button" aria-label="User menu" aria-expanded={profileOpen} aria-haspopup="menu"
              onClick={() => { setNotifOpen(false); setMobileNavOpen(false); setProfileOpen((value) => !value); }}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-slate-100 ${focusRing}`}>
              <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[#0b2341] text-xs font-semibold text-white">
                {avatarContent}
              </span>
            </button>
            {profileOpen && (
              <div role="menu" className="absolute right-0 top-full z-50 mt-3 w-60 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg">
                <div className="border-b border-slate-100 px-3 py-2.5">
                  <span className="block truncate text-sm font-semibold text-[#0b2341]">{userName ?? "Profile"}</span>
                  {userRole && <span className="block truncate text-xs text-slate-500">{userRole}</span>}
                </div>
                <button type="button" role="menuitem" onClick={() => navigate("profile")} className={`mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 ${focusRing}`}><UserCircle2 className="h-4 w-4" />My Profile</button>
                <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); onSettingsClick ? onSettingsClick() : navigate("settings"); }} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 ${focusRing}`}><Settings className="h-4 w-4" />Settings</button>
                <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); onHelpClick(); }} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 ${focusRing}`}><HelpCircle className="h-4 w-4" />Help</button>
                <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); onLogout(); }} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 ${focusRing}`}><LogOut className="h-4 w-4" />Logout</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
