import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, RefreshCw, Search, SlidersHorizontal, UserRound } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import TruckerDetailDrawer from "../../../components/admin/TruckerDetailDrawer";
import { apiGetCached, invalidateApiCache, type ApiResponse } from "../../../services/api.service";
import { fetchTruckerDetail, fetchTruckers, type TruckerListItem } from "../../../services/trucker.service";

const PAGE_SIZE = 12;

type ProfileLookupRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  role: string | null;
  is_admin: boolean | null;
};
type AdminStaffProfile = ProfileLookupRow & { role: "ADMIN" | "STAFF" };

function formatAvatarPath(path: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return null;
}

export default function TruckersView() {
  const { accessToken } = useAuth();
  const [category, setCategory] = useState<"staff" | "truckers">("staff");
  const [roleFilter, setRoleFilter] = useState<"all" | "ADMIN" | "STAFF">("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [assignment, setAssignment] = useState<"all" | "assigned" | "unassigned">("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<TruckerListItem[]>([]);
  const [profiles, setProfiles] = useState<AdminStaffProfile[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchTruckerDetail>> | null>(null);

  useEffect(() => {
    if (!accessToken || category !== "staff") return;
    let active = true;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const [adminResponse, staffResponse] = await Promise.all([
          apiGetCached<ApiResponse<ProfileLookupRow[]>>("/lookup/profiles?role=ADMIN", accessToken, 60_000),
          apiGetCached<ApiResponse<ProfileLookupRow[]>>("/lookup/profiles?role=STAFF", accessToken, 60_000),
        ]);
        if (!adminResponse.success || !adminResponse.data || !staffResponse.success || !staffResponse.data) {
          throw new Error(adminResponse.message ?? staffResponse.message ?? "Unable to load staff profiles.");
        }
        if (!active) return;
        setProfiles([...adminResponse.data, ...staffResponse.data].filter((profile): profile is AdminStaffProfile =>
          (profile.role === "ADMIN" || profile.role === "STAFF") && Boolean(profile.id),
        ));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load staff profiles.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [accessToken, category, refreshVersion]);

  useEffect(() => {
    if (!accessToken || category !== "truckers") return;
    let active = true;
    setLoading(true);
    setError("");
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
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load truckers.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [accessToken, assignment, category, page, refreshVersion, search, status]);

  useEffect(() => {
    if (!selectedId || !accessToken || category !== "truckers") {
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
    return () => { active = false; };
  }, [accessToken, category, selectedId]);

  const matchingProfiles = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return profiles.filter((profile) => {
      if (roleFilter !== "all" && profile.role !== roleFilter) return false;
      return !term || `${profile.full_name} ${profile.role}`.toLocaleLowerCase().includes(term);
    });
  }, [profiles, roleFilter, search]);
  const visibleProfiles = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return matchingProfiles.slice(start, start + PAGE_SIZE);
  }, [matchingProfiles, page]);
  const visibleTotalPages = category === "staff"
    ? Math.max(1, Math.ceil(matchingProfiles.length / PAGE_SIZE))
    : totalPages;

  function refreshList() {
    invalidateApiCache("/lookup/profiles");
    invalidateApiCache("/truckers");
    setActionsOpen(false);
    setRefreshVersion((current) => current + 1);
  }

  function changeCategory(next: "staff" | "truckers") {
    setCategory(next);
    setPage(1);
    setSearch("");
    setSelectedId(null);
    setRoleFilter("all");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="User category" className="inline-flex rounded-lg bg-slate-100 p-1">
              <button type="button" aria-pressed={category === "staff"} onClick={() => changeCategory("staff")} className={`h-8 rounded-md px-3 text-sm font-medium transition ${category === "staff" ? "bg-white text-[#0b2341] shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>Admin &amp; Staff</button>
              <button type="button" aria-pressed={category === "truckers"} onClick={() => changeCategory("truckers")} className={`h-8 rounded-md px-3 text-sm font-medium transition ${category === "truckers" ? "bg-white text-[#0b2341] shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>Truckers</button>
            </div>
            {category === "staff" ? (
              <select aria-label="Filter by role" value={roleFilter} onChange={(event) => { setPage(1); setRoleFilter(event.target.value as "all" | "ADMIN" | "STAFF"); }} className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-slate-400">
                <option value="all">All roles</option>
                <option value="ADMIN">Admin</option>
                <option value="STAFF">Staff</option>
              </select>
            ) : (
              <>
                <div className="relative">
                  <SlidersHorizontal aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select aria-label="Filter truckers by status" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }} className="h-10 appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-8 text-sm text-slate-700 outline-none focus:border-slate-400">
                    <option value="all">All status</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
                <select aria-label="Filter truckers by assignment" value={assignment} onChange={(event) => { setPage(1); setAssignment(event.target.value as "all" | "assigned" | "unassigned"); }} className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none focus:border-slate-400">
                  <option value="all">All assignments</option>
                  <option value="assigned">Assigned</option>
                  <option value="unassigned">Unassigned</option>
                </select>
              </>
            )}
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <label className="relative min-w-[200px] flex-1 sm:flex-none xl:w-64">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder={category === "staff" ? "Search admin or staff" : "Search truckers"} className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-slate-400" />
            </label>
            <div className="relative">
              <button type="button" aria-label="User list options" aria-haspopup="menu" aria-expanded={actionsOpen} onClick={() => setActionsOpen((current) => !current)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]" title="User list options"><MoreHorizontal aria-hidden="true" className="h-5 w-5" /></button>
              {actionsOpen && <div role="menu" className="absolute right-0 top-11 z-30 min-w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"><button type="button" role="menuitem" onClick={refreshList} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><RefreshCw aria-hidden="true" className="h-4 w-4" />Refresh list</button></div>}
            </div>
            <div className="flex items-center gap-2 pl-1">
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Prev</button>
              <span className="whitespace-nowrap text-sm text-slate-600">Page {page} / {visibleTotalPages}</span>
              <button type="button" onClick={() => setPage((current) => Math.min(visibleTotalPages, current + 1))} disabled={page >= visibleTotalPages} className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Next</button>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              <tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Email / contact</th><th className="px-4 py-3">Assigned truck</th><th className="px-4 py-3">Current trip</th><th className="px-4 py-3">Delivery status</th></tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, index) => (
                <tr key={`skeleton-${index}`} className="border-t border-slate-100"><td className="px-4 py-3"><div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" /></td><td className="px-4 py-3"><div className="h-4 w-32 animate-pulse rounded bg-slate-200" /></td><td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded bg-slate-200" /></td><td className="px-4 py-3"><div className="h-4 w-28 animate-pulse rounded bg-slate-200" /></td><td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-slate-200" /></td></tr>
              )) : error ? (
                <tr><td colSpan={5} role="alert" className="px-4 py-12 text-center text-sm text-rose-700">{error}</td></tr>
              ) : category === "staff" ? visibleProfiles.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">No admin or staff users found.</td></tr>
              ) : visibleProfiles.map((profile) => (
                <tr key={profile.id} className="border-t border-slate-100 transition hover:bg-slate-50">
                  <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-100"><UserRound aria-hidden="true" className="h-5 w-5 text-slate-600" /></div><div><div className="font-medium text-slate-900">{profile.full_name}</div><div className="text-xs text-slate-500">{profile.role === "ADMIN" && profile.is_admin ? "Admin" : profile.role === "ADMIN" ? "Administrator" : "Staff"}</div></div></div></td>
                  <td className="px-4 py-3 text-slate-600">—</td><td className="px-4 py-3 text-slate-600">—</td><td className="px-4 py-3 text-slate-600">—</td><td className="px-4 py-3 text-slate-600">—</td>
                </tr>
              )) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">No truckers found.</td></tr>
              ) : rows.map((trucker) => {
                const avatar = formatAvatarPath(trucker.profile_picture_path);
                return (
                  <tr key={trucker.id} onClick={() => setSelectedId(trucker.id)} className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50">
                    <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">{avatar ? <img src={avatar} alt={trucker.full_name} className="h-full w-full object-cover" /> : <UserRound aria-hidden="true" className="h-5 w-5 text-slate-600" />}</div><div><div className="font-medium text-slate-900">{trucker.full_name}</div><div className="text-xs text-slate-500">{trucker.email || "No email"}</div></div></div></td>
                    <td className="px-4 py-3 text-slate-600">{trucker.contact_number || "—"}</td><td className="px-4 py-3 text-slate-600">{trucker.plate_number || "—"}</td><td className="px-4 py-3 text-slate-600">{trucker.active_trip_number || "—"}</td><td className="px-4 py-3 text-slate-600">{trucker.delivery_status || trucker.current_trip_status || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedId && detail ? <TruckerDetailDrawer trucker={detail} onClose={() => setSelectedId(null)} /> : null}
    </div>
  );
}
