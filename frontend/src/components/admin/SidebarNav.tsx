import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  Check,
  ChevronDown,
  LogOut,
  Settings,
  UserCircle2,
} from "lucide-react";
import logo from "../../assets/logo.png";
import type { NavItem } from "../../types/dashboard";

export type WorkspaceName = "Operational Admin" | "Client Website";

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
          {workspace === "Client Website"
            ? "Client Website"
            : "Operational Admin"}
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
  onNotificationsClick?: () => void;
  notificationCount?: number;
  canAccessNotifications?: boolean;
  workspace?: WorkspaceName;
  onWorkspaceChange?: (workspace: WorkspaceName) => void;
  userName?: string;
  userRole?: string;
  userInitial?: string;
  onCollapseChange?: (collapsed: boolean) => void;
}

/* Per-section accent: icon color (active), hover color, soft ring */
export default function SidebarNav({
  entries,
  activeId,
  onNavigate,
  onLogout = () => {},
  onNotificationsClick = () => {},
  notificationCount = 0,
  canAccessNotifications = false,
  workspace = "Operational Admin",
  onWorkspaceChange = () => {},
  userName,
  userInitial,
}: SidebarNavProps) {
  const items: NavEntry[] = entries ?? [];
  const profileRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!profileRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const avatarLabel = userInitial ?? userName?.charAt(0)?.toUpperCase() ?? "A";
  const hasNotifications = notificationCount > 0;
  const notificationText = notificationCount > 99 ? "99+" : notificationCount;

  return (
    <header className="sticky top-4 z-30 mb-4 pt-5">
      <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center gap-2 rounded-3xl border border-[#203954] bg-[#0b2341] px-3 py-2 shadow-[0_12px_32px_rgba(11,35,65,0.2)] sm:gap-3 sm:rounded-full sm:px-4">
        <div className="order-1 shrink-0 rounded-full bg-white px-1 ring-1 ring-white/40">
          <WorkspaceSwitcher
            workspace={workspace}
            onChange={onWorkspaceChange}
          />
        </div>

        <nav
          aria-label="Main navigation"
          className="admin-island-nav order-3 flex min-w-0 basis-full items-center justify-center gap-1 overflow-x-auto border-t border-white/10 pt-1 lg:order-2 lg:basis-auto lg:flex-1 lg:overflow-visible lg:border-0 lg:pt-0">
            {items.map((entry) => {
              const active = entry.id === activeId;

              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onNavigate(entry.id)}
                  aria-current={active ? "page" : undefined}
                  title={entry.label}
                  className={`group relative inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-2 rounded-full px-1 transition-[background-color,color] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 after:absolute after:bottom-1 after:left-1 after:right-1 after:h-[2px] after:rounded-full after:content-[''] after:transition-transform after:duration-200 after:ease-out lg:h-11 lg:min-w-[2.75rem] lg:px-4 lg:after:bottom-0.5 lg:after:left-2 lg:after:right-2 motion-reduce:transition-none motion-reduce:after:transition-none ${
                    active ? "text-white after:scale-x-100 after:bg-[#ffd43b]" : "text-white/75 after:scale-x-0 after:bg-[#ffd43b] hover:text-white hover:after:scale-x-100"
                  }`}>
                  <span
                    className="pointer-events-none [&>svg]:h-[18px] [&>svg]:w-[18px]">
                    {entry.icon}
                  </span>
                  <span
                    className={`pointer-events-none relative hidden whitespace-nowrap text-[13px] lg:inline ${active ? "font-semibold" : "font-medium"}`}>
                    {entry.label}
                  </span>
                </button>
              );
            })}
        </nav>

        <div className="order-2 ml-auto flex shrink-0 items-center gap-2 lg:order-3">
          {canAccessNotifications && <button
            type="button"
            onClick={onNotificationsClick}
            aria-label={
              hasNotifications
                ? `Notifications, ${notificationCount} unread`
                : "Notifications"
            }
            className="group relative flex h-10 w-10 items-center justify-center rounded-full text-white/75 transition-colors duration-200 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd43b]/70">
            <Bell className="h-[18px] w-[18px]" />
            {hasNotifications && (
              <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white">
                {notificationText}
              </span>
            )}
          </button>}

          <div ref={profileRef} className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen((value) => !value)}
              aria-expanded={profileOpen}
              aria-haspopup="menu"
              aria-label="User menu"
              className={`flex h-10 w-10 items-center justify-center rounded-full p-0.5 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd43b]/70 ${
                profileOpen
                  ? "bg-white/20"
                  : "hover:bg-white/10"
              }`}>
              <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#ffd43b] text-[12px] font-semibold text-[#0b2341] shadow-sm">
                {userName ? (
                  <span className="flex h-full w-full items-center justify-center">
                    {avatarLabel}
                  </span>
                ) : (
                  <UserCircle2 className="h-5 w-5" />
                )}
              </span>
            </button>

            {profileOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-3 w-60 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-[0_24px_48px_-12px_rgba(15,23,42,0.22)]">
                <div className="mb-1 flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                    {userName ? (
                      avatarLabel
                    ) : (
                      <UserCircle2 className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0 truncate text-[13px] font-semibold text-slate-900">
                    {userName ?? "Profile"}
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
      </div>
    </header>
  );
}
