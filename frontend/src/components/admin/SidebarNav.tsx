import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  Check,
  ChevronDown,
  HelpCircle,
  LogOut,
  Settings,
  UserCircle2,
} from "lucide-react";
import logo from "../../assets/logo.png";
import type { NavItem } from "../../types/dashboard";
import type { AdminNotification } from "../../services/notification.service";
import NotificationsDropdown from "./NotificationsDropdown";

export type WorkspaceName = "Operational Admin" | "Client Website";

/* Kept as-is so any other file importing it keeps working. */
export function WorkspaceSwitcher({
  workspace,
  onChange,
}: {
  workspace: WorkspaceName;
  onChange: (workspace: WorkspaceName) => void;
}) {
  const [open, setOpen] = useState(false);
  const options: WorkspaceName[] = ["Operational Admin", "Client Website"];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`group flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 text-left transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20 ${
          open ? "bg-slate-100" : "hover:bg-slate-100/80"
        }`}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white p-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/5">
          <img
            src={logo}
            alt="Alzhen logo"
            className="h-full w-full object-contain"
          />
        </span>
        <span className="min-w-0 truncate text-[13px] font-semibold tracking-tight text-slate-900">
          {workspace}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 group-hover:text-slate-600 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-3 w-56 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-[0_24px_48px_-12px_rgba(15,23,42,0.22)]">
          {options.map((option) => {
            const selected = option === workspace;
            return (
              <button
                key={option}
                role="option"
                aria-selected={selected}
                type="button"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors duration-150 ${
                  selected
                    ? "bg-slate-100 font-semibold text-slate-900"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}>
                <span className="flex-1">{option}</span>
                {selected && <Check className="h-3.5 w-3.5 text-slate-900" />}
              </button>
            );
          })}
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
  /** "See all" in the notifications dropdown. */
  onNotificationsClick?: () => void;
  /** Called once when the notification panel is opened. */
  onNotificationBellOpen?: () => void;
  /** Called when a notification in the dropdown is opened (same handler NotificationsView uses). */
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
  /** Called with `true` when the sidebar is collapsed, `false` when open. The rail is always slim now, so this reports `true`. */
  onCollapseChange?: (collapsed: boolean) => void;
}

const workspaceOptions: WorkspaceName[] = ["Operational Admin", "Client Website"];
const workspaceShortLabel: Record<WorkspaceName, string> = {
  "Operational Admin": "Operational",
  "Client Website": "Client Side",
};

const pillSurface =
  "border border-white/80 bg-white/80 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.12)] backdrop-blur-xl";
const focusRing =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30";

