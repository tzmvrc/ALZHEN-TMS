// src/components/admin/RequestDetail.tsx
import { useState } from "react";
import { Check, MessageSquare, Package, Send, X } from "lucide-react";
import type { DispatchRequest, RequestStatus } from "../../types/requests";
import { surface } from "./dashboardStyles";
import { senderInitials } from "./requestFormat";

/* ---------- helpers ---------- */
function formatDate(iso?: string) {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const statusPill: Record<RequestStatus, string> = {
  Pending: "bg-[#fff3c4] text-[#7a5b00]",
  Approved: "bg-[#e4f3e8] text-[#1d6b3a]",
  Declined: "bg-[#fde4e4] text-[#a12626]",
};

const statusDot: Record<RequestStatus, string> = {
  Pending: "bg-amber-500",
  Approved: "bg-emerald-500",
  Declined: "bg-rose-500",
};

const categoryColor: Record<string, string> = {
  AC: "bg-blue-50 text-blue-700",
  REF: "bg-violet-50 text-violet-700",
  WM: "bg-cyan-50 text-cyan-700",
  TV: "bg-amber-50 text-amber-700",
  SBAR: "bg-emerald-50 text-emerald-700",
};

const fieldClass =
  "w-full resize-none rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#2678b9]/50 focus:ring-2 focus:ring-[#2678b9]/15";

const eyebrow = "text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400";

/* ---------- small blocks ---------- */
function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 flex-1 px-5 py-4 first:pl-0 last:pr-0">
      <p className={eyebrow}>{label}</p>
      <p className="mt-1.5 truncate text-[22px] font-semibold leading-none tracking-tight tabular-nums text-[#0b2341]">
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-xs text-slate-400">{label}</dt>
      <dd className={`min-w-0 truncate text-right text-xs ${value ? "font-medium text-slate-700" : "text-slate-300"}`}>
        {value || "—"}
      </dd>
    </div>
  );
}

