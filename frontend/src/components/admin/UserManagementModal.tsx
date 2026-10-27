import {canChangeAccountPicture} from "../../services/account-picture-permissions";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { createManagedUser, fetchCompanyOptions, updateManagedUser, uploadManagedProfilePicture, type CompanyOption, type ManagedUser, type UserInput } from "../../services/user-management.service";

const fieldClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#2678b9] focus:ring-2 focus:ring-[#2678b9]/15";

export default function UserManagementModal({ user, onClose, onSaved }: { user?: ManagedUser | null; onClose: () => void; onSaved: (message?: string) => void }) {
  const { accessToken,profile:viewer } = useAuth();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [form, setForm] = useState({ first_name: user?.first_name ?? "", last_name: user?.last_name ?? "", email: user?.email ?? "", password: "", role: user?.role ?? "TRUCKER" as ManagedUser["role"], contact_number: user?.driver?.contact_number ?? user?.contact_number ?? "", license_number: user?.driver?.license_number ?? "", trucking_company_id: user?.driver?.trucking_company_id ?? "", driver_status: user?.driver?.status ?? "ACTIVE", driver_notes: user?.driver?.notes ?? "" });
  const [picture, setPicture] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const previewUrl = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const savedAccountId = useRef<string | null>(user?.id ?? null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    void fetchCompanyOptions(accessToken).then(setCompanies).catch(() => setCompanies([]));
  }, [accessToken]);
  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);

  const change = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!accessToken || submitting.current) return;
    submitting.current = true;
    setSaving(true); setError("");
    const input: UserInput = {
      first_name: form.first_name, last_name: form.last_name, email: form.email,
      role: user?.role ?? form.role, is_admin: (user?.role ?? form.role) === "ADMIN",
      ...(form.password ? { password: form.password } : {}),
      contact_number: form.contact_number, license_number: form.license_number,
      trucking_company_id: form.trucking_company_id || null, driver_status: form.driver_status, driver_notes: form.driver_notes,
    };
    try {
      const existingId = savedAccountId.current;
      const id = existingId ?? (await createManagedUser(accessToken, input)).user.id;
      savedAccountId.current = id;
      if (existingId) await updateManagedUser(accessToken, id, input);
      if (picture && mayChangePicture) {
        try { await uploadManagedProfilePicture(accessToken, id, picture); }
        catch { setError("Account details were saved, but the picture could not be uploaded. Retry Save user to attach it; the account will not be created again."); return; }
      }
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save user."); }
    finally { submitting.current = false; setSaving(false); }
  };
  const role = user?.role ?? form.role;
  const mayChangePicture=canChangeAccountPicture(viewer,{id:user?.id??savedAccountId.current??"",role,account_status:user?.account_status,deactivated_at:user?.deactivated_at});
  return <div className="fixed inset-0 z-[2000] flex items-end justify-center p-0 sm:items-center sm:p-4 al-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}><form onSubmit={(event) => void submit(event)} role="dialog" aria-modal="true" aria-labelledby="user-modal-title" className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_60px_rgba(11,35,65,0.28)] sm:rounded-2xl"><header className="flex items-start justify-between gap-3"><div><h2 id="user-modal-title" className="text-lg font-semibold text-[#0b2341]">{user ? "Edit user" : "Add user"}</h2><p className="mt-1 text-xs text-slate-500">Create and manage application accounts.</p></div><button type="button" onClick={onClose} disabled={saving} className="rounded-full px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100">Close</button></header>
    {mayChangePicture&&<div className="mt-4 flex items-center gap-3"><div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-[#e6f0f9]">{preview || user?.profile_picture_url ? <img src={preview ?? user?.profile_picture_url ?? ""} alt="Profile preview" className="h-full w-full object-cover" /> : <span className="text-lg font-semibold text-[#2678b9]">{form.first_name.charAt(0).toUpperCase() || "U"}</span>}</div><label className="text-xs font-medium text-slate-600">Profile picture<input type="file" accept="image/png,image/jpeg,image/webp" disabled={saving} onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)) { setError("Choose a JPEG, PNG or WebP image up to 5 MB."); event.target.value=""; return; } setError(""); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); previewUrl.current = file ? URL.createObjectURL(file) : null; setPicture(file); setPreview(previewUrl.current); }} className="mt-1 block max-w-full text-xs" /></label></div>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium text-slate-600">First name<input required value={form.first_name} onChange={(event) => change("first_name", event.target.value)} className={`${fieldClass} mt-1`} /></label><label className="text-xs font-medium text-slate-600">Last name<input required value={form.last_name} onChange={(event) => change("last_name", event.target.value)} className={`${fieldClass} mt-1`} /></label><label className="text-xs font-medium text-slate-600">Email<input required type="email" value={form.email} onChange={(event) => change("email", event.target.value)} className={`${fieldClass} mt-1`} /></label>{!user && <label className="text-xs font-medium text-slate-600">Temporary password<input required minLength={8} type="password" value={form.password} onChange={(event) => change("password", event.target.value)} className={`${fieldClass} mt-1`} autoComplete="new-password" /></label>}{role !== "TRUCKER" && <label className="text-xs font-medium text-slate-600">Contact number<input value={form.contact_number} onChange={(event) => change("contact_number", event.target.value)} className={`${fieldClass} mt-1`} /></label>}<div className="text-xs font-medium text-slate-600"><span>Role</span><div className="mt-1 inline-flex h-10 items-center gap-1 rounded-full bg-slate-100 p-1">{(["ADMIN", "STAFF", "TRUCKER"] as const).map((option) => <button key={option} type="button" disabled={Boolean(user)||Boolean(savedAccountId.current)} aria-pressed={role === option} onClick={() => change("role", option)} className={`rounded-full px-3 py-2 text-xs font-semibold transition ${role === option ? "bg-[#0b2341] text-white" : "text-slate-500 hover:text-[#0b2341]"} disabled:cursor-default`}>{option === "ADMIN" ? "Admin" : option === "STAFF" ? "Staff" : "Trucker"}</button>)}</div>{user && <span className="mt-1 block text-[11px] text-slate-400">Role cannot be changed for an existing account.</span>}</div>
      {role === "TRUCKER" && <><label className="text-xs font-medium text-slate-600">Contact number<input value={form.contact_number} onChange={(event) => change("contact_number", event.target.value)} className={`${fieldClass} mt-1`} /></label><label className="text-xs font-medium text-slate-600">License number<input value={form.license_number} onChange={(event) => change("license_number", event.target.value)} className={`${fieldClass} mt-1`} /></label><label className="text-xs font-medium text-slate-600">Trucking company<select value={form.trucking_company_id} onChange={(event) => change("trucking_company_id", event.target.value)} className={`${fieldClass} mt-1`}><option value="">No company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label className="text-xs font-medium text-slate-600">Driver status<select value={form.driver_status} onChange={(event) => change("driver_status", event.target.value)} className={`${fieldClass} mt-1`}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label><label className="text-xs font-medium text-slate-600 sm:col-span-2">Notes<textarea value={form.driver_notes} onChange={(event) => change("driver_notes", event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 p-3 text-sm" /></label></>}
    </div>{error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}<footer className="mt-5 flex justify-end gap-2"><button type="button" disabled={saving} onClick={onClose} className="rounded-full border border-slate-200 px-4 py-2 text-sm">Cancel</button><button disabled={saving} className="rounded-full bg-[#ffd43b] px-4 py-2 text-sm font-semibold text-[#0b2341] disabled:opacity-50">{saving ? "Saving…" : "Save user"}</button></footer>
  </form></div>;
}
