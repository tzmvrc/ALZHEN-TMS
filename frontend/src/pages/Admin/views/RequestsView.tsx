// src/pages/Admin/views/RequestsView.tsx
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Check,
  ChevronRight,
  LayoutGrid,
  MessageSquare,
  Search,
  Table2,
  X,
} from "lucide-react";
import type { DispatchRequest, RequestStatus } from "../../../types/requests";
import RequestDetail from "../../../components/admin/RequestDetail";
import { useRequests } from "../../../components/admin/requestsStore";
import { senderInitials } from "../../../components/admin/requestFormat";
import { tableUi } from "../../../components/admin/dashboardStyles";

type ViewMode = "board" | "list";

const COLUMNS: {
  id: RequestStatus;
  label: string;
  badge: string;
  bar: string;
  stage: string;
  progress: number;
}[] = [
  { id: "Pending", label: "Pending", badge: "bg-amber-400 text-white", bar: "bg-amber-400", stage: "Awaiting review", progress: 50 },
  { id: "Approved", label: "Approved", badge: "bg-emerald-500 text-white", bar: "bg-emerald-500", stage: "Approved", progress: 100 },
  { id: "Declined", label: "Declined", badge: "bg-rose-500 text-white", bar: "bg-rose-500", stage: "Declined", progress: 100 },
];

const STATUS_PILL: Record<RequestStatus, string> = {
  Pending: "bg-[#fff3c4] text-[#7a5b00]",
  Approved: "bg-[#e4f3e8] text-[#1d6b3a]",
  Declined: "bg-[#fde4e4] text-[#a12626]",
};

function shortDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function summary(request: DispatchRequest) {
  if (request.remarks) return request.remarks;
  const parts = [request.warehouse, request.courier, request.region].filter(Boolean);
  return parts.length ? parts.join(" · ") : `Request from ${request.fromName || request.fromEmail}`;
}