export default function SidebarNav({
  entries,
  activeId,
  onNavigate,
  onLogout = () => {},
  onHelpClick = () => {},
  onNotificationsClick = () => {},
  onNotificationBellOpen = () => {},
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
  onCollapseChange,
}: SidebarNavProps) {
  const items: NavEntry[] = entries ?? [];

  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);

  // The rail is always slim; report that once so the parent layout can reserve room.
  const collapseCallback = useRef(onCollapseChange);
  useEffect(() => {
    collapseCallback.current = onCollapseChange;
  }, [onCollapseChange]);
  useEffect(() => {
    collapseCallback.current?.(true);
  }, []);

  /* Outside click + Escape close the popovers */
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!profileRef.current?.contains(target)) setProfileOpen(false);
      if (!notifRef.current?.contains(target)) setNotifOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProfileOpen(false);
        setNotifOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  /* ---- derived ---- */
  const avatarLabel = userInitial ?? userName?.charAt(0)?.toUpperCase() ?? "A";
  const avatarContent =
    userPictureUrl && userPictureUrl !== failedAvatarUrl ? (
      <img
        src={userPictureUrl}
        alt=""
        onError={() => setFailedAvatarUrl(userPictureUrl)}
        className="h-full w-full object-cover"
      />
    ) : userName ? (
      avatarLabel
    ) : (
      <UserCircle2 className="h-5 w-5" />
    );
  const hasNotifications = notificationCount > 0;
  const notificationText = notificationCount > 99 ? "99+" : notificationCount;

  /* ---- icon-only nav button (labels kept as title + aria-label) ---- */
  const renderItem = (entry: NavItemWithBadge) => {
    const active = entry.id === activeId;
    return (
      <button
        key={entry.id}
        type="button"
        onClick={() => onNavigate(entry.id)}
        aria-current={active ? "page" : undefined}
        aria-label={entry.label}
        title={entry.label}
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors duration-150 ${focusRing} ${
          active
            ? "bg-[#0b2341] text-white shadow-[0_6px_14px_-4px_rgba(11,35,65,0.55)]"
            : "text-slate-400 hover:bg-slate-900/5 hover:text-slate-700"
        }`}>
        <span className="pointer-events-none flex items-center [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:stroke-[1.6]">
          {entry.icon}
        </span>
        {entry.badge ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold leading-none text-white ring-2 ring-white">
            {entry.badge}
          </span>
        ) : null}
      </button>
    );
  };

  const utilityButton =
    `flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors duration-150 hover:bg-slate-900/5 hover:text-slate-700 ${focusRing}`;

  return (
    <>
      {/* Reserves room at the top of the page for the floating top bar. */}
      <div aria-hidden="true" className="h-[4.5rem]" />

      {/* ───────── Left: logo + slim rail ───────── */}
      <aside
        aria-label="Main navigation"
        className="fixed bottom-4 left-4 top-4 z-[1100] flex w-14 flex-col items-center gap-3">
        {/* Logo in a white circle */}
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${pillSurface}`}>
          <span className="flex h-9 w-9 items-center justify-center">
            <img
              src={logo}
              alt="Alzhen logo"
              className="h-full w-full object-contain"
            />
          </span>
        </div>

        {/* Primary navigation: fits its content and sits vertically centred */}
        <div className="flex min-h-0 w-full flex-1 items-center">
          <nav
            aria-label="Primary"
            className={`admin-island-nav flex max-h-full w-full flex-col items-center gap-1 overflow-y-auto overflow-x-hidden rounded-full px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${pillSurface}`}>
            {items.map((entry, index) =>
              entry.children ? (
                <div
                  key={entry.id}
                  role="group"
                  aria-label={entry.label}
                  className={`flex flex-col items-center gap-1 ${
                    index > 0 ? "mt-1 border-t border-slate-900/10 pt-2" : ""
                  }`}>
                  {entry.children.map(renderItem)}
                </div>
              ) : (
                renderItem(entry)
              ),
            )}
          </nav>
        </div>

        {/* Bottom group: help and logout only */}
        <div
          className={`flex w-full shrink-0 flex-col items-center gap-1 rounded-full px-2 py-2 ${pillSurface}`}>
          <button
            type="button"
            onClick={onHelpClick}
            aria-label="Help"
            title="Help"
            className={utilityButton}>
            <HelpCircle className="h-[18px] w-[18px] stroke-[1.6]" />
          </button>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Logout"
            title="Logout"
            className={`${utilityButton} hover:!bg-rose-50 hover:!text-rose-600`}>
            <LogOut className="h-[18px] w-[18px] stroke-[1.6]" />
          </button>
        </div>
      </aside>

      {/* ───────── Top bar: starts beside the rail, one row ───────── */}
      <header
        aria-label="Top bar"
        className="fixed left-[5.5rem] right-4 top-4 z-[1101] flex h-14 items-center gap-2 sm:gap-3">
        {/* Workspace switcher (existing control, now a white pill) */}
        <div
          role="group"
          aria-label="Switch workspace"
          className={`flex h-14 min-w-0 items-center rounded-full p-1.5 ${pillSurface}`}>
          {workspaceOptions.map((option) => {
            const selected = option === workspace;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                title={option}
                onClick={() => onWorkspaceChange(option)}
                className={`h-11 truncate rounded-full px-3.5 text-[13px] transition-colors duration-150 sm:px-5 ${focusRing} ${
                  selected
                    ? "bg-[#0b2341] font-semibold text-white"
                    : "font-medium text-slate-500 hover:text-slate-900"
                }`}>
                {workspaceShortLabel[option]}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {/* Notifications */}
        {canAccessNotifications && (
          <div ref={notifRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => {
                setProfileOpen(false);
                if (!notifOpen) onNotificationBellOpen();
                setNotifOpen(!notifOpen);
              }}
              aria-expanded={notifOpen}
              aria-haspopup="dialog"
              aria-label={
                hasNotifications
                  ? `Notifications, ${notificationCount} unread`
                  : "Notifications"
              }
              className={`relative flex h-14 w-14 items-center justify-center rounded-full text-slate-600 transition-colors duration-200 hover:text-slate-900 ${pillSurface} ${focusRing} ${
                notifOpen ? "!bg-white text-slate-900" : ""
              }`}>
              <Bell className="h-[18px] w-[18px] stroke-[1.6]" />
              {hasNotifications && (
                <span className="absolute right-2 top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white">
                  {notificationText}
                </span>
              )}
            </button>

            {notifOpen && (
              <NotificationsDropdown
                items={notificationItems}
                loading={notificationLoading}
                error={notificationError}
                onRetry={onNotificationRetry}
                onNotificationRead={onNotificationRead}
                onOpenItem={(item) => {
                  setNotifOpen(false);
                  onNotificationOpen(item);
                }}
                onViewAll={() => {
                  setNotifOpen(false);
                  onNotificationsClick();
                }}
              />
            )}
          </div>
        )}

        {/* Profile pill */}
        <div ref={profileRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              setNotifOpen(false);
              setProfileOpen((value) => !value);
            }}
            aria-expanded={profileOpen}
            aria-haspopup="menu"
            aria-label="User menu"
            className={`flex h-14 items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-1.5 text-left transition-colors duration-200 sm:pr-5 ${pillSurface} ${focusRing} ${
              profileOpen ? "!bg-white" : ""
            }`}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-950 text-[13px] font-semibold text-white">
              {avatarContent}
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block max-w-[10rem] truncate text-[13px] font-semibold leading-tight text-slate-900">
                {userName ?? "Profile"}
              </span>
              {userRole && (
                <span className="block max-w-[10rem] truncate text-[11px] leading-tight text-slate-500">
                  {userRole}
                </span>
              )}
            </span>
          </button>

          {profileOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-3 w-60 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-[0_24px_48px_-12px_rgba(15,23,42,0.22)]">
              <div className="mb-1 flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-950 text-[11px] font-semibold text-white">
                  {avatarContent}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-slate-900">
                    {userName ?? "Profile"}
                  </span>
                  {userRole && (
                    <span className="block truncate text-[11px] text-slate-500">
                      {userRole}
                    </span>
                  )}
                </span>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setProfileOpen(false);
                  onNavigate("settings");
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900">
                <Settings className="h-4 w-4" />
                Settings
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setProfileOpen(false);
                  onLogout();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] text-rose-600 transition-colors duration-150 hover:bg-rose-50 hover:text-rose-700">
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          )}
        </div>
      </header>
    </>
  );
}