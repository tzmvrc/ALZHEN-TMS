import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  MoreVertical,
  Plus,
  Search,
  Mic,
  LogOut,
} from "lucide-react";
import type { NavItem } from "../../types/dashboard";
import logo from "../../assets/logo.png";

export type WorkspaceName = "Operations Admin" | "Client Website";

export function WorkspaceSwitcher({
  workspace,
  onChange,
}: {
  workspace: WorkspaceName;
  onChange: (workspace: WorkspaceName) => void;
}) {
  const [open, setOpen] = useState(false);
  const options: WorkspaceName[] = ["Operations Admin", "Client Website"];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-slate-200/50"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-900 text-[11px] font-bold text-white">
          {workspace.charAt(0)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-slate-900">
          {workspace}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
        >
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
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition ${
                option === workspace
                  ? "bg-slate-100 font-medium text-slate-900"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span className="w-3 text-center text-[10px]">
                {option === workspace ? "✓" : ""}
              </span>
              {option}
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
  /** @deprecated use `entries` */
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
}

export default function SidebarNav({
  entries,
  groups,
  activeId,
  onNavigate,
  onLogout = () => {},
  workspace = "Operations Admin",
  onWorkspaceChange = () => {},
}: SidebarNavProps) {
  const items: NavEntry[] = entries ?? groups ?? [];
  const [query, setQuery] = useState("");

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    items.forEach((entry) => {
      if ("children" in entry && Array.isArray(entry.children)) {
        initial[entry.id] = entry.children.some((i) => i.id === activeId);
      }
    });
    return initial;
  });

  const isActive = (id: string) => id === activeId;
  const q = query.trim().toLowerCase();
  const matches = (label: string) => !q || label.toLowerCase().includes(q);

  return (
    <aside
      aria-label="Main sidebar"
      className="fixed inset-y-4 left-4 z-30 hidden h-[calc(100vh-2rem)] w-[260px] shrink-0 flex-col rounded-2xl border border-slate-200/70 bg-[#fbfbfb] p-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)] lg:flex"
    >
      {/* TOP: Operations Admin dropdown */}
      <div className="pb-3">
        <WorkspaceSwitcher workspace={workspace} onChange={onWorkspaceChange} />
      </div>

      {/* Search */}
      <div className="pb-3">
        <div className="flex items-center gap-2 rounded-lg bg-slate-200/60 px-2.5 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full bg-transparent text-[12.5px] text-slate-800 outline-none placeholder:text-slate-500"
          />
          <Mic className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        </div>
      </div>

      {/* Nav */}
      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto pr-0.5">
        {items.length === 0 ? (
          <p className="px-2 py-2 text-[12px] text-slate-400">
            No navigation items configured.
          </p>
        ) : null}

        {items.map((entry) => {
          if (!("children" in entry) || !Array.isArray(entry.children)) {
            if (!matches(entry.label)) return null;
            const active = isActive(entry.id);
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => onNavigate(entry.id)}
                aria-current={active ? "page" : undefined}
                className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition ${
                  active
                    ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                    : "text-slate-700 hover:bg-white/70"
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center ${
                    active ? "text-slate-800" : "text-slate-500"
                  }`}
                >
                  <span className="[&>svg]:h-[16px] [&>svg]:w-[16px]">
                    {entry.icon}
                  </span>
                </span>
                <span className="flex-1 truncate">{entry.label}</span>
                {entry.badge ? (
                  <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                    {entry.badge}
                  </span>
                ) : null}
              </button>
            );
          }

          const visibleChildren = entry.children.filter((c) => matches(c.label));
          if (!matches(entry.label) && visibleChildren.length === 0) return null;
          const isOpen = openGroups[entry.id] ?? false;

          return (
            <div key={entry.id} className="mb-1 mt-3">
              <div className="group/header flex items-center gap-1 px-2 pb-1">
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroups((s) => ({ ...s, [entry.id]: !s[entry.id] }))
                  }
                  aria-expanded={isOpen}
                  className="flex flex-1 items-center gap-1.5 text-left text-[12.5px] font-medium text-slate-500 transition hover:text-slate-800"
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                      isOpen ? "" : "-rotate-90"
                    }`}
                  />
                  <span className="truncate">{entry.label}</span>
                </button>

                <button
                  type="button"
                  title="Add"
                  className="flex h-5 w-5 items-center justify-center rounded text-slate-400 opacity-0 transition hover:bg-slate-200/70 hover:text-slate-700 group-hover/header:opacity-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="More"
                  className="flex h-5 w-5 items-center justify-center rounded text-slate-400 opacity-0 transition hover:bg-slate-200/70 hover:text-slate-700 group-hover/header:opacity-100"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </div>

              {isOpen && (
                <div>
                  {visibleChildren.map((child) => {
                    const active = isActive(child.id);
                    return (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => onNavigate(child.id)}
                        aria-current={active ? "page" : undefined}
                        className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 pl-[26px] text-left text-[13.5px] transition ${
                          active
                            ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                            : "text-slate-700 hover:bg-white/70"
                        }`}
                      >
                        <span className="flex-1 truncate">{child.label}</span>
                        {child.badge ? (
                          <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                            {child.badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* BOTTOM: Alzhen + logout */}
      <div className="mt-3 flex items-center gap-2 border-t border-slate-200/70 pt-3">
        <img
          src={logo}
          alt="Alzhen Trucking Services"
          className="h-7 w-7 shrink-0 rounded-md object-contain"
        />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-800">
          Alzhen Trucking Services
        </span>
        <button
          type="button"
          onClick={onLogout}
          aria-label="Logout"
          title="Logout"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  );
}