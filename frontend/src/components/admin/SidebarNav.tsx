import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, LogOut, Settings, UserCircle2 } from "lucide-react";
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
        className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition-all duration-200 hover:text-slate-900">
        <img
          src={logo}
          alt="Alzhen logo"
          className="h-6 w-6 shrink-0 rounded-md object-contain"
        />
        <span className="min-w-0 truncate text-[12.5px] font-semibold tracking-wide text-slate-900">
          {workspace === "Client Website"
            ? "Client Website"
            : "Operational Admin"}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.14)] transition-all duration-200 ease-out">
          {options.map((option) => (
            <button
              key={option}
              role="option"
              aria-selected={option === workspace}
              type="button"
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition ${
                option === workspace
                  ? "bg-slate-100 font-medium text-slate-900"
                  : "text-slate-600 hover:bg-slate-50"
              }`}>
              <span className="w-3 text-center text-[10px]">
                {option === workspace ? "✓" : ""}
              </span>
              {option === "Operational Admin" ? "Operational Admin" : option}
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
  workspace?: WorkspaceName;
  onWorkspaceChange?: (workspace: WorkspaceName) => void;
  userName?: string;
  userRole?: string;
  userInitial?: string;
  onCollapseChange?: (collapsed: boolean) => void;
}

const accentClasses: Record<
  string,
  { active: string; inactive: string; glow: string }
> = {
  overview: {
    active: "text-blue-600 bg-blue-50/80 after:bg-blue-500",
    inactive: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    glow: "shadow-[0_0_0_1px_rgba(59,130,246,0.08)]",
  },
  trips: {
    active: "text-orange-600 bg-orange-50/80 after:bg-orange-500",
    inactive: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    glow: "shadow-[0_0_0_1px_rgba(249,115,22,0.08)]",
  },
  truckers: {
    active: "text-violet-600 bg-violet-50/80 after:bg-violet-500",
    inactive: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    glow: "shadow-[0_0_0_1px_rgba(139,92,246,0.08)]",
  },
  pod: {
    active: "text-emerald-600 bg-emerald-50/80 after:bg-emerald-500",
    inactive: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    glow: "shadow-[0_0_0_1px_rgba(16,185,129,0.08)]",
  },
  reports: {
    active: "text-cyan-600 bg-cyan-50/80 after:bg-cyan-500",
    inactive: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    glow: "shadow-[0_0_0_1px_rgba(6,182,212,0.08)]",
  },
  billing: {
    active: "text-amber-600 bg-amber-50/80 after:bg-amber-500",
    inactive: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    glow: "shadow-[0_0_0_1px_rgba(245,158,11,0.08)]",
  },
};

export default function SidebarNav({
  entries,
  activeId,
  onNavigate,
  onLogout = () => {},
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

  return (
    <header className="sticky top-4 z-30 mb-4">
      <div className="mx-auto flex w-full max-w-[1500px] items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/85 px-3 py-2.5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:px-4 lg:px-5">
        <div className="shrink-0">
          <WorkspaceSwitcher
            workspace={workspace}
            onChange={onWorkspaceChange}
          />
        </div>

        <nav
          aria-label="Main navigation"
          className="flex flex-1 items-center justify-center gap-5 overflow-hidden px-2">
          {items.map((entry) => {
            const active = entry.id === activeId;
            const accent = accentClasses[entry.id] ?? accentClasses.overview;

            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => onNavigate(entry.id)}
                aria-current={active ? "page" : undefined}
                title={entry.label}
                className={`group relative inline-flex h-11 items-center justify-center rounded-xl border border-transparent px-2.5 transition-all duration-200 ${
                  active
                    ? `${accent.active} ${accent.glow}`
                    : `${accent.inactive} border-transparent text-slate-600`
                }`}>
                <span className="pointer-events-none [&>svg]:h-4.5 [&>svg]:w-4.5">
                  {entry.icon}
                </span>
                <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-200 bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:opacity-100">
                  {entry.label}
                </span>
                <span
                  className={`pointer-events-none absolute inset-x-2 bottom-0 h-[2px] rounded-full transition-all duration-200 ${
                    active ? "opacity-100" : "opacity-0"
                  } ${active ? "bg-current" : ""}`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </nav>

        <div className="ml-auto shrink-0">
          <div ref={profileRef} className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen((value) => !value)}
              aria-expanded={profileOpen}
              aria-haspopup="menu"
              aria-label="User menu"
              className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
              <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-slate-900 text-[11px] font-bold text-white">
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
              <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
                <div className="border-b border-slate-100 px-2.5 py-2 text-[12px] font-semibold text-slate-900">
                  {userName ?? "Profile"}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onNavigate("settings");
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-slate-700 transition hover:bg-slate-50">
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onLogout();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-rose-700 transition hover:bg-rose-50">
                  <LogOut className="h-3.5 w-3.5" />
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
