import { useEffect, useState } from "react";
import { fetchOperationsReporters, type OperationsReporter } from "../../services/operations-report.service";
import ReportDropdownEditor from "./ReportDropdownEditor";

export default function OperationsReporterEditor({ token, value, name, disabled, autoOpen = false, onSelect, onClose }: { token: string; value: string; name: string; disabled?: boolean; autoOpen?: boolean; onSelect: (id: string, name: string) => void; onClose?: () => void }) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<OperationsReporter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => {
      setLoading(true); setError("");
      void fetchOperationsReporters(token, query).then((users) => { if (live) setOptions(users); }).catch((cause) => { if (live) { setOptions([]); setError(cause instanceof Error ? cause.message : "Unable to load users. Type a search to retry."); } }).finally(() => { if (live) setLoading(false); });
    }, 200);
    return () => { live = false; window.clearTimeout(timer); };
  }, [token, query]);
  return <ReportDropdownEditor label="Reported By" value={value} displayValue={name} showStoredValue={false} options={options.map((user) => ({ value: user.id, label: `${user.name} · ${user.role}` }))} loading={loading} error={error} disabled={disabled} autoOpen={autoOpen} popoverZIndex={2400} onSearch={setQuery} onSelect={(id) => { const user = options.find((item) => item.id === id); if (user) onSelect(id, user.name); }} onClose={onClose} />;
}
