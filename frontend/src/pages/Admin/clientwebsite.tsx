// src/pages/Admin/clientwebsite.tsx
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Archive,
  BriefcaseBusiness,
  ExternalLink,
  ImagePlus,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import type { WorkspaceName } from "../../components/admin/SidebarNav";
import { useAuth } from "../../context/AuthContext";
import {
  listWebsiteContent,
  saveWebsiteContent,
  deleteWebsiteContent,
  uploadWebsiteImage,
  type Collection,
  type WebsiteRecord,
} from "../../services/clientwebsite.service";
import "./clientwebsite.css";

const CLIENT_WEBSITE_URL = (
  import.meta.env.VITE_CLIENT_WEBSITE_URL || "https://alzhen-website.vercel.app"
).replace(/\/$/, "");

const truckTypes = [
  { value: "10W", label: "10-Wheeler Wing Van" },
  { value: "12W", label: "12-Wheeler Wing Van" },
  { value: "6W", label: "6-Wheeler Closed Van" },
  { value: "L300", label: "L300 Van" },
  { value: "OTHER", label: "Other" },
];

const blank = (kind: Collection): WebsiteRecord =>
  kind === "trucks"
    ? {
        truckType: "10W",
        otherTruckType: "",
        maxLoad: "",
        dimensions: "",
        volume: "",
        images: [],
        commonCargos: [],
      }
    : {
        title: "",
        content: "",
        date: new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Manila",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date()),
        imageUrl: "",
      };

const title = (r: WebsiteRecord) =>
  r.title ||
  (r.truckType === "OTHER"
    ? r.otherTruckType
    : truckTypes.find((t) => t.value === r.truckType)?.label) ||
  r.name ||
  "Untitled";

