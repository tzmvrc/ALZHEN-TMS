import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  Check,
  ChevronDown,
  HelpCircle,
  LogOut,
  Menu,
  Pin,
  PinOff,
  Settings,
  UserCircle2,
} from "lucide-react";
import logo from "../../assets/logo.png";
import type { NavItem } from "../../types/dashboard";
import type { AdminNotification } from "../../services/notification.service";
import NotificationsDropdown from "./Notificationsdropdown";

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
  /** Called when a notification in the dropdown is opened (same handler NotificationsView uses). */
  onNotificationOpen?: (item: AdminNotification) => void;
  /** Called after a notification is marked read, so the parent can refresh its unread count. */
  onNotificationsChanged?: () => void;
  notificationCount?: number;
  canAccessNotifications?: boolean;
  workspace?: WorkspaceName;
  onWorkspaceChange?: (workspace: WorkspaceName) => void;
  userName?: string;
  userRole?: string;
  userInitial?: string;
  /** Called with `true` when the sidebar is collapsed, `false` when open. */
  onCollapseChange?: (collapsed: boolean) => void;
}

const workspaceOptions: WorkspaceName[] = ["Operational Admin", "Client Website"];
const workspaceShortLabel: Record<WorkspaceName, string> = {
  "Operational Admin": "Operational",
  "Client Website": "Client site",
};
const CLOSE_DELAY_MS = 140;
const PIN_KEY = "admin-sidebar-pinned";
const SIDEBAR_OFFSET = "18rem"; // 16rem panel + 1rem gap + 1rem breathing room
const DESKTOP_QUERY = "(min-width: 1024px)";

