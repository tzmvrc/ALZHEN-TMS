import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, UserRound } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import TruckerDetailDrawer from "../../../components/admin/TruckerDetailDrawer";
import { fetchTruckerDetail, fetchTruckers, type TruckerListItem } from "../../../services/trucker.service";

const PAGE_SIZE = 12;

function formatAvatarPath(path: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return null;
}

export default function TruckersView() {
  const { accessToken } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [assignment, setAssignment] = useState<"all" | "assigned" | "unassigned">("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<TruckerListItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchTruckerDetail>> | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const result = await fetchTruckers(accessToken, {
          search,
          status,
          assignment,
          page,
          limit: PAGE_SIZE,
        });
        if (!active) return;
        setRows(result.rows);
        setTotalPages(result.pagination.totalPages || 1);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [accessToken, search, status, assignment, page]);

  useEffect(() => {
    if (!selectedId || !accessToken) {
      setDetail(null);
      return;
    }

    let active = true;
    void (async () => {
      try {
        const nextDetail = await fetchTruckerDetail(accessToken, selectedId);
        if (active) setDetail(nextDetail);
      } catch {
        if (active) setDetail(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [accessToken, selectedId]);

  const tableRows = useMemo(() => rows, [rows]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => {
                  setPage(1);
                  setSearch(event.target.value);
                }}
                placeholder="Search trucker"
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-slate-400"
              />
            </div>
            <div className="relative">
              <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                value={status}
                onChange={(event) => {
                  setPage(1);
                  setStatus(event.target.value);
                }}
                className="h-10 appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-8 text-sm text-slate-700 outline-none focus:border-slate-400"
              >
                <option value="all">All status</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
            <select
              value={assignment}
              onChange={(event) => {
                setPage(1);
                const nextValue = event.target.value as "all" | "assigned" | "unassigned";
                setAssignment(nextValue);
              }}
              className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-slate-400"
            >
              <option value="all">All assignments</option>
              <option value="assigned">Assigned</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-sm text-slate-600">
              Page {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
              className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Trucker</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Assigned truck</th>
                <th className="px-4 py-3">Current trip</th>
                <th className="px-4 py-3">Delivery status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`skeleton-${index}`} className="border-t border-slate-100">
                    <td className="px-4 py-3"><div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-32 animate-pulse rounded bg-slate-200" /></td>
                    <td className="px-4 py-3"><div className="h-6 w-20 animate-pulse rounded-full bg-slate-200" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded bg-slate-200" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-28 animate-pulse rounded bg-slate-200" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-slate-200" /></td>
                  </tr>
                ))
              ) : tableRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">No truckers found.</td>
                </tr>
              ) : (
                tableRows.map((trucker) => {
                  const avatar = formatAvatarPath(trucker.profile_picture_path);
                  return (
                    <tr
                      key={trucker.id}
                      onClick={() => setSelectedId(trucker.id)}
                      className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                            {avatar ? (
                              <img src={avatar} alt={trucker.full_name} className="h-full w-full object-cover" />
                            ) : (
                              <UserRound className="h-5 w-5 text-slate-600" />
                            )}
                          </div>
                          <div>
                            <div className="font-medium text-slate-900">{trucker.full_name}</div>
                            <div className="text-xs text-slate-500">{trucker.email || "No email"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{trucker.contact_number || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${trucker.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                          {trucker.status || "INACTIVE"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{trucker.plate_number || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{trucker.active_trip_number || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{trucker.delivery_status || trucker.current_trip_status || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedId && detail ? (
        <TruckerDetailDrawer trucker={detail} onClose={() => setSelectedId(null)} />
      ) : null}
    </div>
  );
}