/* ---------- Board card ---------- */
function RequestCard({
  request,
  onOpen,
  onApprove,
  onDecline,
}: {
  request: DispatchRequest;
  onOpen: () => void;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const qty = request.items.reduce((sum, item) => sum + item.qty, 0);
  const lines = `${request.items.length} line${request.items.length === 1 ? "" : "s"}`;
  const date = shortDate(request.dispatchDate);
  const pending = request.status === "Pending";

  return (
    <article className="group overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(11,35,65,0.05)] ring-1 ring-slate-900/[0.06] transition hover:shadow-[0_10px_28px_-14px_rgba(11,35,65,0.28)] hover:ring-slate-900/10">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open request ${request.reference}`}
        className="block w-full p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2678b9]"
      >
        {/* Sender + date */}
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e6f0f9] text-[10px] font-bold text-[#1d5f94]"
          >
            {senderInitials(request.fromEmail)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium text-slate-700">
              {request.fromName || request.fromEmail}
            </span>
            {request.fromName && (
              <span className="block truncate text-[10px] text-slate-400">{request.fromEmail}</span>
            )}
          </span>
          {date && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-slate-400">
              <CalendarDays aria-hidden="true" className="h-3 w-3" />
              {date}
            </span>
          )}
        </span>

        {/* Reference + summary */}
        <span className="mt-3.5 block truncate text-[14px] font-semibold text-[#0b2341]">
          {request.reference}
        </span>
        <span className="mt-1 line-clamp-2 block text-[12px] leading-5 text-slate-500">
          {summary(request)}
        </span>

        {/* Meta */}
        <span className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-500">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium tabular-nums">{qty} units</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 tabular-nums">{lines}</span>
          {request.messageThread.length > 0 && (
            <span className="inline-flex items-center gap-1 text-slate-400">
              <MessageSquare aria-hidden="true" className="h-3 w-3" />
              {request.messageThread.length}
            </span>
          )}
          {request.amount && (
            <span className="ml-auto text-[12px] font-semibold tabular-nums text-[#0b2341]">
              {request.amount}
            </span>
          )}
        </span>
      </button>

      {pending && (
        <div className="grid grid-cols-2 gap-px border-t border-slate-100 bg-slate-100">
          <button
            type="button"
            onClick={onDecline}
            className="inline-flex h-10 items-center justify-center gap-1.5 bg-white text-[12px] font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-300"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
            Decline
          </button>
          <button
            type="button"
            onClick={onApprove}
            className="inline-flex h-10 items-center justify-center gap-1.5 bg-white text-[12px] font-semibold text-[#0b2341] transition hover:bg-[#0b2341] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ffd43b]"
          >
            <Check aria-hidden="true" className="h-3.5 w-3.5" />
            Approve
          </button>
        </div>
      )}
    </article>
  );
}

/* ---------- List row ---------- */
const STATUS_DOT: Record<RequestStatus, string> = {
  Pending: "bg-amber-500",
  Approved: "bg-emerald-500",
  Declined: "bg-rose-500",
};

// Shared column template so the header and every row line up.
const LIST_GRID =
  "md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,2fr)_6.5rem_7rem_6.5rem] md:items-center md:gap-5";
const ACTIONS_W = "w-[5rem]";

function RequestListHeader() {
  const label = "text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400";
  return (
    <div className="hidden items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-6 md:flex">
      <div className={`min-w-0 flex-1 ${LIST_GRID}`}>
        <span className={label}>Sender</span>
        <span className={label}>Request</span>
        <span className={label}>Items</span>
        <span className={label}>Dispatch</span>
        <span className={label}>Status</span>
      </div>
      <div className={`${ACTIONS_W} shrink-0`} />
    </div>
  );
}

function RequestRow({
  request,
  onOpen,
  onApprove,
  onDecline,
}: {
  request: DispatchRequest;
  onOpen: () => void;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const qty = request.items.reduce((sum, item) => sum + item.qty, 0);
  const lines = `${request.items.length} line${request.items.length === 1 ? "" : "s"}`;
  const pending = request.status === "Pending";
  const date = shortDate(request.dispatchDate);

  return (
    <li className="group flex items-center gap-2 px-4 py-3.5 transition-colors hover:bg-slate-50 sm:px-6">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open request ${request.reference}`}
        className={`min-w-0 flex-1 rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] ${LIST_GRID}`}
      >
        {/* Sender */}
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e6f0f9] text-[11px] font-bold text-[#1d5f94]"
          >
            {senderInitials(request.fromEmail)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-slate-800">
              {request.fromName || request.fromEmail}
            </span>
            {request.fromName && (
              <span className="block truncate text-[11px] text-slate-400">{request.fromEmail}</span>
            )}
          </span>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold md:hidden ${STATUS_PILL[request.status]}`}
          >
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[request.status]}`} />
            {request.status}
          </span>
        </span>

        {/* Request */}
        <span className="mt-2 block min-w-0 md:mt-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-[#0b2341]">{request.reference}</span>
            {request.messageThread.length > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-slate-400">
                <MessageSquare aria-hidden="true" className="h-3 w-3" />
                {request.messageThread.length}
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-slate-500">{summary(request)}</span>
        </span>

        {/* Items */}
        <span className="mt-1 block text-[12px] text-slate-500 md:mt-0 md:text-slate-600">
          <span className="tabular-nums">{qty} units</span>
          <span className="text-slate-300 md:hidden"> · </span>
          <span className="tabular-nums text-slate-400 md:block md:text-[11px]">
            {lines}
            {request.amount ? ` · ${request.amount}` : ""}
          </span>
        </span>

        {/* Dispatch date */}
        <span className="hidden text-[12px] text-slate-500 md:block">{date || "—"}</span>

        {/* Status */}
        <span className="hidden md:block">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_PILL[request.status]}`}
          >
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[request.status]}`} />
            {request.status}
          </span>
        </span>
      </button>

      {/* Actions (fixed width keeps columns aligned) */}
      <div className={`hidden shrink-0 items-center justify-end gap-1.5 sm:flex ${ACTIONS_W}`}>
        {pending ? (
          <>
            <button
              type="button"
              onClick={onDecline}
              aria-label={`Decline ${request.reference}`}
              title="Decline"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onApprove}
              aria-label={`Approve ${request.reference}`}
              title="Approve"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#0b2341] text-[#ffd43b] transition hover:bg-[#12335c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd43b]"
            >
              <Check aria-hidden="true" className="h-4 w-4" />
            </button>
          </>
        ) : (
          <ChevronRight
            aria-hidden="true"
            className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#2678b9]"
          />
        )}
      </div>
    </li>
  );
}