export default function SidebarNav({
  entries,
  activeId,
  onNavigate,
  onLogout = () => {},
  onHelpClick = () => {},
  onNotificationsClick = () => {},
  onNotificationOpen = () => {},
  onNotificationsChanged,
  notificationCount = 0,
  canAccessNotifications = false,
  workspace = "Operational Admin",
  onWorkspaceChange = () => {},
  userName,
  userRole,
  userInitial,
  onCollapseChange,
}: SidebarNavProps) {
  const items: NavEntry[] = entries ?? [];

  const panelRef = useRef<HTMLElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const lastPointer = useRef<string>("mouse");

  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(() => {
    try {
      return localStorage.getItem(PIN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches,
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // Pinning only applies on desktop; smaller screens always use the overlay.
  const open = hovered || (pinned && isDesktop);

  const togglePinned = () => {
    setPinned((value) => {
      const next = !value;
      try {
        localStorage.setItem(PIN_KEY, next ? "1" : "0");
      } catch {
        /* storage unavailable: pin lasts for this session only */
      }
      return next;
    });
  };

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsDesktop(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  /* ---- open / close behaviour ---- */
  const openPanel = () => {
    window.clearTimeout(closeTimer.current);
    setHovered(true);
  };
  const closePanel = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHovered(false), CLOSE_DELAY_MS);
  };

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const collapseCallback = useRef(onCollapseChange);
  useEffect(() => {
    collapseCallback.current = onCollapseChange;
  }, [onCollapseChange]);

  useEffect(() => {
    collapseCallback.current?.(!open);
  }, [open]);

  /* Push the whole page: the sidebar pads <body> so no parent edits are needed. */
  useEffect(() => {
    const body = document.body;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    body.style.transition = reduceMotion ? "none" : "padding-left 300ms ease-out";
    body.style.paddingLeft = isDesktop && open ? SIDEBAR_OFFSET : "";
  }, [open, isDesktop]);

  useEffect(
    () => () => {
      document.body.style.paddingLeft = "";
      document.body.style.transition = "";
    },
    [],
  );

  /* Outside click (touch devices) + Escape */
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target)) setHovered(false);
      if (!profileRef.current?.contains(target)) setProfileOpen(false);
      if (!notifRef.current?.contains(target)) setNotifOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setHovered(false);
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

  const handleNavigate = (id: string) => {
    onNavigate(id);
    // On touch there is no "hover leave", so close after choosing.
    if (lastPointer.current === "touch") setHovered(false);
  };

  /* ---- derived ---- */
  const avatarLabel = userInitial ?? userName?.charAt(0)?.toUpperCase() ?? "A";
  const hasNotifications = notificationCount > 0;
  const notificationText = notificationCount > 99 ? "99+" : notificationCount;

  const renderItem = (entry: NavItemWithBadge) => {
    const active = entry.id === activeId;
    return (
      <button
        key={entry.id}
        type="button"
        onClick={() => handleNavigate(entry.id)}
        aria-current={active ? "page" : undefined}
        className={`group relative flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd43b]/70 ${
          active
            ? "bg-[#ffd43b] font-semibold text-[#0b2341]"
            : "font-medium text-white/70 hover:bg-[#ffd43b]/15 hover:text-[#ffd43b]"
        }`}>
        <span
          className={`pointer-events-none flex shrink-0 items-center [&>svg]:h-[18px] [&>svg]:w-[18px] ${
            active ? "text-[#0b2341]" : "text-white/50 group-hover:text-[#ffd43b]"
          }`}>
          {entry.icon}
        </span>
        <span className="pointer-events-none min-w-0 flex-1 truncate">
          {entry.label}
        </span>
        {entry.badge ? (
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
              active ? "bg-[#0b2341] text-[#ffd43b]" : "bg-[#ffd43b] text-[#0b2341]"
            }`}>
            {entry.badge}
          </span>
        ) : null}
      </button>
    );
  };

  const itemBase =
    "group flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] font-medium text-white/70 transition-colors duration-150 hover:bg-[#ffd43b]/15 hover:text-[#ffd43b] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd43b]/70";

  return (
    <>
      {/* Reserves room at the top of the page for the floating controls. */}
      <div aria-hidden="true" className="h-[4.5rem]" />

      {/* ───────── Left: hover sidebar ───────── */}
      <aside
        ref={panelRef}
        aria-label="Main navigation"
        onPointerEnter={(event) => {
          lastPointer.current = event.pointerType;
          if (event.pointerType !== "touch") openPanel();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") closePanel();
        }}
        onFocus={openPanel}
        onBlur={(event) => {
          if (!panelRef.current?.contains(event.relatedTarget as Node | null))
            closePanel();
        }}
        className={`fixed left-4 top-4 z-[1100] flex flex-col overflow-hidden border border-[#203954] bg-[#0b2341] transition-[width,height,border-radius,box-shadow] duration-300 ease-out motion-reduce:transition-none ${
          open
            ? "h-[calc(100vh-2rem)] w-64 rounded-3xl shadow-[0_24px_60px_-12px_rgba(11,35,65,0.45)]"
            : "h-11 w-11 rounded-2xl shadow-[0_8px_20px_rgba(11,35,65,0.2)]"
        }`}>
        {/* Header: logo + title, pin on the right. Menu icon is the collapsed handle. */}
        <div className="relative z-10 h-16 shrink-0">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={open}
            tabIndex={open ? -1 : 0}
            onPointerDown={(event) => {
              lastPointer.current = event.pointerType;
            }}
            onClick={() => {
              if (lastPointer.current === "touch") setHovered((value) => !value);
            }}
            className={`absolute left-0 top-0 flex h-11 w-11 items-center justify-center text-white transition-opacity duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ffd43b]/70 ${
              open ? "pointer-events-none opacity-0" : "opacity-100"
            }`}>
            <Menu className="h-[18px] w-[18px]" />
          </button>

          <div
            className={`absolute inset-x-0 top-0 flex h-16 items-center gap-2.5 pl-5 pr-14 transition-opacity duration-200 motion-reduce:transition-none ${
              open ? "opacity-100 delay-100" : "pointer-events-none opacity-0"
            }`}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white p-1">
              <img
                src={logo}
                alt="Alzhen logo"
                className="h-full w-full object-contain"
              />
            </span>
            <span className="truncate text-[16px] font-semibold tracking-tight text-white">
              Alzhen TMS
            </span>
          </div>

          <button
            type="button"
            onClick={togglePinned}
            aria-pressed={pinned}
            aria-label={pinned ? "Unpin sidebar" : "Pin sidebar"}
            title={pinned ? "Unpin sidebar" : "Pin sidebar"}
            className={`absolute right-3 top-4 hidden h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd43b]/70 lg:flex ${
              open ? "opacity-100 delay-100" : "pointer-events-none opacity-0"
            } ${
              pinned
                ? "bg-[#ffd43b] text-[#0b2341]"
                : "text-white/60 hover:bg-[#ffd43b]/15 hover:text-[#ffd43b]"
            }`}>
            {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </button>
        </div>

        {/* Body */}
        <div
          className={`relative z-10 flex min-h-0 flex-1 flex-col transition-opacity duration-200 motion-reduce:transition-none ${
            open ? "opacity-100 delay-100" : "pointer-events-none opacity-0"
          }`}>
          <div className="mx-5 h-px shrink-0 bg-white/10" />

          <nav
            aria-label="Primary"
            className="admin-island-nav min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-4">
            <div className="flex flex-col gap-1">
              {items.map((entry, index) =>
                entry.children ? (
                  <div
                    key={entry.id}
                    className={`flex flex-col gap-1 ${
                      index > 0 ? "mt-3 border-t border-white/10 pt-4" : ""
                    }`}>
                    <p className="px-3 pb-1 text-[11px] font-medium text-white/40">
                      {entry.label}
                    </p>
                    {entry.children.map(renderItem)}
                  </div>
                ) : (
                  renderItem(entry)
                ),
              )}
            </div>
          </nav>

          {/* Footer: help, switch role, account, small print */}
          <div className="shrink-0 border-t border-white/10 px-3 pb-3 pt-3">
            <button type="button" onClick={onHelpClick} className={itemBase}>
              <HelpCircle className="h-[18px] w-[18px] shrink-0 text-white/50 group-hover:text-[#ffd43b]" />
              <span className="flex-1 truncate">Help</span>
            </button>

            <div
              role="group"
              aria-label="Switch role"
              className="mt-2 flex rounded-xl bg-white/5 p-1">
              {workspaceOptions.map((option) => {
                const selected = option === workspace;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onWorkspaceChange(option)}
                    className={`h-8 flex-1 truncate rounded-lg px-2 text-[12px] transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd43b]/70 ${
                      selected
                        ? "bg-[#ffd43b] font-semibold text-[#0b2341]"
                        : "font-medium text-white/60 hover:text-[#ffd43b]"
                    }`}>
                    {workspaceShortLabel[option]}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => handleNavigate("settings")}
              aria-label="Account settings"
              className="mt-3 flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors duration-150 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd43b]/70">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ffd43b] text-[13px] font-semibold text-[#0b2341]">
                {userName ? avatarLabel : <UserCircle2 className="h-5 w-5" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-white">
                  {userName ?? "Account"}
                </span>
                {userRole && (
                  <span className="block truncate text-[11px] text-white/50">
                    {userRole}
                  </span>
                )}
              </span>
            </button>

            <p className="mt-2 text-center text-[10px] text-white/30">
              Alzhen Trucking Services © 2026
            </p>
          </div>
        </div>
      </aside>

      {/* ───────── Right: notifications + profile ───────── */}
      <div className="fixed right-4 top-4 z-40 flex h-11 items-center gap-1 rounded-full border border-[#203954] bg-[#0b2341] p-1 shadow-[0_8px_20px_rgba(11,35,65,0.2)]">
        {canAccessNotifications && (
          <div ref={notifRef} className="contents">
            <button
              type="button"
              onClick={() => {
                setProfileOpen(false);
                setNotifOpen((value) => !value);
              }}
              aria-expanded={notifOpen}
              aria-haspopup="dialog"
              aria-label={
                hasNotifications
                  ? `Notifications, ${notificationCount} unread`
                  : "Notifications"
              }
              className={`relative flex h-9 w-9 items-center justify-center rounded-full text-white/75 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd43b]/70 ${
                notifOpen ? "bg-white/10 text-white" : ""
              }`}>
              <Bell className="h-[18px] w-[18px]" />
              {hasNotifications && (
                <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-[#0b2341]">
                  {notificationText}
                </span>
              )}
            </button>

            {notifOpen && (
              <NotificationsDropdown
                onOpenItem={(item) => {
                  setNotifOpen(false);
                  onNotificationOpen(item);
                }}
                onViewAll={() => {
                  setNotifOpen(false);
                  onNotificationsClick();
                }}
                onChanged={onNotificationsChanged}
              />
            )}
          </div>
        )}

        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setNotifOpen(false);
              setProfileOpen((value) => !value);
            }}
            aria-expanded={profileOpen}
            aria-haspopup="menu"
            aria-label="User menu"
            className={`flex h-9 w-9 items-center justify-center rounded-full p-0.5 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd43b]/70 ${
              profileOpen ? "bg-white/20" : "hover:bg-white/10"
            }`}>
            <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#ffd43b] text-[12px] font-semibold text-[#0b2341]">
              {userName ? avatarLabel : <UserCircle2 className="h-5 w-5" />}
            </span>
          </button>

          {profileOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-3 w-60 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-[0_24px_48px_-12px_rgba(15,23,42,0.22)]">
              <div className="mb-1 flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0b2341] text-[11px] font-semibold text-white">
                  {userName ? avatarLabel : <UserCircle2 className="h-4 w-4" />}
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
      </div>
    </>
  );
}