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
  Pending: "bg-amber-50 text-amber-700 ring-amber-200",
  Approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Declined: "bg-rose-50 text-rose-700 ring-rose-200",
};

const categoryColor: Record<string, string> = {
  AC: "bg-blue-50 text-blue-700",
  REF: "bg-violet-50 text-violet-700",
  WM: "bg-cyan-50 text-cyan-700",
  TV: "bg-amber-50 text-amber-700",
  SBAR: "bg-emerald-50 text-emerald-700",
};

/* ---------- small blocks ---------- */
function MetaRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-[11px] font-medium text-slate-400">{label}</span>
      <span className="max-w-[60%] truncate text-right text-[11px] font-semibold text-slate-800">
        {value || "—"}
      </span>
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
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-slate-100 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold text-slate-900">
                {request.reference}
              </h2>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${statusPill[request.status]}`}
              >
                {request.status}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">
              From <span className="font-medium text-slate-700">{request.fromName}</span>{" "}
              &lt;{request.fromEmail}&gt;
            </p>
          </div>
        </div>
      </div>

      {/* Meta grid */}
      <div className="grid gap-x-6 gap-y-0 px-5 py-3 sm:grid-cols-2">
        <div className="divide-y divide-slate-100">
          <MetaRow label="Warehouse" value={request.warehouse} />
          <MetaRow label="Courier" value={request.courier} />
          <MetaRow
            label="Truck"
            value={request.truckAssignment}
          />
        </div>
        <div className="divide-y divide-slate-100">
          <MetaRow
            label="Dispatch date"
            value={request.dispatchDate ? formatDate(request.dispatchDate) : "—"}
          />
          <MetaRow
            label="Delivery date"
            value={request.deliveryDate ? formatDate(request.deliveryDate) : "—"}
          />
          <MetaRow
            label="Total amount"
            value={request.amount}
          />
        </div>
      </div>

      {/* Remarks */}
      {request.remarks ? (
        <div className="mx-5 mb-4 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
            Remarks
          </p>
          <p className="mt-0.5 text-xs text-amber-900">{request.remarks}</p>
        </div>
      ) : null}

      {/* Items summary bar */}
      <div className="flex items-center justify-between border-y border-slate-100 bg-slate-50/60 px-5 py-2.5">
        <div className="flex items-center gap-4 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <Truck className="h-3 w-3 text-slate-400" />
            <strong className="font-semibold text-slate-800">
              {request.items.length}
            </strong>{" "}
            lines
          </span>
          <span>
            Qty <strong className="font-semibold text-slate-800">{totalQty}</strong>
          </span>
          {totalCbm > 0 ? (
            <span>
              CBM{" "}
              <strong className="font-semibold text-slate-800">
                {totalCbm.toFixed(2)}
              </strong>
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setShowItems((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900"
        >
          {showItems ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          {showItems ? "Hide items" : "Show items"}
        </button>
      </div>

      {/* Items table */}
      {showItems && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="bg-white">
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-400">
                <th className="px-4 py-2.5 font-medium">SO / DR</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Ship To</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Model</th>
                <th className="px-4 py-2.5 font-medium text-right">Qty</th>
                <th className="px-4 py-2.5 font-medium text-right">Total CBM</th>
              </tr>
            </thead>
            <tbody>
              {request.items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-slate-100 last:border-none hover:bg-slate-50/50"
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{item.soNo ?? "—"}</p>
                    {item.dr ? (
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        DR {item.dr}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {item.customerName}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>{item.shipTo}</p>
                    {item.city ? (
                      <p className="text-[10px] text-slate-400">
                        {item.city}
                        {item.province ? `, ${item.province}` : ""}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {item.productCategory ? (
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${categoryColor[item.productCategory] ?? "bg-slate-100 text-slate-600"}`}
                      >
                        {item.productCategory}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-700">
                    {item.customerModel}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">
                    {item.qty}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
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
          className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-slate-50"
        >
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
            <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
            Messages
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
              {request.messageThread.length}
            </span>
          </span>
          {showThread ? (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          )}
        </button>

        {showThread && (
          <div className="border-t border-slate-100 bg-slate-50/40 px-5 py-4">
            {request.messageThread.length === 0 ? (
              <p className="text-[11px] text-slate-400">
                No messages yet. Start a conversation below.
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
                          ? "bg-slate-900 text-white"
                          : "border border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
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
                placeholder="Write a message to the dispatcher…"
                className="min-h-[44px] w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-slate-900"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!messageDraft.trim()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
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
                ? "Review the parsed items, then approve or decline this request."
                : `This request was already ${request.status.toLowerCase()}.`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!canAct}
                onClick={() => setActionMode("decline")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Decline
              </button>
              <button
                type="button"
                disabled={!canAct}
                onClick={() => setActionMode("approve")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
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
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-rose-100 text-rose-700"
                }`}
              >
                {actionMode === "approve" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
              </span>
              <p className="text-xs font-semibold text-slate-800">
                {actionMode === "approve"
                  ? "Approve this request?"
                  : "Decline this request?"}
              </p>
            </div>
            <textarea
              rows={2}
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              placeholder={
                actionMode === "approve"
                  ? "Optional note for the dispatcher…"
                  : "Reason for declining…"
              }
              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-slate-900"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setActionMode("none");
                  setActionNote("");
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleActionConfirm}
                className={`rounded-lg px-3 py-2 text-xs font-semibold text-white transition ${
                  actionMode === "approve"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {actionMode === "approve" ? "Confirm approve" : "Confirm decline"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}