export default function RequestsView() {
  const { requests, select, selectedId, setStatus, sendMessage } = useRequests();
  const [view, setView] = useState<ViewMode>("list");
  const [query, setQuery] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  useEffect(() => { if (selectedId) setDetailOpen(true); }, [selectedId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return requests;
    return requests.filter((request) =>
      `${request.reference} ${request.fromName ?? ""} ${request.fromEmail} ${request.courier ?? ""} ${request.region} ${request.warehouse ?? ""}`
        .toLowerCase()
        .includes(needle),
    );
  }, [requests, query]);

  const selected = requests.find((request) => request.id === selectedId) ?? null;
  const modalOpen = detailOpen && selected !== null;

  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [modalOpen]);

  function openRequest(request: DispatchRequest) {
    select(request.id);
    setDetailOpen(true);
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight tracking-tight text-[#0b2341]">Requests</h1>
          <p className="mt-1 text-xs leading-snug text-slate-600">Dispatch requests parsed from incoming TCL emails</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <label className="relative block w-full sm:w-72">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <input
              aria-label="Search requests"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search reference, sender or courier"
              className="h-10 w-full rounded-full border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#2678b9]/50 focus:ring-2 focus:ring-[#2678b9]/15"
            />
          </label>
          <div role="group" aria-label="Request display mode" className={tableUi.segment}>
            <button
              type="button"
              title="Board view"
              aria-label="Board view"
              aria-pressed={view === "board"}
              onClick={() => setView("board")}
              className={`inline-flex h-8 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] ${view === "board" ? tableUi.segmentOn : tableUi.segmentOff}`}>
              <LayoutGrid aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="List view"
              aria-label="List view"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              className={`inline-flex h-8 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9] ${view === "list" ? tableUi.segmentOn : tableUi.segmentOff}`}>
              <Table2 aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="w-full rounded-3xl bg-white ring-1 ring-slate-900/[0.05] shadow-[0_1px_2px_rgba(11,35,65,0.03)]">
      {view === "board" ? (
        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3">
          {COLUMNS.map((column) => {
            const rows = filtered.filter((request) => request.status === column.id);
            return (
              <section key={column.id} aria-label={column.label} className="min-w-0 rounded-2xl bg-slate-50/80 p-3">
                <header className="mb-3 flex items-center gap-2 px-1.5 pt-0.5">
                  <span aria-hidden="true" className={`h-2 w-2 rounded-full ${column.bar}`} />
                  <h3 className="text-[13px] font-semibold text-[#0b2341]">{column.label}</h3>
                  <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[10px] font-semibold tabular-nums text-slate-500 ring-1 ring-slate-900/[0.06]">
                    {rows.length}
                  </span>
                </header>
                <div className="space-y-2.5">
                  {rows.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-xs text-slate-400">
                      No {column.label.toLowerCase()} requests
                    </p>
                  ) : (
                    rows.map((request) => (
                      <RequestCard
                        key={request.id}
                        request={request}
                        onOpen={() => openRequest(request)}
                        onApprove={() => setStatus(request.id, "Approved")}
                        onDecline={() => setStatus(request.id, "Declined")}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-6 py-16 text-center text-sm text-slate-500">No requests found.</p>
      ) : (
        <div>
          <RequestListHeader />
          <ul className="divide-y divide-slate-100/80 pb-1">
            {filtered.map((request) => (
              <RequestRow
                key={request.id}
                request={request}
                onOpen={() => openRequest(request)}
                onApprove={() => setStatus(request.id, "Approved")}
                onDecline={() => setStatus(request.id, "Declined")}
              />
            ))}
          </ul>
        </div>
      )}

      </div>

      {/* Centered modal */}
      {modalOpen && selected && createPortal(
        <div
          className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-900/20 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Request ${selected.reference}`}
            className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_32px_80px_-20px_rgba(11,35,65,0.45)] ring-1 ring-slate-900/[0.06] sm:rounded-3xl"
          >
            <RequestDetail
              key={selected.id}
              request={selected}
              onClose={() => setDetailOpen(false)}
              onApprove={(note) => {
                setStatus(selected.id, "Approved", note);
                setDetailOpen(false);
              }}
              onDecline={(note) => {
                setStatus(selected.id, "Declined", note);
                setDetailOpen(false);
              }}
              onSendMessage={(body) => sendMessage(selected.id, body)}
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}