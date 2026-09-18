import { LogOut, Truck } from "lucide-react";
import type { NavItem } from "../../types/dashboard";

export interface SidebarNavProps {
  general: NavItem[];
  support: NavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  onLogout?: () => void;
  brandName?: string;
  brandSubtitle?: string;
  userName?: string;
  userRole?: string;
  userInitial?: string;
}

export default function SidebarNav({
  general,
  support,
  activeId,
  onNavigate,
  onLogout = () => {},
  brandName = "ALZHEN",
  brandSubtitle = "TMS Control",
  userName = "Operations Admin",
  userRole = "Dispatch Control",
  userInitial = "A",
}: SidebarNavProps) {
  const renderItems = (items: NavItem[]) =>
    items.map((item) => (
      <button
        key={item.id}
        type="button"
        onClick={() => onNavigate(item.id)}
        aria-current={item.id === activeId ? "page" : undefined}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
          item.id === activeId
            ? "bg-[#eaf2ff] text-[#2563d9] shadow-sm"
            : "text-slate-500 hover:bg-[#f2f6fb] hover:text-slate-900"
        }`}
      >
        <span className="flex h-4 w-4 items-center justify-center">{item.icon}</span>
        {item.label}
      </button>
    ));

  return (
    <aside className="fixed inset-y-4 left-4 z-30 hidden h-[calc(100vh-2rem)] w-[228px] shrink-0 flex-col rounded-[28px] border border-white/80 bg-white/90 px-4 py-5 shadow-[0_18px_50px_rgba(42,76,120,0.12)] backdrop-blur-xl lg:flex">
      <div className="mb-7 flex items-center gap-3 px-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 shadow-sm">
          <Truck className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">{brandName}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">{brandSubtitle}</p>
        </div>
      </div>

      <div className="mb-5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm">Operations workspace</div>
      <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Main menu</p>
      <nav aria-label="Operations navigation" className="space-y-1">
        {renderItems(general)}
      </nav>

      <p className="mb-2 mt-7 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Workspace</p>
      <nav aria-label="Support navigation" className="space-y-1">
        {renderItems(support)}
      </nav>

      <div className="mt-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
            {userInitial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{userName}</p>
            <p className="truncate text-xs text-slate-500">{userRole}</p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onLogout}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/50 px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-white"
      >
        <LogOut className="h-4 w-4" />
        Logout
      </button>
    </aside>
  );
}
