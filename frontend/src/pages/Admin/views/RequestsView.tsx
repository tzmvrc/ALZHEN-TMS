// src/pages/Admin/views/RequestsView.tsx
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Check,
  ChevronRight,
  LayoutGrid,
  List,
  MessageSquare,
  Package,
  Search,
  X,
} from "lucide-react";
import type { DispatchRequest, RequestStatus } from "../../../types/requests";
import RequestDetail from "../../../components/admin/RequestDetail";
import { useRequests } from "../../../components/admin/requestsStore";
import { senderInitials } from "../../../components/admin/requestFormat";

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
  column,
  onOpen,
  onApprove,
  onDecline,
}: {
  request: DispatchRequest;
  column: (typeof COLUMNS)[number];
  onOpen: () => void;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const qty = request.items.reduce((sum, item) => sum + item.qty, 0);
  const date = shortDate(request.dispatchDate);
  const pending = request.status === "Pending";

  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(11,35,65,0.04)] transition hover:border-slate-300 hover:shadow-[0_8px_24px_-12px_rgba(11,35,65,0.2)]">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open request ${request.reference}`}
        className="block w-full rounded-2xl p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]"
      >
        <h3 className="truncate text-[13px] font-semibold text-[#0b2341]">{request.reference}</h3>
        <p className="mt-1.5 line-clamp-2 min-h-[2.5rem] text-[11px] leading-5 text-slate-500">
          {summary(request)}
        </p>

        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Package aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" />
            {column.stage}
          </span>
          <span className="tabular-nums">
            {request.items.length} line{request.items.length === 1 ? "" : "s"} · {qty} units
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${column.bar}`} style={{ width: `${column.progress}%` }} />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e6f0f9] text-[9px] font-bold text-[#1d5f94]"
            >
              {senderInitials(request.fromEmail)}
            </span>
            <span className="truncate text-[11px] text-slate-500">
              {request.fromName || request.fromEmail}
            </span>
          </span>
        </div>

        <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3 text-[10px] text-slate-400">
          <span className="inline-flex items-center gap-1">
            <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
            {date || "No date"}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
            {request.messageThread.length}
          </span>
          {request.amount ? (
            <span className="ml-auto font-semibold tabular-nums text-[#0b2341]">{request.amount}</span>
          ) : null}
        </div>
      </button>

      {pending && (
        <div className="flex gap-2 border-t border-slate-100 p-2.5">
          <button
            type="button"
            onClick={onDecline}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full border border-rose-200 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
            Decline
          </button>
          <button
            type="button"
            onClick={onApprove}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#0b2341] text-[11px] font-semibold text-white transition hover:bg-[#12335c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffd43b]"
          >
            <Check aria-hidden="true" className="h-3.5 w-3.5 text-[#ffd43b]" />
            Approve
          </button>
        </div>
      )}
    </article>
  );
}

/* ---------- List row ---------- */
function RequestRow({ request, onOpen }: { request: DispatchRequest; onOpen: () => void }) {
  const qty = request.items.reduce((sum, item) => sum + item.qty, 0);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open request ${request.reference}`}
        className="group flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-[#f6f9fc] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2678b9]"
      >
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e6f0f9] text-xs font-bold text-[#1d5f94]"
        >
          {senderInitials(request.fromEmail)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[#0b2341]">{request.reference}</span>
          <span className="block truncate text-xs text-slate-500">
            {request.fromName || request.fromEmail} · {request.items.length} lines · {qty} units
          </span>
        </span>
        <span className="hidden text-xs text-slate-400 sm:block">{shortDate(request.dispatchDate)}</span>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${STATUS_PILL[request.status]}`}>
          {request.status}
        </span>
        <ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-300 group-hover:text-[#2678b9]" />
      </button>
    </li>
  );
}

export default function RequestsView() {
  const { requests, select, selectedId, setStatus, sendMessage } = useRequests();
  const [view, setView] = useState<ViewMode>("board");
  const [query, setQuery] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);

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

  const viewTabs: { id: ViewMode; label: string; icon: typeof LayoutGrid }[] = [
    { id: "board", label: "Board view", icon: LayoutGrid },
    { id: "list", label: "List view", icon: List },
  ];

  return (
    <div className="w-full rounded-3xl bg-white ring-1 ring-slate-900/[0.05] shadow-[0_1px_2px_rgba(11,35,65,0.03)]">
      {/* Heading */}
      <div className="px-6 pt-6">
        <h2 className="text-xl font-bold tracking-tight text-[#0b2341]">Dispatch requests</h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Review requests parsed from incoming emails, then approve or decline them.
        </p>
      </div>

      {/* View tabs + search */}
      <div className="mt-5 flex flex-col gap-3 border-b border-slate-100 px-6 sm:flex-row sm:items-end sm:justify-between">
        <div role="tablist" aria-label="Request view" className="flex items-center gap-1">
          {viewTabs.map(({ id, label, icon: Icon }) => {
            const active = view === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(id)}
                className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 pb-3 pt-1 text-xs font-medium transition focus:outline-none focus-visible:text-[#0b2341] ${
                  active
                    ? "border-[#0b2341] text-[#0b2341]"
                    : "border-transparent text-slate-500 hover:text-[#0b2341]"
                }`}
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>
        <label className="relative mb-3 block w-full sm:w-72">
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
      </div>

      {view === "board" ? (
        <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-3">
          {COLUMNS.map((column) => {
            const rows = filtered.filter((request) => request.status === column.id);
            return (
              <section key={column.id} aria-label={column.label} className="min-w-0">
                <header className="mb-3 flex items-center gap-2 px-1">
                  <h3 className="text-[13px] font-semibold text-[#0b2341]">{column.label}</h3>
                  <span
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${column.badge}`}
                  >
                    {rows.length}
                  </span>
                </header>
                <div className="space-y-3">
                  {rows.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-xs text-slate-400">
                      No {column.label.toLowerCase()} requests
                    </p>
                  ) : (
                    rows.map((request) => (
                      <RequestCard
                        key={request.id}
                        request={request}
                        column={column}
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
        <ul className="divide-y divide-slate-100">
          {filtered.map((request) => (
            <RequestRow key={request.id} request={request} onOpen={() => openRequest(request)} />
          ))}
        </ul>
      )}

      {/* Centered modal */}
      {modalOpen && selected && createPortal(
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-[#0b2341]/45 p-3 backdrop-blur-sm sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Request ${selected.reference}`}
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-[0_30px_80px_-20px_rgba(11,35,65,0.45)]"
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
