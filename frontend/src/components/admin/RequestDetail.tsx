// src/components/admin/RequestDetail.tsx
import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Send,
  Truck,
  X,
} from "lucide-react";
import type { DispatchRequest, RequestStatus } from "../../types/requests";
import { surface, tableUi } from "./dashboardStyles";
import { senderInitials } from "./requestFormat";

/* ---------- helpers ---------- */
function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

const categoryColor: Record<string, string> = {
  AC: "bg-blue-50 text-blue-700",
  REF: "bg-violet-50 text-violet-700",
  WM: "bg-cyan-50 text-cyan-700",
  TV: "bg-amber-50 text-amber-700",
  SBAR: "bg-emerald-50 text-emerald-700",
};

const fieldClass =
  "w-full resize-none rounded-2xl border border-transparent bg-[#f2f6fa] px-3.5 py-2.5 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#2678b9]/40 focus:bg-white focus:ring-2 focus:ring-[#2678b9]/15";

/* ---------- small blocks ---------- */
function MetaCell({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-[#f2f6fa] px-3.5 py-2.5">
      <p className="text-[10px] font-medium text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-[13px] font-semibold text-[#0b2341]">
        {value || "—"}
      </p>
    </div>
  );
}

/* ---------- main ---------- */
export default function RequestDetail({
  request,
  onApprove,
  onDecline,
  onSendMessage,
}: {
  request: DispatchRequest;
  onApprove: (note?: string) => void;
  onDecline: (note?: string) => void;
  onSendMessage: (body: string) => void;
}) {
  const [showItems, setShowItems] = useState(true);
  const [showThread, setShowThread] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [actionMode, setActionMode] = useState<"none" | "approve" | "decline">(
    "none",
  );
  const [actionNote, setActionNote] = useState("");

  const totalQty = request.items.reduce((s, i) => s + i.qty, 0);
  const totalCbm = request.items.reduce((s, i) => s + (i.totalCbm ?? 0), 0);

  const handleActionConfirm = () => {
    if (actionMode === "approve") {
      onApprove(actionNote.trim() || undefined);
    } else if (actionMode === "decline") {
      onDecline(actionNote.trim() || undefined);
    }
    setActionMode("none");
    setActionNote("");
  };

  const handleSend = () => {
    const body = messageDraft.trim();
    if (!body) return;
    onSendMessage(body);
    setMessageDraft("");
  };

  const canAct = request.status === "Pending";

  return (
    <div className={`${surface.card} flex flex-col overflow-hidden`}>
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-slate-100 p-5">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e6f0f9] text-[13px] font-bold text-[#1d5f94]"
        >
          {senderInitials(request.fromEmail)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={`${surface.heading} truncate`}>{request.reference}</h2>
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusPill[request.status]}`}
            >
              {request.status}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-500">
            From{" "}
            <span className="font-medium text-slate-700">{request.fromName}</span>{" "}
            &lt;{request.fromEmail}&gt;
          </p>
        </div>
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-2 px-5 pt-4 lg:grid-cols-3">
        <MetaCell label="Warehouse" value={request.warehouse} />
        <MetaCell label="Courier" value={request.courier} />
        <MetaCell label="Truck" value={request.truckAssignment} />
        <MetaCell
          label="Dispatch date"
          value={request.dispatchDate ? formatDate(request.dispatchDate) : "—"}
        />
        <MetaCell
          label="Delivery date"
          value={request.deliveryDate ? formatDate(request.deliveryDate) : "—"}
        />
        <MetaCell label="Total amount" value={request.amount} />
      </div>

      {/* Remarks */}
      {request.remarks ? (
        <div className="mx-5 mt-3 rounded-2xl bg-[#fff8dc] px-3.5 py-2.5">
          <p className="text-[10px] font-semibold text-[#7a5b00]">Remarks</p>
          <p className="mt-0.5 text-xs text-[#5c4400]">{request.remarks}</p>
        </div>
      ) : null}

      {/* Items summary bar */}
      <div className="mt-4 flex items-center justify-between border-y border-slate-100 px-5 py-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Truck aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
            <strong className="font-semibold text-[#0b2341]">
              {request.items.length}
            </strong>{" "}
            line{request.items.length === 1 ? "" : "s"}
          </span>
          <span>
            Qty <strong className="font-semibold text-[#0b2341]">{totalQty}</strong>
          </span>
          {totalCbm > 0 ? (
            <span>
              CBM{" "}
              <strong className="font-semibold text-[#0b2341]">
                {totalCbm.toFixed(2)}
              </strong>
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setShowItems((v) => !v)}
          aria-expanded={showItems}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-[#f2f6fa] hover:text-[#0b2341] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]"
        >
          {showItems ? (
            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
          )}
          {showItems ? "Hide items" : "Show items"}
        </button>
      </div>

      {/* Items table */}
      {showItems && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead className={tableUi.thead}>
              <tr>
                <th className={tableUi.th}>SO / DR</th>
                <th className={tableUi.th}>Customer</th>
                <th className={tableUi.th}>Ship to</th>
                <th className={tableUi.th}>Category</th>
                <th className={tableUi.th}>Model</th>
                <th className={`${tableUi.th} text-right`}>Qty</th>
                <th className={`${tableUi.th} text-right`}>Total CBM</th>
              </tr>
            </thead>
            <tbody>
              {request.items.map((item) => (
                <tr key={item.id} className={`align-top ${tableUi.row}`}>
                  <td className={tableUi.td}>
                    <p className="font-semibold text-[#0b2341]">{item.soNo ?? "—"}</p>
                    {item.dr ? (
                      <p className="mt-0.5 text-[10px] text-slate-400">DR {item.dr}</p>
                    ) : null}
                  </td>
                  <td className={tableUi.td}>{item.customerName}</td>
                  <td className={tableUi.td}>
                    <p>{item.shipTo}</p>
                    {item.city ? (
                      <p className="text-[10px] text-slate-400">
                        {item.city}
                        {item.province ? `, ${item.province}` : ""}
                      </p>
                    ) : null}
                  </td>
                  <td className={tableUi.td}>
                    {item.productCategory ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${categoryColor[item.productCategory] ?? "bg-slate-100 text-slate-600"}`}
                      >
                        {item.productCategory}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className={`${tableUi.td} font-mono !text-[11px]`}>
                    {item.customerModel}
                  </td>
                  <td className={`${tableUi.tdStrong} text-right tabular-nums`}>
                    {item.qty}
                  </td>
                  <td className={`${tableUi.td} text-right tabular-nums`}>
                    {item.totalCbm != null ? item.totalCbm.toFixed(4) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Message thread toggle + panel */}
      <div className="border-t border-slate-100">
        <button
          type="button"
          onClick={() => setShowThread((v) => !v)}
          aria-expanded={showThread}
          className="flex w-full items-center justify-between px-5 py-3 text-left transition hover:bg-[#f2f6fa]/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2678b9]"
        >
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#0b2341]">
            <MessageSquare aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
            Messages
            <span className="rounded-full bg-[#e6f0f9] px-2 py-0.5 text-[10px] font-semibold text-[#1d5f94]">
              {request.messageThread.length}
            </span>
          </span>
          {showThread ? (
            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
          )}
        </button>

        {showThread && (
          <div className="border-t border-slate-100 bg-[#f2f6fa]/50 px-5 py-4">
            {request.messageThread.length === 0 ? (
              <p className="text-[11px] text-slate-400">
                No messages yet. Write the first one below.
              </p>
            ) : (
              <ul className="space-y-3">
                {request.messageThread.map((m) => (
                  <li
                    key={m.id}
                    className={`flex ${m.self ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-xs ${
                        m.self
                          ? "bg-[#0b2341] text-white"
                          : "bg-white text-slate-700 shadow-[0_1px_2px_rgba(11,35,65,0.06)]"
                      }`}
                    >
                      <p className="text-[10px] font-medium opacity-70">
                        {m.from} · {formatTime(m.at)}
                      </p>
                      <p className="mt-1 leading-relaxed">{m.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex items-end gap-2">
              <textarea
                rows={2}
                value={messageDraft}
                onChange={(e) => setMessageDraft(e.target.value)}
                aria-label="Message to the dispatcher"
                placeholder="Write a message to the dispatcher…"
                className={`${fieldClass} min-h-[44px] !bg-white`}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!messageDraft.trim()}
                className={`${surface.chip} h-10 shrink-0 gap-1.5 px-4 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <Send aria-hidden="true" className="h-3.5 w-3.5" />
                Send
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action footer */}
      <div className="border-t border-slate-100 bg-white px-5 py-4">
        {actionMode === "none" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-slate-500">
              {canAct
                ? "Review the items, then approve or decline this request."
                : `This request was already ${request.status.toLowerCase()}.`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!canAct}
                onClick={() => setActionMode("decline")}
                className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
                Decline
              </button>
              <button
                type="button"
                disabled={!canAct}
                onClick={() => setActionMode("approve")}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0b2341] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#12335c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd43b] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check aria-hidden="true" className="h-3.5 w-3.5 text-[#ffd43b]" />
                Approve
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${
                  actionMode === "approve"
                    ? "bg-[#e4f3e8] text-[#1d6b3a]"
                    : "bg-[#fde4e4] text-[#a12626]"
                }`}
              >
                {actionMode === "approve" ? (
                  <Check aria-hidden="true" className="h-3.5 w-3.5" />
                ) : (
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                )}
              </span>
              <p className="text-xs font-semibold text-[#0b2341]">
                {actionMode === "approve"
                  ? "Approve this request?"
                  : "Decline this request?"}
              </p>
            </div>
            <textarea
              rows={2}
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              aria-label={
                actionMode === "approve" ? "Note for the dispatcher" : "Reason for declining"
              }
              placeholder={
                actionMode === "approve"
                  ? "Optional note for the dispatcher…"
                  : "Reason for declining…"
              }
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
                className={`rounded-full px-4 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 ${
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
      </div>
    </div>
  );
}