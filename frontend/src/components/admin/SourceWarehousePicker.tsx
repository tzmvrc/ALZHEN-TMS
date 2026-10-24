import { useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import type { RelationshipOption } from "../../services/lookup.service";
import SearchableRelationshipEditor from "./SearchableRelationshipEditor";
import RelationshipCreateDialog from "./RelationshipCreateDialog";
import { tripSecondaryAction } from "./shared/TripModalUI";

/** Create explicitly through the existing master-data API, then retain its real ID. */
export default function SourceWarehousePicker({ token, source, value, matched, conflict, disabled, disabledReason, onSelect }: {
  token: string; source: string; value: string; matched: boolean; conflict: boolean;
  disabled: boolean; disabledReason?: string; onSelect: (option: RelationshipOption) => void;
}) {
  const { profile } = useAuth();
  const [creating, setCreating] = useState(false);
  const canCreate = ["ADMIN", "STAFF"].includes(profile?.role ?? "");
  return <div className="min-w-0 space-y-2">
    <SearchableRelationshipEditor presentation="form" token={token} kind="warehouses" autoFocus={false}
      value={value} disabled={disabled} onSelect={onSelect} onCommitBlur={() => {}} onCancel={() => {}} />
    {disabled && disabledReason && <p role="status" className="text-xs text-slate-600">{disabledReason}</p>}
    {!matched && <>
      <p className="text-xs text-amber-800">{conflict
        ? "Several warehouses match. Select the intended warehouse."
        : "No warehouse matches this CSV name. Select an existing warehouse or add it below."}</p>
      {canCreate && !conflict && <button type="button" disabled={disabled}
        className={`${tripSecondaryAction} max-w-full whitespace-normal text-left text-xs`}
        onClick={() => setCreating(true)}><Plus aria-hidden="true" size={14} />Add “{source}” as a warehouse</button>}
      {!canCreate && !conflict && <p className="text-xs text-slate-500">An admin or staff member can add this warehouse.</p>}
    </>}
    {creating && <RelationshipCreateDialog token={token} kind="warehouses" initialValue={source}
      onCancel={() => setCreating(false)} onCreated={option => { setCreating(false); onSelect(option); }} />}
  </div>;
}
