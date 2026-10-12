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

/* ───────── Liquid / water-drop hover ─────────
   One glassy droplet per rail. It glides to whichever icon is hovered,
   overshoots slightly (like a bead of water settling), and its shape
   gently morphs while it rests. */
const liquidCss = `
.liquid-drop {
  position: absolute;
  width: 40px;
  height: 40px;
  pointer-events: none;
  z-index: 0;
  opacity: 0;
  transform: scale(0.55);
  border-radius: 50%;
  background: linear-gradient(165deg, #ffffff 0%, rgba(255,255,255,0.92) 100%);
  box-shadow:
    inset 0 1px 1px rgba(255,255,255,1),
    0 6px 16px -6px rgba(15,23,42,0.22);
  transition:
    top 0.6s cubic-bezier(0.34, 1.5, 0.5, 1),
    left 0.6s cubic-bezier(0.34, 1.5, 0.5, 1),
    opacity 0.3s ease,
    transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1);
  animation: liquid-morph 3.2s ease-in-out infinite alternate;
}
.liquid-drop[data-visible="true"] {
  opacity: 1;
  transform: scale(1);
}
.sidebar-tip {
  position: fixed;
  left: 44px;
  z-index: 1200;
  pointer-events: none;
  transform: translateY(-50%);
  /* Cut everything left of the rail's edge (x = 72px) so the shape only
     shows where it leaves the sidebar. */
  clip-path: inset(-40px -40px -40px 28px);
  transition: top 0.5s cubic-bezier(0.34, 1.4, 0.5, 1);
}
.sidebar-tip-goo {
  position: relative;
  padding: 20px;
  filter: url(#sidebar-goo);
}
/* Bead on the rail's edge. The gap to the pill is bridged by the goo filter
   into a thin neck, like a drop of water pulling apart. */
.sidebar-tip-anchor {
  position: absolute;
  left: 10px;
  top: 50%;
  width: 22px;
  height: 30px;
  margin-top: -15px;
  border-radius: 9999px;
  background: #fdfdfe;
  transform-origin: left center;
  transform: scale(0.3, 0.6);
  opacity: 0;
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease;
}
.sidebar-tip-pill {
  display: block;
  margin-left: 19px;
  padding: 9px 18px;
  border-radius: 9999px;
  background: #fdfdfe;
  color: transparent;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  transform: translateX(-30px) scaleX(0.35);
  transform-origin: left center;
  opacity: 0;
  transition: transform 0.55s cubic-bezier(0.34, 1.5, 0.5, 1), opacity 0.2s ease;
}
.sidebar-tip-text {
  position: absolute;
  left: 39px;
  top: 20px;
  bottom: 20px;
  padding: 0 18px;
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  color: #0b2341;
  opacity: 0;
  transform: translateX(-10px);
  transition: opacity 0.2s ease, transform 0.45s cubic-bezier(0.34, 1.4, 0.5, 1);
}
.sidebar-tip[data-visible="true"] .sidebar-tip-anchor { transform: none; opacity: 1; }
.sidebar-tip[data-visible="true"] .sidebar-tip-pill { transform: none; opacity: 1; }
.sidebar-tip[data-visible="true"] .sidebar-tip-text { opacity: 1; transform: none; transition-delay: 0.1s; }
@keyframes liquid-morph {
  0%   { border-radius: 50% 50% 50% 50% / 50% 50% 50% 50%; }
  33%  { border-radius: 54% 46% 52% 48% / 46% 54% 46% 54%; }
  66%  { border-radius: 47% 53% 46% 54% / 53% 47% 55% 45%; }
  100% { border-radius: 52% 48% 55% 45% / 48% 52% 48% 52%; }
}
.liquid-icon {
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.25s ease;
}
.liquid-btn:hover .liquid-icon,
.liquid-btn:focus-visible .liquid-icon {
  transform: translateY(-1px) scale(1.12);
}
@media (prefers-reduced-motion: reduce) {
  .liquid-drop { animation: none; transition: opacity 0.2s ease; }
  .liquid-btn:hover .liquid-icon, .liquid-btn:focus-visible .liquid-icon { transform: none; }
}
`;

type LiquidState = { top: number; left: number; tone: "water" | "rose"; visible: boolean };

