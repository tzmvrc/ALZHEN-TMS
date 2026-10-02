import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  BriefcaseBusiness,
  Archive,
  Monitor,
  Plus,
  Truck,
  Megaphone,
  ExternalLink,
  LogOut,
  RefreshCw,
  Trash2,
  Pencil,
  ImagePlus,
  X,
} from "lucide-react";
import {
  WorkspaceSwitcher,
  type WorkspaceName,
} from "../../components/admin/SidebarNav";
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
const types = [
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
        date: new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Manila", year:"numeric", month:"2-digit", day:"2-digit"}).format(new Date()),
        imageUrl: "",
      };
const title = (r: WebsiteRecord) =>
  r.title ||
  (r.truckType === "OTHER"
    ? r.otherTruckType
    : types.find((t) => t.value === r.truckType)?.label) ||
  r.name ||
  "Untitled";

function ContentDialog({children, label, close, compact = false}: {children:ReactNode; label:string; close:()=>void; compact?:boolean}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.body.style.overflow;
    dialog?.showModal(); document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = previous; };
  }, []);
  return <dialog ref={ref} className={`cw-dialog ${compact ? "cw-dialog-small" : ""}`} aria-label={label} onCancel={e => {e.preventDefault(); close();}}>{children}</dialog>;
}

export default function ClientWebsiteWorkspace({
  userName,
  onWorkspaceChange,
  onLogout,
}: {
  userName: string;
  onWorkspaceChange: (workspace: WorkspaceName) => void;
  onLogout: () => void;
}) {
  const { accessToken, isAdmin } = useAuth();
  const [kind, setKind] = useState<Collection>("trucks"),
    [records, setRecords] = useState<WebsiteRecord[]>([]),
    [draft, setDraft] = useState<WebsiteRecord | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const website = (
    import.meta.env.VITE_CLIENT_WEBSITE_URL || "http://localhost:3000"
  ).replace(/\/$/, "");
  const [preview, setPreview] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [archived, setArchived] = useState(false);
  const [confirmation, setConfirmation] = useState<{action:"archive" | "delete"; record:WebsiteRecord} | null>(null);
  const visibleRecords = records.filter(r => (r.status === "archived") === archived).sort((a,b) => kind !== "trucks" ? (b._createdAt || b.date || "").localeCompare(a._createdAt || a.date || "") : 0);
  const requestNumber = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++requestNumber.current;
    try {
      const next = await listWebsiteContent(kind, accessToken);
      if (request === requestNumber.current) setRecords(next);
    } catch (e) {
      if (request === requestNumber.current)
        setError(e instanceof Error ? e.message : "Unable to load content.");
    } finally {
      if (request === requestNumber.current) setLoading(false);
    }
  }, [kind, accessToken]);
  useEffect(() => {
    let active = true;
    const request = ++requestNumber.current;
    listWebsiteContent(kind, accessToken)
      .then((next) => {
        if (active && request === requestNumber.current) setRecords(next);
      })
      .catch((e) => {
        if (active && request === requestNumber.current)
          setError(e instanceof Error ? e.message : "Unable to load content.");
      })
      .finally(() => {
        if (active && request === requestNumber.current) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind, accessToken]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const discard = () =>
    !dirty || window.confirm("Discard your unsaved changes?");
  function switchKind(next: Collection) {
    if (busy || !discard()) return;
    setPreview(false);
    setArchived(false);
    if (next === kind) { setDraft(null); setDirty(false); return; }
    requestNumber.current++;
    setLoading(true);
    setError("");
    setKind(next);
    setDraft(null);
    setDirty(false);
    setRecords([]);
    setNotice("");
  }
  function edit(record: WebsiteRecord) {
    if (!discard()) return;
    setDraft(structuredClone(record));
    setDirty(false);
    setNotice("");
  }
  function patch(update: Partial<WebsiteRecord>) {
    setDraft((prev) => (prev ? { ...prev, ...update } : prev));
    setDirty(true);
    setNotice("");
  }
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
        saved.status === "archived" ? "Saved in the archive. This post is hidden from the website." : "Saved. The updated content is now available to the client website.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }
  async function archive(record: WebsiteRecord) {
    if (busy || !discard()) return;
    setBusy(true); setError("");
    try {
      const status = record.status === "archived" ? "published" : "archived";
      const saved = await saveWebsiteContent(kind, { ...record, status }, accessToken);
      setRecords(prev => prev.map(r => r.id === saved.id ? saved : r));
      setDraft(null); setDirty(false);
      setConfirmation(null);
      setNotice(status === "archived" ? "Archived. This post is kept here and hidden from the website." : "Restored to the website.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update this post."); }
    finally { setBusy(false); }
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
  function cargo(index: number, update: Record<string, string>) {
    patch({
      commonCargos: draft?.commonCargos?.map((c, i) =>
        i === index ? { ...c, ...update } : c,
      ),
    });
  }
  const upload = (label: string, onFile: (file: File | undefined) => void) => (
    <label className="cw-upload">
      <ImagePlus size={16} />
      {label}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy || !isAdmin}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </label>
  );
  return (
    <div className="cw-workspace">
      <aside className="cw-sidebar">
        <WorkspaceSwitcher
          workspace="Client Website"
          onChange={(w) => {
            if (!busy && discard()) onWorkspaceChange(w);
          }}
        />
        <p className="cw-eyebrow">PUBLIC WEBSITE</p>
        <button
          className={!preview && kind === "trucks" ? "active" : ""}
          disabled={busy}
          onClick={() => switchKind("trucks")}
        >
          <Truck size={19} />
          Trucks
        </button>
        <button
          className={!preview && kind === "announcements" ? "active" : ""}
          disabled={busy}
          onClick={() => switchKind("announcements")}
        >
          <Megaphone size={19} />
          Announcements
        </button>
        <button className={!preview && kind === "careers" ? "active" : ""} disabled={busy} onClick={() => switchKind("careers")}><BriefcaseBusiness size={19}/>Careers</button>
        <button className={preview ? "active" : ""} disabled={busy} onClick={() => {
          if (!discard()) return;
          setDraft(null); setDirty(false); setPreview(true); setNotice(""); setError("");
        }}><Monitor size={19}/>Website Preview</button>
        <div className="cw-user">
          <strong>{userName}</strong>
          <span>Website management</span>
          <button
            disabled={busy}
            onClick={() => {
              if (discard()) onLogout();
            }}
          >
            <LogOut size={16} />
            Log out
          </button>
        </div>
      </aside>
      <main className="cw-main">
        <header className="cw-header">
          <div>
            <p className="cw-eyebrow">CLIENT WEBSITE</p>
            <h1>
              {preview ? "See it as your clients do." : kind === "trucks"
                ? "Your fleet, on display."
                : kind === "careers" ? "Find your next team member." : "Keep your clients updated."}
            </h1>
            <p>
              {preview ? "Check your published content and open the full website." : kind === "trucks"
                ? "Manage truck photos, specifications, and common cargos."
                : kind === "careers" ? "Publish hiring posts with job details, requirements, and application instructions." : "Publish company news, updates, and advisories."}
            </p>
          </div>
          <a href={`${website}/#${kind}`} target="_blank" rel="noreferrer">
            View website
            <ExternalLink size={16} />
          </a>
        </header>
        {!isAdmin && (
          <p role="alert" className="cw-error">
            An administrator account is required to edit website content.
          </p>
        )}
        {error && (
          <p role="alert" className="cw-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="cw-notice">
            {notice}
          </p>
        )}
        {preview ? <section className="cw-preview">
          <div className="cw-toolbar"><strong>Live website preview</strong><button onClick={() => setPreviewKey(k => k + 1)}><RefreshCw size={16}/>Reload preview</button></div>
          <iframe key={previewKey} src={`${website}/#${kind}`} title="Alzhen client website preview" />
        </section> : <>
        <div className="cw-filters" aria-label="Post status">
          {[false, true].map(value => <button key={String(value)} aria-pressed={archived === value} onClick={() => { if (!discard()) return; setDraft(null); setDirty(false); setArchived(value); }}>
            {value ? "Archive" : "Published"} ({records.filter(r => (r.status === "archived") === value).length})
          </button>)}
          <p>Archived posts stay here until you restore or permanently delete them.</p>
        </div>
        <div className="cw-toolbar">
          <strong>
            {visibleRecords.length} {archived ? `archived ${kind}` : kind}
          </strong>
          <div>
            <button
              disabled={busy || loading}
              onClick={() => {
                setLoading(true);
                setError("");
                void refresh();
              }}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            <button
              className="cw-primary"
              disabled={busy || loading || !isAdmin}
              onClick={() => { if (!discard()) return; setArchived(false); setDraft(blank(kind)); setDirty(false); setNotice(""); }}
            >
              <Plus size={17} />
              Add {kind === "trucks" ? "truck" : kind === "careers" ? "hiring post" : "announcement"}
            </button>
          </div>
        </div>
        <div className="cw-layout">
          <section aria-label={`${kind} list`} className="cw-records">
            {loading ? (
              <p className="cw-empty">Loading website content…</p>
            ) : visibleRecords.length === 0 ? (
              <div className="cw-empty">
                <h2>{error ? "Content unavailable" : `No ${kind} yet`}</h2>
                <p>
                  {error
                    ? "Resolve the setup or connection issue above, then refresh."
                    : "Add your first item using the button above."}
                </p>
              </div>
            ) : (
              visibleRecords.map((r) => (
                <article className="cw-record" key={r.id}>
                  {kind === "careers" ? null : r.images?.[0]?.url || r.imageUrl ? (
                    <img
                      className="cw-cover"
                      src={r.images?.[0]?.url || r.imageUrl}
                      alt={title(r)}
                    />
                  ) : (
                    <div className="cw-placeholder">
                      <Megaphone size={32} />
                    </div>
                  )}
                  <div className="cw-record-body">
                    <h2>{title(r)}</h2>
                    <p>
                      {kind === "trucks"
                        ? `${r.maxLoad} · ${r.dimensions}`
                        : r.date}
                    </p>
                    {kind !== "trucks" && (
                      <p className="cw-excerpt">{r.content}</p>
                    )}
                    <div className="cw-actions">
                      <button
                        disabled={busy || !isAdmin}
                        onClick={() => edit(r)}
                      >
                        <Pencil size={15} />
                        Edit
                      </button>
                      <button disabled={busy || !isAdmin} onClick={() => {setError(""); setConfirmation({action:"archive",record:r});}}><Archive size={15}/>{r.status === "archived" ? "Restore" : "Archive"}</button>
                      {r.status === "archived" && <button
                        disabled={busy || !isAdmin}
                        onClick={() => {setError(""); setConfirmation({action:"delete",record:r});}}
                      >
                        <Trash2 size={15} />
                        Delete permanently
                      </button>}
                    </div>
                  </div>
                </article>
              ))
            )}
          </section>
          {draft && (
            <ContentDialog label={draft.id ? "Edit post" : "Add post"} close={() => {if (!busy && discard()) {setDraft(null); setDirty(false);}}}>
            <form className="cw-editor" onSubmit={save}>
              <div className="cw-editor-heading">
                <h2>
                  {draft.id ? "Edit" : "Add"}{" "}
                  {kind === "trucks" ? "truck" : kind === "careers" ? "hiring post" : "announcement"}
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
                >
                  <X size={20} />
                </button>
              </div>
              {error && <p role="alert" className="cw-error">{error}</p>}
              <fieldset disabled={busy || !isAdmin}>
                {kind === "trucks" ? (
                  <>
                    <label>
                      Truck type
                      <select
                        value={draft.truckType}
                        onChange={(e) => patch({ truckType: e.target.value })}
                      >
                        {types.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {draft.truckType === "OTHER" && (
                      <label>
                        Other truck type
                        <input
                          required
                          maxLength={100}
                          value={draft.otherTruckType || ""}
                          onChange={(e) =>
                            patch({ otherTruckType: e.target.value })
                          }
                        />
                      </label>
                    )}
                    <div className="cw-fields">
                      <label>
                        Maximum load
                        <input
                          required
                          maxLength={100}
                          value={draft.maxLoad || ""}
                          placeholder="e.g. 20 tonnes"
                          onChange={(e) => patch({ maxLoad: e.target.value })}
                        />
                      </label>
                      <label>
                        Volume (optional)
                        <input
                          maxLength={100}
                          value={draft.volume || ""}
                          placeholder="e.g. 40–55 CBM"
                          onChange={(e) => patch({ volume: e.target.value })}
                        />
                      </label>
                    </div>
                    <label>
                      Dimensions
                      <input
                        required
                        maxLength={150}
                        value={draft.dimensions || ""}
                        placeholder="e.g. 8 ft × 7.5 ft × 32 ft"
                        onChange={(e) => patch({ dimensions: e.target.value })}
                      />
                    </label>
                    <div className="cw-section-heading">
                      <h3>Truck photos</h3>
                      <span>{draft.images?.length || 0}/3</span>
                    </div>
                    <p className="cw-hint">
                      One to three photos. JPEG, PNG, or WebP, up to 5 MB each.
                      First photo is the cover.
                    </p>
                    <div className="cw-photos">
                      {draft.images?.map((photo, i) => (
                        <div key={`${photo.url}-${i}`}>
                          <img
                            src={photo.url}
                            alt={photo.alt || "Truck photo"}
                          />
                          <button
                            type="button"
                            aria-label={`Remove photo ${i + 1}`}
                            onClick={() =>
                              patch({
                                images: draft.images?.filter((_, n) => n !== i),
                              })
                            }
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                    {(draft.images?.length || 0) < 3 &&
                      upload(
                        "Upload truck photo",
                        (file) =>
                          void image(file, (url) =>
                            patch({
                              images: [
                                ...(draft.images || []),
                                { url, alt: title(draft) },
                              ],
                            }),
                          ),
                      )}
                    <div className="cw-section-heading">
                      <h3>Common cargos</h3>
                      <button
                        type="button"
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
                        <Plus size={15} />
                        Add cargo
                      </button>
                    </div>
                    {draft.commonCargos?.map((c, i) => (
                      <div className="cw-cargo" key={c.id}>
                        {c.imageUrl && (
                          <img src={c.imageUrl} alt={c.name || "Cargo"} />
                        )}
                        <label>
                          Cargo name
                          <input
                            required
                            maxLength={100}
                            value={c.name}
                            onChange={(e) => cargo(i, { name: e.target.value })}
                          />
                        </label>
                        {upload(
                          c.imageUrl ? "Replace photo" : "Cargo photo",
                          (file) =>
                            void image(file, (url) =>
                              cargo(i, { imageUrl: url, imageAlt: c.name }),
                            ),
                        )}
                        <button
                          type="button"
                          aria-label={`Remove cargo ${i + 1}`}
                          onClick={() =>
                            patch({
                              commonCargos: draft.commonCargos?.filter(
                                (_, n) => n !== i,
                              ),
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <label>
                      {kind === "careers" ? "Job title" : "Announcement title"}
                      <input
                        required
                        maxLength={160}
                        value={draft.title || ""}
                        onChange={(e) => patch({ title: e.target.value })}
                      />
                    </label>
                    <p className="cw-date">Posted on {draft.date} · Set automatically (Philippine time)</p>
                    <label>
                      {kind === "careers" ? "Job description / responsibilities" : "Content"}
                      <textarea
                        rows={4}
                        required
                        maxLength={12000}
                        value={draft.content || ""}
                        onChange={(e) => patch({ content: e.target.value })}
                      />
                    </label>
                    {kind === "careers" ? <>
                      <label>Qualifications<textarea rows={4} required maxLength={12000} value={draft.qualifications || ""} onChange={e => patch({qualifications:e.target.value})}/></label>
                      <p className="cw-hint">How to apply: Send your application to alzhentruckingservices@gmail.com.</p>
                    </> : <>
                    <h3>Announcement image</h3>
                    {draft.imageUrl && (
                      <div className="cw-announcement-photo">
                        <img src={draft.imageUrl} alt="Post preview" />
                        <button
                          type="button"
                          onClick={() => patch({ imageUrl: "" })}
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
                    <p className="cw-hint">
                      Optional. JPEG, PNG, or WebP, up to 5 MB.
                    </p></>}
                  </>
                )}
              </fieldset>
              <div className="cw-save">
                <p>{draft.status === "archived" ? "This post will stay in the archive." : "Saving publishes these details to the client website."}</p>
                <button
                  type="submit"
                  className="cw-primary"
                  disabled={busy || !isAdmin}
                >
                  {busy ? "Working…" : draft.status === "archived" ? "Save archived post" : "Save & publish"}
                </button>
              </div>
            </form>
            </ContentDialog>
          )}
        </div>
        </>}
        {confirmation && <ContentDialog compact label="Confirm action" close={() => {if (!busy) setConfirmation(null);}}>
          <div className="cw-confirm">
            <h2>{confirmation.action === "delete" ? "Permanently delete this post?" : confirmation.record.status === "archived" ? "Restore this post?" : "Archive this post?"}</h2>
            <p><strong>{title(confirmation.record)}</strong></p>
            <p>{confirmation.action === "delete" ? "This cannot be undone. You can keep it archived instead." : confirmation.record.status === "archived" ? "It will appear on the client website again." : "It will be hidden from the client website. You can restore it anytime."}</p>
            {error && <p role="alert" className="cw-error">{error}</p>}
            <div className="cw-actions"><button disabled={busy} onClick={() => setConfirmation(null)}>Cancel</button><button className="cw-primary" disabled={busy} onClick={() => void (confirmation.action === "delete" ? remove(confirmation.record) : archive(confirmation.record))}>{busy ? "Working…" : confirmation.action === "delete" ? "Delete permanently" : confirmation.record.status === "archived" ? "Restore" : "Archive"}</button></div>
          </div>
        </ContentDialog>}
      </main>
    </div>
  );
}
