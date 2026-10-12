import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, MoreHorizontal, RefreshCw, Search, SlidersHorizontal, UserRound, Pencil, Plus, X } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { tableUi } from "../../../components/admin/dashboardStyles";
import SlidingSegmentedControl from "../../../components/admin/SlidingSegmentedControl";
import TruckerDetailDrawer from "../../../components/admin/TruckerDetailDrawer";
import { apiGetCached, invalidateApiCache, type ApiResponse } from "../../../services/api.service";
import { fetchTruckerDetail, fetchTruckers, type TruckerListItem } from "../../../services/trucker.service";
import UserManagementModal from "../../../components/admin/UserManagementModal";
import { fetchManagedUsers, type ManagedUser } from "../../../services/user-management.service";
import { subscribeToAdminRealtime } from "../../../services/realtime.service";

const PAGE_SIZE = 12;
const userCategoryOptions = [
  { value: "staff", label: "Admin & Staff" },
  { value: "truckers", label: "Truckers" },
] as const;

type ProfileLookupRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  role: string | null;
  is_admin: boolean | null;
  profile_picture_url?: string | null;
};
type AdminStaffProfile = ProfileLookupRow & { role: "ADMIN" | "STAFF" };

function formatAvatarPath(path: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return null;
}

export default function TruckersView() {
  const { accessToken, profile } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<"staff" | "truckers">(() => profile?.role === "ADMIN" ? "staff" : "truckers");
  const category = profile?.role === "ADMIN" ? selectedCategory : "truckers";
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
  const [detailLoading, setDetailLoading] = useState(false);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => subscribeToAdminRealtime((event) => {
    if (event.kind === "resume") return;
    const table = event.kind === "recovered" ? event.table : event.payload.table;
    if (["profiles", "drivers", "trips", "trip_truck_assignments"].includes(table)) {
      setRefreshVersion((version) => version + 1);
    }
  }), []);

  useEffect(() => {
    if (!accessToken || profile?.role !== "ADMIN") return;
    let active = true;
    void fetchManagedUsers(accessToken).then((users) => { if (active) setManagedUsers(users); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load user details."); });
    return () => { active = false; };
  }, [accessToken, profile?.role, refreshVersion]);

  useEffect(() => {
    if (!accessToken || category !== "staff") return;
    let active = true;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const [adminResponse, staffResponse] = await Promise.all([
          apiGetCached<ApiResponse<ProfileLookupRow[]>>("/lookups/profiles?role=ADMIN", accessToken, 60_000),
          apiGetCached<ApiResponse<ProfileLookupRow[]>>("/lookups/profiles?role=STAFF", accessToken, 60_000),
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
    setDetail(null);
    setDetailLoading(true);
    void (async () => {
      try {
        const nextDetail = await fetchTruckerDetail(accessToken, selectedId);
        if (active) setDetail(nextDetail);
      } catch {
        if (active) setDetail(null);
      } finally {
        if (active) setDetailLoading(false);
      }
    })();
    return () => { active = false; };
  }, [accessToken, category, selectedId]);

  const visibleUserCategories = profile?.role === "ADMIN"
    ? userCategoryOptions
    : userCategoryOptions.filter((option) => option.value === "truckers");
  const matchingProfiles = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return profiles.filter((profile) => {
      return !term || `${profile.full_name} ${profile.role}`.toLocaleLowerCase().includes(term);
    });
  }, [profiles, search]);
  const visibleProfiles = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return matchingProfiles.slice(start, start + PAGE_SIZE);
  }, [matchingProfiles, page]);
  const visibleTotalPages = category === "staff"
    ? Math.max(1, Math.ceil(matchingProfiles.length / PAGE_SIZE))
    : totalPages;

  function refreshList() {
    invalidateApiCache("/lookups/profiles");
    invalidateApiCache("/truckers");
    setActionsOpen(false);
    setRefreshVersion((current) => current + 1);
  }

  function changeCategory(next: "staff" | "truckers") {
    setSelectedCategory(next);
    setPage(1);
    setSearch("");
    setSelectedId(null);
  }

  return (
    <div className="space-y-4">
      {notice && <div role="status" className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}
      <div>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <SlidingSegmentedControl
              aria-label="User category"
              options={visibleUserCategories}
              value={category}
              onChange={(value) => {
                if (value === "truckers" || profile?.role === "ADMIN") changeCategory(value);
              }}
            />
            {category !== "staff" && (
              <>
                <div className="relative">
                  <SlidersHorizontal aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select aria-label="Filter truckers by status" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }} className={`${tableUi.select} pl-9`}>
                    <option value="all">All status</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
                <select aria-label="Filter truckers by assignment" value={assignment} onChange={(event) => { setPage(1); setAssignment(event.target.value as "all" | "assigned" | "unassigned"); }} className={`${tableUi.select} pr-4`}>
                  <option value="all">All assignments</option>
                  <option value="assigned">Assigned</option>
                  <option value="unassigned">Unassigned</option>
                </select>
              </>
            )}
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <label className="relative min-w-[200px] flex-1 sm:flex-none xl:w-72">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder={category === "staff" ? "Search admin or staff" : "Search truckers"} className={tableUi.search} />
            </label>
            <div className="relative">
              <button type="button" aria-label="User list options" aria-haspopup="menu" aria-expanded={actionsOpen} onClick={() => setActionsOpen((current) => !current)} className={tableUi.iconBtn} title="User list options"><MoreHorizontal aria-hidden="true" className="h-5 w-5" /></button>
              {actionsOpen && <div role="menu" className="absolute right-0 top-11 z-30 min-w-44 rounded-2xl border border-slate-100 bg-white p-1 shadow-[0_16px_40px_-12px_rgba(11,35,65,0.2)]"><button type="button" role="menuitem" onClick={refreshList} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><RefreshCw aria-hidden="true" className="h-4 w-4" />Refresh list</button></div>}
            </div>
            <div className="flex items-center gap-2 pl-1">
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="h-10 rounded-full bg-white px-4 text-sm text-slate-600 shadow-[0_1px_2px_rgba(11,35,65,0.06)] transition hover:text-[#0b2341] disabled:cursor-not-allowed disabled:opacity-40">Prev</button>
              <span className="whitespace-nowrap text-sm text-slate-600">Page {page} / {visibleTotalPages}</span>
              <button type="button" onClick={() => setPage((current) => Math.min(visibleTotalPages, current + 1))} disabled={page >= visibleTotalPages} className="h-10 rounded-full bg-white px-4 text-sm text-slate-600 shadow-[0_1px_2px_rgba(11,35,65,0.06)] transition hover:text-[#0b2341] disabled:cursor-not-allowed disabled:opacity-40">Next</button>
            </div>
            {profile?.role === "ADMIN" && <button type="button" onClick={() => { setEditingUser(null); setUserModalOpen(true); }} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#ffd43b] px-4 text-sm font-semibold text-[#0b2341] hover:bg-[#f2c200]"><Plus className="h-4 w-4" />Add user</button>}
          </div>
        </div>
      </div>

      <div className={tableUi.shell}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className={tableUi.thead}>
              <tr>{category === "staff" ? <><th className={tableUi.th}>User</th><th className={tableUi.th}>Email</th><th className={tableUi.th}>Role</th><th className={tableUi.th}>Actions</th></> : <><th className={tableUi.th}>User</th><th className={tableUi.th}>Contact</th><th className={tableUi.th}>Assigned truck</th><th className={tableUi.th}>Current trip</th><th className={tableUi.th}>Delivery status</th><th className={tableUi.th}>Actions</th></>}</tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, index) => (
                <tr key={`skeleton-${index}`} className={tableUi.row}><td className="px-4 py-3"><div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" /></td><td className="px-4 py-3"><div className="h-4 w-32 animate-pulse rounded bg-slate-200" /></td><td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded bg-slate-200" /></td><td className="px-4 py-3"><div className="h-4 w-28 animate-pulse rounded bg-slate-200" /></td><td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-slate-200" /></td></tr>
              )) : error ? (
                <tr><td colSpan={category === "staff" ? 4 : 6} role="alert" className="px-4 py-12 text-center text-sm text-rose-700">{error}</td></tr>
              ) : category === "staff" ? visibleProfiles.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-16 text-center text-sm text-slate-400">No admin or staff users found.</td></tr>
              ) : visibleProfiles.map((profile) => (
                <tr key={profile.id} className={tableUi.row}>
                  <td className="px-4 py-3.5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[#e6f0f9]">{profile.profile_picture_url ? <img src={profile.profile_picture_url} alt="" className="h-full w-full object-cover" /> : <UserRound aria-hidden="true" className="h-5 w-5 text-[#2678b9]" />}</div><div><div className="text-[13px] font-medium text-[#0b2341]">{profile.full_name}</div><div className="text-xs text-slate-500">{profile.role === "ADMIN" && profile.is_admin ? "Admin" : profile.role === "ADMIN" ? "Administrator" : "Staff"}</div></div></div></td>
                  <td className={tableUi.td}>{managedUsers.find((item) => item.id === profile.id)?.email ?? "—"}</td><td className={tableUi.td}>{profile.role}</td><td className={tableUi.td}>{managedUsers.some((item) => item.id === profile.id) && <button type="button" aria-label={`Edit ${profile.full_name}`} onClick={() => { setEditingUser(managedUsers.find((item) => item.id === profile.id) ?? null); setUserModalOpen(true); }} className={tableUi.iconBtn}><Pencil className="h-4 w-4" /></button>}</td>
                </tr>
              )) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-16 text-center text-sm text-slate-400">No truckers found.</td></tr>
              ) : rows.map((trucker) => {
                const avatar = managedUsers.find((item) => item.id === trucker.profile_id)?.profile_picture_url ?? formatAvatarPath(trucker.profile_picture_path);
                return (
                  <tr key={trucker.id} onClick={() => { setDetail(null); setDetailLoading(true); setSelectedId(trucker.id); }} className={`cursor-pointer ${tableUi.row}`}>
                    <td className="px-4 py-3.5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[#e6f0f9]">{avatar ? <img src={avatar} alt={trucker.full_name} className="h-full w-full object-cover" /> : <UserRound aria-hidden="true" className="h-5 w-5 text-[#2678b9]" />}</div><div><div className="text-[13px] font-medium text-[#0b2341]">{trucker.full_name}</div><div className="text-xs text-slate-500">{trucker.email || "No email"}</div></div></div></td>
                    <td className={tableUi.td}>{trucker.contact_number || "—"}</td><td className={tableUi.td}>{trucker.plate_number || "—"}</td><td className={tableUi.td}>{trucker.active_trip_number || "—"}</td><td className={tableUi.td}>{trucker.delivery_status || trucker.current_trip_status || "—"}</td><td className={tableUi.td}><button type="button" aria-label={`Edit ${trucker.full_name}`} onClick={(event) => { event.stopPropagation(); const managed = managedUsers.find((item) => item.id === trucker.profile_id); if (managed) { setEditingUser(managed); setUserModalOpen(true); } else setError("Unable to load this user account for editing."); }} className={tableUi.iconBtn}><Pencil className="h-4 w-4" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedId && (detail || detailLoading) ? <TruckerDetailDrawer trucker={detail} loading={detailLoading} onClose={() => setSelectedId(null)} /> : null}
      {userModalOpen && <UserManagementModal user={editingUser} onClose={() => setUserModalOpen(false)} onSaved={(message) => { setUserModalOpen(false); setNotice(message ?? "User saved successfully."); refreshList(); }} />}
    </div>
  );
}