function LiquidDrop({ state }: { state: LiquidState | null }) {
  if (!state) return null;
  return (
    <span
      aria-hidden="true"
      className="liquid-drop"
      data-visible={state.visible}
      data-tone={state.tone}
      style={{ top: state.top, left: state.left }}
    />
  );
}

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
  const [navTooltip, setNavTooltip] = useState<{
    label: string;
    left: number;
    top: number;
    visible: boolean;
  } | null>(null);
  const [navDrop, setNavDrop] = useState<LiquidState | null>(null);
  const [utilDrop, setUtilDrop] = useState<LiquidState | null>(null);

  function showNavTooltip(label: string, target: HTMLButtonElement) {
    const rect = target.getBoundingClientRect();
    setNavTooltip({ label, left: rect.right + 8, top: rect.top + rect.height / 2, visible: true });
  }

  function hideNavTooltip() {
    setNavTooltip((current) => (current ? { ...current, visible: false } : null));
  }

  function glide(
    setter: (updater: (prev: LiquidState | null) => LiquidState | null) => void,
    target: HTMLButtonElement,
    tone: "water" | "rose" = "water",
    hidden = false,
  ) {
    setter(() => ({
      top: target.offsetTop,
      left: target.offsetLeft,
      tone,
      visible: !hidden,
    }));
  }

  function hideDrop(setter: (updater: (prev: LiquidState | null) => LiquidState | null) => void) {
    setter((prev) => (prev ? { ...prev, visible: false } : null));
  }

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
    const enter = (target: HTMLButtonElement) => {
      showNavTooltip(entry.label, target);
      glide(setNavDrop, target, "water", active);
    };
    return (
      <button
        key={entry.id}
        type="button"
        onClick={() => onNavigate(entry.id)}
        aria-current={active ? "page" : undefined}
        aria-label={entry.label}
        onPointerEnter={(event) => enter(event.currentTarget)}
        onPointerLeave={hideNavTooltip}
        onFocus={(event) => enter(event.currentTarget)}
        onBlur={() => {
          hideNavTooltip();
          hideDrop(setNavDrop);
        }}
        className={`liquid-btn relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${focusRing} ${
          active
            ? "bg-[#0b2341] text-white shadow-[0_6px_14px_-4px_rgba(11,35,65,0.55)]"
            : "text-slate-400 hover:text-sky-800"
        }`}>
        <span className="liquid-icon pointer-events-none flex items-center [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:stroke-[1.6]">
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

  const utilityButton = `liquid-btn relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors duration-300 hover:text-sky-800 ${focusRing}`;

  return (
    <>
      <style>{liquidCss}</style>

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
            onPointerLeave={() => hideDrop(setNavDrop)}
            className={`admin-island-nav relative flex max-h-full w-full flex-col items-center gap-1 overflow-y-auto overflow-x-hidden rounded-full px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${pillSurface}`}>
            <LiquidDrop state={navDrop} />
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
          onPointerLeave={() => hideDrop(setUtilDrop)}
          className={`relative flex w-full shrink-0 flex-col items-center gap-1 rounded-full px-2 py-2 ${pillSurface}`}>
          <LiquidDrop state={utilDrop} />
          <button
            type="button"
            onClick={onHelpClick}
            aria-label="Help"
            onPointerEnter={(event) => {
              showNavTooltip("Help", event.currentTarget);
              glide(setUtilDrop, event.currentTarget, "water");
            }}
            onPointerLeave={hideNavTooltip}
            onFocus={(event) => {
              showNavTooltip("Help", event.currentTarget);
              glide(setUtilDrop, event.currentTarget, "water");
            }}
            onBlur={() => {
              hideNavTooltip();
              hideDrop(setUtilDrop);
            }}
            className={utilityButton}>
            <HelpCircle className="liquid-icon h-[18px] w-[18px] stroke-[1.6]" />
          </button>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Logout"
            onPointerEnter={(event) => {
              showNavTooltip("Logout", event.currentTarget);
              glide(setUtilDrop, event.currentTarget, "rose");
            }}
            onPointerLeave={hideNavTooltip}
            onFocus={(event) => {
              showNavTooltip("Logout", event.currentTarget);
              glide(setUtilDrop, event.currentTarget, "rose");
            }}
            onBlur={() => {
              hideNavTooltip();
              hideDrop(setUtilDrop);
            }}
            className={`${utilityButton} hover:!text-rose-600`}>
            <LogOut className="liquid-icon h-[18px] w-[18px] stroke-[1.6]" />
          </button>
        </div>
      </aside>

      {/* Gooey filter: merges the white anchor + label pill into one liquid shape */}
      <svg width="0" height="0" aria-hidden="true" className="pointer-events-none absolute">
        <defs>
          <filter id="sidebar-goo" x="-20%" y="-60%" width="140%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"
            />
          </filter>
        </defs>
      </svg>

      {navTooltip && (
        <div
          role="tooltip"
          aria-hidden={!navTooltip.visible}
          className="sidebar-tip"
          data-visible={navTooltip.visible}
          style={{ top: navTooltip.top }}>
          <div style={{ filter: "drop-shadow(0 6px 10px rgba(15,23,42,0.10))" }}>
            <div className="sidebar-tip-goo">
              <span className="sidebar-tip-anchor" />
              <span className="sidebar-tip-pill">{navTooltip.label}</span>
            </div>
          </div>
          <span className="sidebar-tip-text">{navTooltip.label}</span>
        </div>
      )}

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