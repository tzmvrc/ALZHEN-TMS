import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { saveMasterData } from "../../services/master-data.service";
import { fetchCompanyOptions, type CompanyOption } from "../../services/user-management.service";

const fieldClass = "mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-[#2678b9] focus:ring-2 focus:ring-[#2678b9]/15";

export default function VehicleManagementModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { accessToken } = useAuth();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyError, setCompanyError] = useState("");
  const [form, setForm] = useState({ plate_number: "", truck_type: "", capacity_cbm: "", trucking_company_id: "", status: "ACTIVE", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    void fetchCompanyOptions(accessToken).then((options) => {
      if (active) setCompanies(options);
    }).catch(() => {
      if (active) setCompanyError("Unable to load trucking companies. You can save the vehicle without a company.");
    });
    return () => { active = false; };
  }, [accessToken]);

  const change = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!accessToken) { setError("Your session has expired. Please log in again."); return; }
    if (!form.plate_number.trim()) { setError("Enter a plate number."); return; }
    const capacity = form.capacity_cbm.trim() ? Number(form.capacity_cbm) : null;
    if (capacity !== null && (!Number.isFinite(capacity) || capacity < 0)) { setError("Enter a valid capacity of zero or greater."); return; }
    setSaving(true);
    setError("");
    try {
      await saveMasterData(accessToken, "trucks", {
        plate_number: form.plate_number.trim(),
        truck_type: form.truck_type.trim() || null,
        capacity_cbm: capacity,
        trucking_company_id: form.trucking_company_id || null,
        status: form.status,
        notes: form.notes.trim() || null,
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save vehicle.");
    } finally { setSaving(false); }
  };

  return <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-900/20 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <form onSubmit={(event) => void submit(event)} role="dialog" aria-modal="true" aria-labelledby="vehicle-modal-title" className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_60px_rgba(11,35,65,0.28)] sm:rounded-2xl">
      <header className="flex items-start justify-between gap-3">
        <div><h2 id="vehicle-modal-title" className="text-lg font-semibold text-[#0b2341]">Add vehicle</h2><p className="mt-1 text-xs text-slate-500">Enter the vehicle details.</p></div>
        <button type="button" onClick={onClose} disabled={saving} className="rounded-full px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100">Close</button>
      </header>
      <fieldset disabled={saving} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-600">Plate number<input autoFocus required value={form.plate_number} onChange={(event) => change("plate_number", event.target.value)} className={fieldClass} /></label>
        <label className="text-xs font-medium text-slate-600">Truck type<input value={form.truck_type} onChange={(event) => change("truck_type", event.target.value)} className={fieldClass} /></label>
        <label className="text-xs font-medium text-slate-600">Capacity (CBM)<input type="number" min="0" step="any" value={form.capacity_cbm} onChange={(event) => change("capacity_cbm", event.target.value)} className={fieldClass} /></label>
        <label className="text-xs font-medium text-slate-600">Trucking company<select value={form.trucking_company_id} onChange={(event) => change("trucking_company_id", event.target.value)} className={fieldClass}><option value="">No company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        {companyError && <p role="status" className="text-xs text-amber-700 sm:col-span-2">{companyError}</p>}
        <label className="text-xs font-medium text-slate-600">Status<select value={form.status} onChange={(event) => change("status", event.target.value)} className={fieldClass}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
        <label className="text-xs font-medium text-slate-600 sm:col-span-2">Notes<textarea value={form.notes} onChange={(event) => change("notes", event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 p-3 text-sm" /></label>
      </fieldset>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      <footer className="mt-5 flex justify-end gap-2">
        <button type="button" disabled={saving} onClick={onClose} className="rounded-full border border-slate-200 px-4 py-2 text-sm">Cancel</button>
        <button disabled={saving} className="rounded-full bg-[#ffd43b] px-4 py-2 text-sm font-semibold text-[#0b2341] disabled:opacity-50">{saving ? "Saving…" : "Save vehicle"}</button>
      </footer>
    </form>
  </div>;
}
