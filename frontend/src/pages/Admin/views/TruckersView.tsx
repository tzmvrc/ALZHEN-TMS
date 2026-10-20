import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal, UserRound, Pencil, Plus, X } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { tableUi } from "../../../components/admin/dashboardStyles";
import SlidingSegmentedControl from "../../../components/admin/SlidingSegmentedControl";
import TruckerDetailDrawer from "../../../components/admin/TruckerDetailDrawer";
import { getCachedApiResponse,invalidateApiCache,cacheApiSnapshot,apiCacheGeneration, type ApiResponse } from "../../../services/api.service";
import { fetchTruckerDetail, getCachedTruckerDetail,truckerDetailFromSummary,type TruckerListItem } from "../../../services/trucker.service";
import UserManagementModal from "../../../components/admin/UserManagementModal";
import { fetchUsersDirectory,getCachedUsersDirectory,filterDirectoryTruckers,type ManagedUser } from "../../../services/user-management.service";
import { subscribeToAdminRealtime } from "../../../services/realtime.service";
import { useDeferredRealtimeRefresh } from "../../../components/admin/useDeferredRealtimeRefresh";

import { useManagementTableColumns } from "../../../components/admin/useManagementTableColumns";

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

export default function TruckersView(){
 const {accessToken,profile}=useAuth();
 return <UsersTable key={`${profile?.id}:${profile?.role}:${accessToken??""}`}/>;
}
function UsersTable() {
  const { accessToken, profile } = useAuth();
  const preferencesKey=`/screen-state/account-table/${profile?.role??"none"}`;
  const saved=accessToken?getCachedApiResponse<{category:"staff"|"truckers";search:string;status:string;assignment:"all"|"assigned"|"unassigned"}>(preferencesKey,accessToken,300000):null;
  const [selectedCategory, setSelectedCategory] = useState<"staff" | "truckers">(() => saved?.category??(profile?.role === "ADMIN" ? "staff" : "truckers"));
  const category = profile?.role === "ADMIN" ? selectedCategory : "truckers";
  const [search, setSearch] = useState(saved?.search??"");
  const [status, setStatus] = useState(saved?.status??"all");
  const [assignment, setAssignment] = useState<"all" | "assigned" | "unassigned">(saved?.assignment??"all");
  useEffect(()=>{if(accessToken)cacheApiSnapshot(preferencesKey,accessToken,{category,search,status,assignment},apiCacheGeneration());},[accessToken,preferencesKey,category,search,status,assignment]);
  const cachedDirectory=useMemo(()=>accessToken?getCachedUsersDirectory(accessToken,profile?.role??""):null,[accessToken,profile?.role]);
  const [rows, setRows] = useState<TruckerListItem[]>(cachedDirectory?.truckers??[]);
  const [loading, setLoading] = useState(!cachedDirectory);
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchTruckerDetail>> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError,setDetailError]=useState("");
  const [localManagedUsers, setManagedUsers] = useState<ManagedUser[]>(()=>accessToken&&profile?.role==="ADMIN"?getCachedApiResponse<ApiResponse<ManagedUser[]>>("/users",accessToken,5*60_000)?.data??[]:[]);
  const managedUsers=useMemo(()=>profile?.role==="ADMIN"?localManagedUsers:[],[profile?.role,localManagedUsers]);
  const profiles=useMemo<AdminStaffProfile[]>(()=>managedUsers.filter(user=>user.role==="ADMIN"||user.role==="STAFF").map(user=>({...user,role:user.role as "ADMIN"|"STAFF",full_name:[user.first_name,user.last_name].filter(Boolean).join(" ")||"Name not recorded"})),[managedUsers]);
  const visibleTruckers=useMemo(()=>filterDirectoryTruckers(rows,search,status,assignment),[rows,search,status,assignment]);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [notice, setNotice] = useState("");
  const tableColumns = useMemo(() => (category === "staff" ? ["User", "Email", "Role", "Actions"] : ["User", "Contact", "Assigned truck", "Current trip", "Delivery status", "Actions"]).map((title) => ({ key: title.toLowerCase().replaceAll(" ", "-"), title, width: title === "User" ? 280 : title === "Actions" ? 110 : 200 })), [category]);
  const { attachViewport, viewportProps, tableStyle, controls: columnControls, hiddenControl, colgroup, headerProps, headerControls, orderedColumns, renderCells } = useManagementTableColumns({ table: `users:${category}`, token: accessToken, profileId: profile?.id, columns: tableColumns, paused: Boolean(userModalOpen || selectedId), enabled: ["ADMIN", "STAFF"].includes(profile?.role ?? ""),rowSearch:{value:search,onSearch:setSearch,placeholder:"Search users or columns…"} });
  const realtimeGate = useDeferredRealtimeRefresh(() => setRefreshVersion((version) => version + 1), userModalOpen);

  useEffect(() => subscribeToAdminRealtime((event) => {
    if (event.kind === "batch") {
      if (event.tables.some((table) => ["profiles", "drivers", "trips", "trip_stops", "trip_truck_assignments", "trucks"].includes(table))) realtimeGate.request();
      return;
    }
    if (event.kind === "resume") { invalidateApiCache("/users");invalidateApiCache("/truckers");realtimeGate.request(); return; }
    const table = event.kind === "recovered" ? event.table : event.payload.table;
    if (["profiles", "drivers", "trips", "trip_stops", "trip_truck_assignments", "trucks"].includes(table)) {
      realtimeGate.request();
    }
  }), [realtimeGate]);

  useEffect(() => {
    const role=profile?.role??"";
    if(!accessToken||!["ADMIN","STAFF"].includes(role))return;
    let active=true;
    queueMicrotask(()=>{if(active){setLoading(!getCachedUsersDirectory(accessToken,role));setError("");}});
    void fetchUsersDirectory(accessToken,role).then(directory=>{
      if(active){setManagedUsers(directory.users);setRows(directory.truckers);setSelectedId(current=>current&&!directory.truckers.some(row=>row.id===current)?null:current);}
    }).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"Unable to load users.");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[accessToken,profile?.role,refreshVersion]);

  useEffect(() => {
    if (!selectedId || !accessToken || category !== "truckers") {
      queueMicrotask(()=>setDetail(null));
      return;
    }
    let active = true;
    const cached=getCachedTruckerDetail(accessToken,selectedId);
    const summary=rows.find(row=>row.id===selectedId);
    queueMicrotask(()=>{if(active){setDetailError("");setDetail(previous=>cached??(summary?truckerDetailFromSummary(summary,previous):previous?.id===selectedId?previous:null));setDetailLoading(!cached);}});
    void (async () => {
      try {
        const nextDetail = await fetchTruckerDetail(accessToken, selectedId);
        if (active) setDetail(nextDetail);
      } catch (cause) {
        if (active) {const message=cause instanceof Error?cause.message:"Unable to refresh user details. Previous details are retained.";setError(message);setDetailError(message);}
      } finally {
        if (active) setDetailLoading(false);
      }
    })();
    return () => { active = false; };
  }, [accessToken, category, selectedId, refreshVersion, rows]);

  const visibleUserCategories = profile?.role === "ADMIN"
    ? userCategoryOptions
    : userCategoryOptions.filter((option) => option.value === "truckers");
  const matchingProfiles = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return profiles.filter((profile) => {
      return !term || `${profile.full_name} ${profile.role}`.toLocaleLowerCase().includes(term);
    });
  }, [profiles, search]);
  function refreshList() {
    invalidateApiCache("/users");
    invalidateApiCache("/lookups/profiles");
    invalidateApiCache("/truckers");
    setRefreshVersion((current) => current + 1);
  }

  function changeCategory(next: "staff" | "truckers") {
    setSelectedCategory(next);
    setSearch("");
    setSelectedId(null);
  }

  return (
    <div className="space-y-4">
      {notice && <div role="status" className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-800">{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}
      <div>
        <div className="relative z-20 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
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
                  <select aria-label="Filter truckers by status" value={status} onChange={(event) => setStatus(event.target.value)} className={`${tableUi.select} pl-9`}>
                    <option value="all">All status</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
                <select aria-label="Filter truckers by assignment" value={assignment} onChange={(event) => setAssignment(event.target.value as "all" | "assigned" | "unassigned")} className={`${tableUi.select} pr-4`}>
                  <option value="all">All assignments</option>
                  <option value="assigned">Assigned</option>
                  <option value="unassigned">Unassigned</option>
                </select>
              </>
            )}
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {columnControls}
            {profile?.role === "ADMIN" && <button type="button" onClick={() => { setEditingUser(null); setUserModalOpen(true); }} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#ffd43b] px-4 text-sm font-semibold text-[#0b2341] hover:bg-[#f2c200]"><Plus className="h-4 w-4" />Add user</button>}
          </div>
        </div>
      </div>

      {error && (category==="staff" ? profiles.length>0 : rows.length>0) && <div role="alert" className="flex items-center justify-between rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button type="button" onClick={refreshList} className="underline">Retry</button></div>}
      <div className={`${tableUi.shell} relative z-0 !rounded-sm`}>
        <div ref={attachViewport} {...viewportProps} className="overflow-x-auto">
          <table style={tableStyle} className="min-w-full text-left">{colgroup}
            <thead className={tableUi.thead}>
              <tr>{orderedColumns.map((column) => <th key={column.key} {...headerProps(column.key)} className={tableUi.th}>{column.title}{headerControls(column)}</th>)}</tr>
            </thead>
            <tbody>
              {loading && !(category==="staff" ? profiles.length : rows.length) ? Array.from({ length: 5 }).map((_, index) => (
                <tr key={`skeleton-${index}`} className={tableUi.row}>{orderedColumns.map((column) => <td key={column.key} className="px-4 py-3"><div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" /></td>)}</tr>
              )) : error && !(category==="staff" ? profiles.length : rows.length) ? (
                <tr><td colSpan={category === "staff" ? 4 : 6} role="alert" className="px-4 py-12 text-center text-sm text-rose-700">{error}</td></tr>
              ) : category === "staff" ? matchingProfiles.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-16 text-center text-sm text-slate-400">No admin or staff users found.</td></tr>
              ) : matchingProfiles.map((profile) => (
                <tr key={profile.id} className={tableUi.row}>
                  {renderCells(<> <td className="px-4 py-3.5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[#e6f0f9]">{profile.profile_picture_url ? <img src={profile.profile_picture_url} alt="" className="h-full w-full object-cover" /> : <UserRound aria-hidden="true" className="h-5 w-5 text-[#2678b9]" />}</div><div><div className="text-[13px] font-medium text-[#0b2341]">{profile.full_name}</div><div className="text-xs text-slate-500">{profile.role === "ADMIN" && profile.is_admin ? "Admin" : profile.role === "ADMIN" ? "Administrator" : "Staff"}</div></div></div></td>
                  <td className={tableUi.td}>{managedUsers.find((item) => item.id === profile.id)?.email ?? "—"}</td><td className={tableUi.td}>{profile.role}</td><td className={tableUi.td}>{managedUsers.some((item) => item.id === profile.id) && <button type="button" aria-label={`Edit ${profile.full_name}`} onClick={() => { setEditingUser(managedUsers.find((item) => item.id === profile.id) ?? null); setUserModalOpen(true); }} className={tableUi.iconBtn}><Pencil className="h-4 w-4" /></button>}</td>
                </>)} </tr>
              )) : visibleTruckers.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-16 text-center text-sm text-slate-400">No truckers found.</td></tr>
              ) : visibleTruckers.map((trucker) => {
                const avatar = managedUsers.find((item) => item.id === trucker.profile_id)?.profile_picture_url ?? formatAvatarPath(trucker.profile_picture_path);
                return (
                  <tr key={trucker.id} onClick={() => { const cached=accessToken?getCachedTruckerDetail(accessToken,trucker.id):null;setDetail(cached??truckerDetailFromSummary({...trucker,profile_picture_path:avatar??trucker.profile_picture_path}));setDetailLoading(!cached);setSelectedId(trucker.id); }} className={`cursor-pointer ${tableUi.row}`}>
                    {renderCells(<> <td className="px-4 py-3.5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[#e6f0f9]">{avatar ? <img src={avatar} alt={trucker.full_name} className="h-full w-full object-cover" /> : <UserRound aria-hidden="true" className="h-5 w-5 text-[#2678b9]" />}</div><div><div className="text-[13px] font-medium text-[#0b2341]">{trucker.full_name}</div><div className="text-xs text-slate-500">{trucker.email || "No email"}</div></div></div></td>
                    <td className={tableUi.td}>{trucker.contact_number || "—"}</td><td className={tableUi.td}>{trucker.plate_number || "—"}</td><td className={tableUi.td}>{trucker.active_trip_number || "—"}</td><td className={tableUi.td}>{trucker.delivery_status || trucker.current_trip_status || "—"}</td><td className={tableUi.td}>{profile?.role==="ADMIN"&&<button type="button" aria-label={`Edit ${trucker.full_name}`} onClick={(event) => { event.stopPropagation(); const managed = managedUsers.find((item) => item.id === trucker.profile_id); if (managed) { setEditingUser(managed); setUserModalOpen(true); } else setError("Unable to load this user account for editing."); }} className={tableUi.iconBtn}><Pencil className="h-4 w-4" /></button>}</td>
                  </>)} </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {hiddenControl}
      </div>

      {selectedId && (detail || detailLoading) ? <TruckerDetailDrawer trucker={detail} loading={detailLoading} error={detailError} onClose={() => setSelectedId(null)} /> : null}
      {userModalOpen && <UserManagementModal user={editingUser} onClose={() => setUserModalOpen(false)} onSaved={(message) => { setUserModalOpen(false); setNotice(message ?? "User saved successfully."); refreshList(); }} />}
    </div>
  );
}
