import { useMemo, useState } from "react";
import SidebarNav from "../../components/admin/SidebarNav";
import { PageIntro, TopBar } from "../../components/admin/DashboardPrimitives";
import type { DashboardData } from "../../types/dashboard";
import OverviewView from "./views/OverviewView";
import ResourceView from "./views/ResourceView";
import { defaultDashboardData } from "./data/defaultDashboardData";

export interface DashboardPageProps {
  data?: DashboardData;
  loading?: boolean;
  onNavigate?: (id: string) => void;
  onLogout?: () => void;
  onSearch?: (query: string) => void;
}

export default function DashboardPage({
  data = defaultDashboardData,
  loading = false,
  onNavigate = () => {},
  onLogout = () => {},
  onSearch = () => {},
}: DashboardPageProps) {
  const [activeId, setActiveId] = useState(data.nav.activeId);
  const [searchQuery, setSearchQuery] = useState("");
  const navItems = useMemo(() => [...data.nav.general, ...data.nav.support], [data.nav.general, data.nav.support]);
  const activeLabel = navItems.find((item) => item.id === activeId)?.label ?? "Overview";

  const filteredData = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return data;
    return {
      ...data,
      operations: {
        ...data.operations,
        dispatches: data.operations.dispatches.filter((row) => `${row.id} ${row.route} ${row.hub} ${row.driver}`.toLowerCase().includes(query)),
        incidents: data.operations.incidents.filter((row) => `${row.id} ${row.title} ${row.location}`.toLowerCase().includes(query)),
      },
    };
  }, [data, searchQuery]);

  const handleNavigate = (id: string) => {
    setActiveId(id);
    onNavigate(id);
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" /></div>;

  return (
    <div className="dotted-surface min-h-screen w-full text-slate-900">
      <div className="flex min-h-screen w-full overflow-hidden">
        <SidebarNav general={data.nav.general} support={data.nav.support} activeId={activeId} onNavigate={handleNavigate} onLogout={onLogout} userName={data.user.name} userInitial={data.user.name.charAt(0).toUpperCase()} />
        <div className="min-w-0 flex-1 overflow-y-auto lg:ml-[260px]">
          <TopBar activeLabel={activeLabel} onSearch={(query) => { setSearchQuery(query); onSearch(query); }} />
          <main className="p-4 sm:p-6 md:p-8 lg:p-10">
            {activeId === "overview" ? (
              <>
                <PageIntro title="Dispatch command center" subtitle="Monitor billing, delivery, POD, and exception activity across Luzon, Visayas, and Mindanao." />
                <OverviewView data={filteredData} />
              </>
            ) : (
              <ResourceView id={activeId} data={filteredData} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