/* ------------------------------------------------------------------ */
/* Layout primitives                                                   */
/* ------------------------------------------------------------------ */
function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-[26px] font-bold leading-tight tracking-tight text-[#0b2341]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}

function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[28px] bg-white ring-1 ring-slate-900/[0.04] shadow-[0_1px_2px_rgba(11,35,65,0.03)] ${className}`}
    >
      {children}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-full bg-[#ffd43b] px-4 py-2 text-[12px] font-semibold text-[#0b2341] shadow-sm transition hover:bg-[#f2c200] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/30 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[12px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/30 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function IconButton({
  children,
  onClick,
  disabled,
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-[#0b2341] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/30 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function StatusChip({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "amber" | "emerald";
}) {
  const styles: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Content dialog                                                      */
/* ------------------------------------------------------------------ */
function ContentDialog({
  children,
  label,
  close,
  compact = false,
}: {
  children: ReactNode;
  label: string;
  close: () => void;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`cw-dialog ${compact ? "cw-dialog-small" : ""}`}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      {children}
    </dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */
export default function ClientWebsiteWorkspace({
  userName,
  activeTab = "website-preview",
}: {
  userName: string;
  onWorkspaceChange: (workspace: WorkspaceName) => void;
  onLogout: () => void;
  notificationProps: unknown;
  activeTab?:
    | "website-preview"
    | "trucks"
    | "announcements"
    | "careers";
  onTabChange?: (
    tab: "website-preview" | "trucks" | "announcements" | "careers",
  ) => void;
}) {
  const { accessToken, isAdmin } = useAuth();
  const [kind, setKind] = useState<Collection>(
    activeTab === "trucks" ||
      activeTab === "announcements" ||
      activeTab === "careers"
      ? activeTab
      : "trucks",
  );
  const [records, setRecords] = useState<WebsiteRecord[]>([]);
  const [draft, setDraft] = useState<WebsiteRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [archived, setArchived] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    action: "archive" | "delete";
    record: WebsiteRecord;
  } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(new Date());
  const [previewReload, setPreviewReload] = useState(0);

  const greetingName = userName.trim().split(/\s+/)[0] || "Admin";
  const updatedLabel = updatedAt
    ? updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : undefined;

  const isPreview = activeTab === "website-preview";

  useEffect(() => {
    if (
      activeTab === "trucks" ||
      activeTab === "announcements" ||
      activeTab === "careers"
    ) {
      setKind(activeTab);
      setDraft(null);
      setDirty(false);
      setArchived(false);
      setNotice("");
      setError("");
    }
  }, [activeTab]);

  useEffect(() => {
    if (isPreview) return;
    let cancelled = false;
    setLoading(true);
    listWebsiteContent(kind, accessToken)
      .then((next) => {
        if (!cancelled) setRecords(next);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Unable to load content.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, accessToken, isPreview]);

  const visibleRecords = useMemo(
    () =>
      records
        .filter((r) => (r.status === "archived") === archived)
        .sort((a, b) =>
          kind !== "trucks"
            ? (b._createdAt || b.date || "").localeCompare(
                a._createdAt || a.date || "",
              )
            : 0,
        ),
    [records, kind, archived],
  );

  const discard = () => !dirty || window.confirm("Discard your unsaved changes?");

  const refresh = () => {
    setLoading(true);
    setError("");
    listWebsiteContent(kind, accessToken)
      .then(setRecords)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Unable to load content."),
      )
      .finally(() => setLoading(false));
  };

  const edit = (record: WebsiteRecord) => {
    if (!discard()) return;
    setDraft(structuredClone(record));
    setDirty(false);
    setNotice("");
  };

  const patch = (update: Partial<WebsiteRecord>) => {
    setDraft((prev) => (prev ? { ...prev, ...update } : prev));
    setDirty(true);
    setNotice("");
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await saveWebsiteContent(kind, draft, accessToken);
      setRecords((prev) =>
        draft.id
          ? prev.map((r) => (r.id === saved.id ? saved : r))
          : [...prev, saved],
      );
      setDraft(null);
      setDirty(false);
      setNotice(
        saved.status === "archived"
          ? "Saved in the archive."
          : "Saved. The website now shows the updated content.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function archive(record: WebsiteRecord) {
    if (busy || !discard()) return;
    setBusy(true);
    setError("");
    try {
      const status = record.status === "archived" ? "published" : "archived";
      const saved = await saveWebsiteContent(
        kind,
        { ...record, status },
        accessToken,
      );
      setRecords((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      setDraft(null);
      setDirty(false);
      setConfirmation(null);
      setNotice(
        status === "archived"
          ? "Archived. Hidden from the website."
          : "Restored to the website.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update this post.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(record: WebsiteRecord) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await deleteWebsiteContent(kind, record, accessToken);
      setRecords((prev) => prev.filter((r) => r.id !== record.id));
      if (draft?.id === record.id) {
        setDraft(null);
        setDirty(false);
      }
      setConfirmation(null);
      setNotice("Permanently deleted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  async function image(file: File | undefined, apply: (url: string) => void) {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      apply(await uploadWebsiteImage(file, accessToken));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  const upload = (label: string, onFile: (file: File | undefined) => void) => (
    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-slate-300 bg-[#fafbfc] px-3.5 py-2 text-[12px] font-medium text-slate-600 transition hover:border-[#0b2341]/40 hover:bg-white">
      <ImagePlus aria-hidden="true" className="h-3.5 w-3.5" />
      {label}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy || !isAdmin}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
        className="sr-only"
      />
    </label>
  );

  /* ---------------------------------------------------------------- */
  /* Preview tab                                                       */
  /* ---------------------------------------------------------------- */
  if (isPreview) {
    return (
      <div className="w-full">
        <div className="w-full space-y-4">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-[26px] font-bold leading-tight tracking-tight text-[#0b2341]">
                Welcome back, {greetingName}!
              </h1>
              <div className="mt-1 flex items-center gap-2 text-[13px] text-slate-500">
                <span>
                  {updatedLabel
                    ? `Updated ${updatedLabel}`
                    : "Waiting for update"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setUpdatedAt(new Date());
                    setPreviewReload((n) => n + 1);
                  }}
                  aria-label="Reload website preview"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition-colors hover:bg-[#e6f0f9] hover:text-[#0b2341] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/30"
                >
                  <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <a
              href={CLIENT_WEBSITE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 self-start rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[12px] font-semibold text-[#0b2341] shadow-sm transition hover:bg-[#f2f6fa] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b2341]/30"
            >
              Open website
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            </a>
          </header>

          <section
            aria-label="Client website preview"
            className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(11,35,65,0.04),0_8px_24px_-16px_rgba(11,35,65,0.16)]"
          >
            <iframe
              key={previewReload}
              src={CLIENT_WEBSITE_URL}
              title="Alzhen client website preview"
              loading="lazy"
              className="block h-[calc(100vh-17rem)] min-h-[700px] w-full border-0 bg-white"
            />
          </section>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* List tabs                                                         */
  /* ---------------------------------------------------------------- */
  const singular =
    kind === "trucks"
      ? "truck"
      : kind === "careers"
        ? "hiring post"
        : "announcement";

  const pageTitle =
    kind === "trucks"
      ? "Your fleet, on display."
      : kind === "careers"
        ? "Find your next team member."
        : "Keep your clients updated.";

  const pageSubtitle =
    kind === "trucks"
      ? "Manage truck photos, specifications, and common cargos."
      : kind === "careers"
        ? "Publish hiring posts with job details, requirements, and application instructions."
        : "Publish company news, updates, and advisories.";

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title={pageTitle}
        subtitle={pageSubtitle}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <GhostButton onClick={refresh} disabled={busy || loading}>
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
              Refresh
            </GhostButton>
            <PrimaryButton
              disabled={busy || loading || !isAdmin}
              onClick={() => {
                if (!discard()) return;
                setArchived(false);
                setDraft(blank(kind));
                setDirty(false);
                setNotice("");
              }}
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
              Add {singular}
            </PrimaryButton>
          </div>
        }
      />

      {!isAdmin && (
        <p
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800"
        >
          An administrator account is required to edit website content.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800"
        >
          {notice}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-full bg-white p-1 shadow-[0_1px_2px_rgba(11,35,65,0.06)]">
          {[false, true].map((value) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={archived === value}
              onClick={() => {
                if (!discard()) return;
                setDraft(null);
                setDirty(false);
                setArchived(value);
              }}
              className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition ${
                archived === value
                  ? "bg-[#0b2341] text-white"
                  : "text-slate-500 hover:text-[#0b2341]"
              }`}
            >
              {value ? "Archive" : "Published"}{" "}
              <span className="opacity-60">
                (
                {
                  records.filter((r) => (r.status === "archived") === value)
                    .length
                }
                )
              </span>
            </button>
          ))}
        </div>
        <span className="text-[12px] text-slate-400">
          Archived posts stay here until you restore or permanently delete them.
        </span>
      </div>

      {loading ? (
        <Card className="p-12 text-center text-[13px] text-slate-500">
          Loading website content…
        </Card>
      ) : visibleRecords.length === 0 ? (
        <Card className="p-12 text-center">
          <h2 className="text-[16px] font-semibold text-[#0b2341]">
            {error ? "Content unavailable" : `No ${kind} yet`}
          </h2>
          <p className="mt-1 text-[13px] text-slate-500">
            {error
              ? "Resolve the connection issue above, then refresh."
              : "Add your first item using the button above."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleRecords.map((r) => (
            <Card key={r.id} className="flex flex-col overflow-hidden">
              {kind === "careers" ? (
                <div className="flex h-[92px] items-center justify-center bg-[#eaf5f1] text-[#21836f]">
                  <BriefcaseBusiness aria-hidden="true" className="h-7 w-7" />
                </div>
              ) : r.images?.[0]?.url || r.imageUrl ? (
                <img
                  src={r.images?.[0]?.url || r.imageUrl}
                  alt={title(r)}
                  className="h-[156px] w-full object-cover"
                />
              ) : (
                <div
                  className={`flex h-[156px] items-center justify-center ${
                    kind === "trucks"
                      ? "bg-[#eaf2f9] text-[#2678b9]"
                      : "bg-[#fff8df] text-[#a87900]"
                  }`}
                >
                  {kind === "trucks" ? (
                    <Truck aria-hidden="true" className="h-7 w-7" />
                  ) : (
                    <Megaphone aria-hidden="true" className="h-7 w-7" />
                  )}
                </div>
              )}

              <div className="flex flex-1 flex-col p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <StatusChip
                    tone={
                      kind === "trucks"
                        ? "slate"
                        : kind === "careers"
                          ? "emerald"
                          : "amber"
                    }
                  >
                    {kind === "trucks"
                      ? "Fleet vehicle"
                      : kind === "careers"
                        ? "Career opportunity"
                        : "Announcement"}
                  </StatusChip>
                  {kind !== "trucks" && (
                    <time className="text-[11px] text-slate-400">{r.date}</time>
                  )}
                </div>

                <h2 className="truncate text-[14px] font-semibold text-[#0b2341]">
                  {title(r)}
                </h2>

                {kind === "trucks" ? (
                  <dl className="mt-3 grid gap-1.5">
                    {[
                      ["Max load", r.maxLoad || "Not specified"],
                      ["Dimensions", r.dimensions || "Not specified"],
                      ...(r.volume ? [["Volume", r.volume] as const] : []),
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex items-center justify-between gap-3 rounded-lg bg-[#f5f8fb] px-2.5 py-1.5"
                      >
                        <dt className="text-[11px] text-slate-500">{label}</dt>
                        <dd className="truncate text-[11px] font-semibold text-[#0b2341]">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-2 line-clamp-3 text-[12px] leading-snug text-slate-500">
                    {r.content}
                  </p>
                )}

                <div className="mt-auto flex flex-wrap gap-2 pt-3">
                  <button
                    type="button"
                    disabled={busy || !isAdmin}
                    onClick={() => edit(r)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Pencil aria-hidden="true" className="h-3 w-3" />
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busy || !isAdmin}
                    onClick={() => {
                      setError("");
                      setConfirmation({ action: "archive", record: r });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Archive aria-hidden="true" className="h-3 w-3" />
                    {r.status === "archived" ? "Restore" : "Archive"}
                  </button>
                  {r.status === "archived" && (
                    <button
                      type="button"
                      disabled={busy || !isAdmin}
                      onClick={() => {
                        setError("");
                        setConfirmation({ action: "delete", record: r });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                    >
                      <Trash2 aria-hidden="true" className="h-3 w-3" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {draft && (
        <ContentDialog
          label={draft.id ? "Edit post" : "Add post"}
          close={() => {
            if (!busy && discard()) {
              setDraft(null);
              setDirty(false);
            }
          }}
        >
          <form className="p-5" onSubmit={save}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold text-[#0b2341]">
                {draft.id ? "Edit" : "Add"} {singular}
              </h2>
              <button
                type="button"
                aria-label="Close editor"
                disabled={busy}
                onClick={() => {
                  if (discard()) {
                    setDraft(null);
                    setDirty(false);
                  }
                }}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            {error && (
              <p
                role="alert"
                className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800"
              >
                {error}
              </p>
            )}

            <fieldset
              disabled={busy || !isAdmin}
              className="grid gap-3.5 border-0 p-0"
            >
              {kind === "trucks" ? (
                <>
                  <label className="grid gap-1.5 text-[12px] font-medium text-slate-600">
                    Truck type
                    <select
                      value={draft.truckType}
                      onChange={(e) => patch({ truckType: e.target.value })}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-800 outline-none focus:border-[#2678b9] focus:ring-2 focus:ring-[#2678b9]/15"
                    >
                      {truckTypes.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {draft.truckType === "OTHER" && (
                    <label className="grid gap-1.5 text-[12px] font-medium text-slate-600">
                      Other truck type
                      <input
                        required
                        maxLength={100}
                        value={draft.otherTruckType || ""}
                        onChange={(e) =>
                          patch({ otherTruckType: e.target.value })
                        }
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-800 outline-none focus:border-[#2678b9] focus:ring-2 focus:ring-[#2678b9]/15"
                      />
                    </label>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-[12px] font-medium text-slate-600">
                      Maximum load
                      <input
                        required
                        maxLength={100}
                        value={draft.maxLoad || ""}
                        placeholder="e.g. 20 tonnes"
                        onChange={(e) => patch({ maxLoad: e.target.value })}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-800 outline-none focus:border-[#2678b9] focus:ring-2 focus:ring-[#2678b9]/15"
                      />
                    </label>
                    <label className="grid gap-1.5 text-[12px] font-medium text-slate-600">
                      Volume (optional)
                      <input
                        maxLength={100}
                        value={draft.volume || ""}
                        placeholder="e.g. 40–55 CBM"
                        onChange={(e) => patch({ volume: e.target.value })}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-800 outline-none focus:border-[#2678b9] focus:ring-2 focus:ring-[#2678b9]/15"
                      />
                    </label>
                  </div>
                  <label className="grid gap-1.5 text-[12px] font-medium text-slate-600">
                    Dimensions
                    <input
                      required
                      maxLength={150}
                      value={draft.dimensions || ""}
                      placeholder="e.g. 8 ft × 7.5 ft × 32 ft"
                      onChange={(e) => patch({ dimensions: e.target.value })}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-800 outline-none focus:border-[#2678b9] focus:ring-2 focus:ring-[#2678b9]/15"
                    />
                  </label>

                  <div className="mt-1 flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold text-[#0b2341]">
                      Truck photos
                    </h3>
                    <span className="text-[12px] text-slate-500">
                      {draft.images?.length || 0}/3
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    One to three photos. JPEG, PNG, or WebP, up to 5 MB each.
                    First photo is the cover.
                  </p>
                  <div className="flex flex-wrap gap-2.5">
                    {draft.images?.map((photo, i) => (
                      <div key={`${photo.url}-${i}`} className="relative">
                        <img
                          src={photo.url}
                          alt={photo.alt || "Truck photo"}
                          className="h-24 w-32 rounded-lg object-cover"
                        />
                        <button
                          type="button"
                          aria-label={`Remove photo ${i + 1}`}
                          onClick={() =>
                            patch({
                              images: draft.images?.filter((_, n) => n !== i),
                            })
                          }
                          className="absolute right-1 top-1 rounded-full bg-white p-1 text-slate-700 shadow"
                        >
                          <X aria-hidden="true" className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {(draft.images?.length || 0) < 3 &&
                    upload("Upload truck photo", (file) =>
                      void image(file, (url) =>
                        patch({
                          images: [
                            ...(draft.images || []),
                            { url, alt: title(draft) },
                          ],
                        }),
                      ),
                    )}

                  <div className="mt-1 flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold text-[#0b2341]">
                      Common cargos
                    </h3>
                    <GhostButton
                      disabled={(draft.commonCargos?.length || 0) >= 24}
                      onClick={() =>
                        patch({
                          commonCargos: [
                            ...(draft.commonCargos || []),
                            {
                              id: crypto.randomUUID(),
                              name: "",
                              imageUrl: "",
                              imageAlt: "",
                            },
                          ],
                        })
                      }
                    >
                      <Plus aria-hidden="true" className="h-3 w-3" />
                      Add cargo
                    </GhostButton>
                  </div>
                  {draft.commonCargos?.map((c, i) => (
                    <div
                      key={c.id}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border border-slate-200 p-2.5"
                    >
                      {c.imageUrl && (
                        <img
                          src={c.imageUrl}
                          alt={c.name || "Cargo"}
                          className="h-12 w-16 rounded-md object-cover"
                        />
                      )}
                      <label className="grid gap-1 text-[12px] font-medium text-slate-600">
                        Cargo name
                        <input
                          required
                          maxLength={100}
                          value={c.name}
                          onChange={(e) =>
                            patch({
                              commonCargos: draft.commonCargos?.map(
                                (entry, n) =>
                                  n === i
                                    ? { ...entry, name: e.target.value }
                                    : entry,
                              ),
                            })
                          }
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 outline-none focus:border-[#2678b9] focus:ring-2 focus:ring-[#2678b9]/15"
                        />
                      </label>
                      {upload(c.imageUrl ? "Replace" : "Photo", (file) =>
                        void image(file, (url) =>
                          patch({
                            commonCargos: draft.commonCargos?.map((entry, n) =>
                              n === i
                                ? {
                                    ...entry,
                                    imageUrl: url,
                                    imageAlt: entry.name,
                                  }
                                : entry,
                            ),
                          }),
                        ),
                      )}
                      <IconButton
                        label={`Remove cargo ${i + 1}`}
                        onClick={() =>
                          patch({
                            commonCargos: draft.commonCargos?.filter(
                              (_, n) => n !== i,
                            ),
                          })
                        }
                      >
                        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <label className="grid gap-1.5 text-[12px] font-medium text-slate-600">
                    {kind === "careers" ? "Job title" : "Announcement title"}
                    <input
                      required
                      maxLength={160}
                      value={draft.title || ""}
                      onChange={(e) => patch({ title: e.target.value })}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-800 outline-none focus:border-[#2678b9] focus:ring-2 focus:ring-[#2678b9]/15"
                    />
                  </label>
                  <p className="text-[12px] text-slate-500">
                    Posted on {draft.date} · Set automatically (Philippine time)
                  </p>
                  <label className="grid gap-1.5 text-[12px] font-medium text-slate-600">
                    {kind === "careers"
                      ? "Job description / responsibilities"
                      : "Content"}
                    <textarea
                      rows={4}
                      required
                      maxLength={12000}
                      value={draft.content || ""}
                      onChange={(e) => patch({ content: e.target.value })}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-800 outline-none focus:border-[#2678b9] focus:ring-2 focus:ring-[#2678b9]/15"
                    />
                  </label>
                  {kind === "careers" ? (
                    <>
                      <label className="grid gap-1.5 text-[12px] font-medium text-slate-600">
                        Qualifications
                        <textarea
                          rows={4}
                          required
                          maxLength={12000}
                          value={draft.qualifications || ""}
                          onChange={(e) =>
                            patch({ qualifications: e.target.value })
                          }
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-800 outline-none focus:border-[#2678b9] focus:ring-2 focus:ring-[#2678b9]/15"
                        />
                      </label>
                      <p className="text-[11px] text-slate-500">
                        How to apply: Send your application to
                        alzhentruckingservices@gmail.com.
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-[13px] font-semibold text-[#0b2341]">
                        Announcement image
                      </h3>
                      {draft.imageUrl && (
                        <div>
                          <img
                            src={draft.imageUrl}
                            alt="Post preview"
                            className="max-h-[200px] w-full rounded-lg object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => patch({ imageUrl: "" })}
                            className="mt-2 text-[12px] text-rose-700 hover:underline"
                          >
                            Remove photo
                          </button>
                        </div>
                      )}
                      {upload(
                        draft.imageUrl ? "Replace image" : "Upload image",
                        (file) =>
                          void image(file, (url) => patch({ imageUrl: url })),
                      )}
                      <p className="text-[11px] text-slate-500">
                        Optional. JPEG, PNG, or WebP, up to 5 MB.
                      </p>
                    </>
                  )}
                </>
              )}
            </fieldset>

            <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-slate-500">
                {draft.status === "archived"
                  ? "This post will stay in the archive."
                  : "Saving publishes these details to the client website."}
              </p>
              <PrimaryButton type="submit" disabled={busy || !isAdmin}>
                {busy
                  ? "Working…"
                  : draft.status === "archived"
                    ? "Save archived post"
                    : "Save & publish"}
              </PrimaryButton>
            </div>
          </form>
        </ContentDialog>
      )}

      {confirmation && (
        <ContentDialog
          compact
          label="Confirm action"
          close={() => {
            if (!busy) setConfirmation(null);
          }}
        >
          <div className="p-6">
            <h2 className="text-[17px] font-semibold text-[#0b2341]">
              {confirmation.action === "delete"
                ? "Permanently delete this post?"
                : confirmation.record.status === "archived"
                  ? "Restore this post?"
                  : "Archive this post?"}
            </h2>
            <p className="mt-2 text-[14px] font-semibold text-slate-800">
              {title(confirmation.record)}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
              {confirmation.action === "delete"
                ? "This cannot be undone. You can keep it archived instead."
                : confirmation.record.status === "archived"
                  ? "It will appear on the client website again."
                  : "It will be hidden from the client website. You can restore it anytime."}
            </p>
            {error && (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700"
              >
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <GhostButton
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                Cancel
              </GhostButton>
              <PrimaryButton
                disabled={busy}
                onClick={() =>
                  void (confirmation.action === "delete"
                    ? remove(confirmation.record)
                    : archive(confirmation.record))
                }
              >
                {busy
                  ? "Working…"
                  : confirmation.action === "delete"
                    ? "Delete permanently"
                    : confirmation.record.status === "archived"
                      ? "Restore"
                      : "Archive"}
              </PrimaryButton>
            </div>
          </div>
        </ContentDialog>
      )}
    </div>
  );
}