/* ---------- main ---------- */
export default function RequestDetail({
  request,
  onClose,
  onApprove,
  onDecline,
  onSendMessage,
}: {
  request: DispatchRequest;
  onClose: () => void;
  onApprove: (note?: string) => void;
  onDecline: (note?: string) => void;
  onSendMessage: (body: string) => void;
}) {
  const [messageDraft, setMessageDraft] = useState("");
  const [actionMode, setActionMode] = useState<"none" | "approve" | "decline">("none");
  const [actionNote, setActionNote] = useState("");

  const totalQty = request.items.reduce((s, i) => s + i.qty, 0);
  const totalCbm = request.items.reduce((s, i) => s + (i.totalCbm ?? 0), 0);
  const canAct = request.status === "Pending";

  const handleActionConfirm = () => {
    if (actionMode === "approve") onApprove(actionNote.trim() || undefined);
    else if (actionMode === "decline") onDecline(actionNote.trim() || undefined);
    setActionMode("none");
    setActionNote("");
  };

  const handleSend = () => {
    const body = messageDraft.trim();
    if (!body) return;
    onSendMessage(body);
    setMessageDraft("");
  };

  return (
    <>
      {/* Header */}
      <header className="flex items-start gap-4 px-7 pb-5 pt-7">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0b2341] text-sm font-bold text-white"
        >
          {senderInitials(request.fromEmail)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="truncate text-xl font-semibold tracking-tight text-[#0b2341]">
              {request.reference}
            </h2>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusPill[request.status]}`}
            >
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${statusDot[request.status]}`} />
              {request.status}
            </span>
          </div>
          <p className="mt-1 truncate text-[13px] text-slate-500">
            {request.fromName ? (
              <>
                <span className="font-medium text-slate-700">{request.fromName}</span>
                <span className="mx-1.5 text-slate-300">·</span>
              </>
            ) : null}
            {request.fromEmail}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close request"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </header>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-7">
        {/* KPI strip */}
        <div className="flex divide-x divide-slate-100 border-y border-slate-100">
          <Kpi label="Lines" value={String(request.items.length)} />
          <Kpi label="Units" value={String(totalQty)} />
          <Kpi label="CBM" value={totalCbm > 0 ? totalCbm.toFixed(2) : "—"} />
          <Kpi label="Amount" value={request.amount || "—"} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          {/* Left: items */}
          <section className="min-w-0">
            <h3 className="mb-3 inline-flex items-center gap-2 text-[13px] font-semibold text-[#0b2341]">
              <Package aria-hidden="true" className="h-4 w-4 text-[#2678b9]" />
              Items
            </h3>
            <ul className="space-y-2.5">
              {request.items.map((item) => (
                <li key={item.id} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold text-[#0b2341]">{item.soNo ?? "—"}</span>
                        {item.dr ? <span className="text-[11px] text-slate-400">DR {item.dr}</span> : null}
                        {item.productCategory ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${categoryColor[item.productCategory] ?? "bg-slate-100 text-slate-600"}`}
                          >
                            {item.productCategory}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-600">{item.customerName}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-semibold leading-none tabular-nums text-[#0b2341]">
                        {item.qty}
                        <span className="ml-1 text-[11px] font-medium text-slate-400">pcs</span>
                      </p>
                      {item.totalCbm != null ? (
                        <p className="mt-1.5 text-[11px] tabular-nums text-slate-400">
                          {item.totalCbm.toFixed(4)} CBM
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200/70 pt-3 text-[11px] text-slate-500">
                    {item.shipTo ? (
                      <span className="min-w-0 truncate">
                        {item.shipTo}
                        {item.city ? `, ${item.city}` : ""}
                        {item.province ? `, ${item.province}` : ""}
                      </span>
                    ) : null}
                    {item.customerModel ? (
                      <span className="ml-auto rounded-md bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-600 ring-1 ring-slate-900/[0.06]">
                        {item.customerModel}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Right: details + remarks + messages */}
          <aside className="min-w-0 space-y-5">
            <section>
              <h3 className={`${eyebrow} mb-1`}>Details</h3>
              <dl className="divide-y divide-slate-100">
                <DetailRow label="Warehouse" value={request.warehouse} />
                <DetailRow label="Courier" value={request.courier} />
                <DetailRow label="Truck" value={request.truckAssignment} />
                <DetailRow label="Dispatch" value={formatDate(request.dispatchDate)} />
                <DetailRow label="Delivery" value={formatDate(request.deliveryDate)} />
              </dl>
            </section>

            {request.remarks ? (
              <section className="rounded-2xl bg-[#fffbea] px-4 py-3.5">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7a5b00]">Remarks</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#5c4400]">{request.remarks}</p>
              </section>
            ) : null}

            <section>
              <h3 className="mb-2.5 inline-flex items-center gap-2 text-[13px] font-semibold text-[#0b2341]">
                <MessageSquare aria-hidden="true" className="h-4 w-4 text-[#2678b9]" />
                Messages
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                  {request.messageThread.length}
                </span>
              </h3>

              {request.messageThread.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-[11px] text-slate-400">
                  No messages yet
                </p>
              ) : (
                <ul className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
                  {request.messageThread.map((m) => (
                    <li key={m.id} className={`flex ${m.self ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-xs ${
                          m.self
                            ? "rounded-br-md bg-[#0b2341] text-white"
                            : "rounded-bl-md bg-slate-100 text-slate-700"
                        }`}
                      >
                        <p className="text-[10px] font-medium opacity-60">
                          {m.from} · {formatTime(m.at)}
                        </p>
                        <p className="mt-0.5 leading-relaxed">{m.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex items-end gap-2">
                <textarea
                  rows={1}
                  value={messageDraft}
                  onChange={(e) => setMessageDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  aria-label="Message to the dispatcher"
                  placeholder="Write a message…"
                  className={`${fieldClass} min-h-[40px]`}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!messageDraft.trim()}
                  aria-label="Send message"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0b2341] text-white transition hover:bg-[#12335c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd43b] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-white px-7 py-4">
        {actionMode === "none" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              {canAct
                ? "Review the items, then approve or decline."
                : `This request was already ${request.status.toLowerCase()}.`}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className={surface.chipGhost}>
                Close
              </button>
              {canAct && (
                <>
                  <button
                    type="button"
                    onClick={() => setActionMode("decline")}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 text-xs font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                  >
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionMode("approve")}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#0b2341] px-5 text-xs font-semibold text-white transition hover:bg-[#12335c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd43b]"
                  >
                    <Check aria-hidden="true" className="h-3.5 w-3.5 text-[#ffd43b]" />
                    Approve
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
                  actionMode === "approve" ? "bg-[#e4f3e8] text-[#1d6b3a]" : "bg-[#fde4e4] text-[#a12626]"
                }`}
              >
                {actionMode === "approve" ? (
                  <Check aria-hidden="true" className="h-3.5 w-3.5" />
                ) : (
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                )}
              </span>
              <p className="text-[13px] font-semibold text-[#0b2341]">
                {actionMode === "approve" ? "Approve this request?" : "Decline this request?"}
              </p>
            </div>
            <textarea
              rows={2}
              autoFocus
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              aria-label={actionMode === "approve" ? "Note for the dispatcher" : "Reason for declining"}
              placeholder={actionMode === "approve" ? "Optional note for the dispatcher…" : "Reason for declining…"}
              className={fieldClass}
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setActionMode("none");
                  setActionNote("");
                }}
                className={surface.chipGhost}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleActionConfirm}
                className={`inline-flex h-10 items-center rounded-full px-5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 ${
                  actionMode === "approve"
                    ? "bg-[#ffd43b] text-[#0b2341] hover:bg-[#f2c200] focus-visible:ring-[#0b2341]/40"
                    : "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-300"
                }`}
              >
                {actionMode === "approve" ? "Confirm approval" : "Confirm decline"}
              </button>
            </div>
          </div>
        )}
      </footer>
    </>
  );
}