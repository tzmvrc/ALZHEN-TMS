import { useState } from "react";
import { Copy, Download, RotateCcw } from "lucide-react";
import { SectionCard, StatChip, StatusChip } from "./shared";
import { focusRing, secondaryAction } from "./shared/styles";

type Props = { trips: number; imported: number; skipped: number; failed: number; invalid: number; cargoSaved: number; batchId: string; finished: boolean; retryDisabled: boolean; retryReason: string; onRetry: () => void; onDownload: () => void };
export default function ImportResultsPanel(props: Props) {
  const [copyMessage, setCopyMessage] = useState("");
  async function copyBatch() {
    try { await navigator.clipboard.writeText(props.batchId); setCopyMessage("Batch ID copied."); }
    catch { setCopyMessage("Copy unavailable. Select and copy the batch ID below."); }
  }
  return <SectionCard title="Import results" actions={<StatusChip label={props.finished ? "Completed" : "Unfinished save"} tone={props.finished ? "success" : "warning"} />}>
    <div className="flex flex-wrap gap-2">{[["Trips created", props.trips], ["Products imported", props.imported], ["Skipped", props.skipped], ["Failed", props.failed], ["Invalid excluded", props.invalid], ["Cargo plans saved", props.cargoSaved]].map(([label, value]) => <StatChip key={label} label={String(label)} value={value} />)}</div>
    <p className="mt-4 text-xs leading-5 text-slate-500">Retry this same batch to complete unfinished products, cargo plans or location updates. Saved record identities are retained.</p>
    <div className="mt-3 flex flex-wrap items-center gap-2"><code className="select-all break-all rounded-lg bg-slate-50 p-2 text-xs">{props.batchId}</code><button type="button" className={secondaryAction} aria-label="Copy import batch ID" onClick={() => void copyBatch()}><Copy className="h-4 w-4" />Copy batch ID</button></div>
    {copyMessage && <p role="status" className="mt-2 text-xs text-slate-600">{copyMessage}</p>}
    <div className="mt-4 flex flex-wrap gap-2">{!props.finished && <span className={`rounded-xl ${focusRing}`} title={props.retryReason} tabIndex={props.retryDisabled ? 0 : undefined}><button type="button" className={secondaryAction} disabled={props.retryDisabled} onClick={props.onRetry}><RotateCcw className="h-4 w-4" />Retry unfinished save</button></span>}{(props.failed > 0 || props.invalid > 0) && <button type="button" className={secondaryAction} onClick={props.onDownload}><Download className="h-4 w-4" />Download failed rows</button>}</div>
  </SectionCard>;
}
