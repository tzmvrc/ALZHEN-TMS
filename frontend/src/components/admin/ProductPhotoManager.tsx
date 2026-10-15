import { useEffect, useState } from "react";
import { ImagePlus, LoaderCircle, Package, Trash2, X } from "lucide-react";
import {
  deleteProductPhoto,
  fetchProductPhoto,
  uploadProductPhoto,
} from "../../services/product-photo.service";

type Props = {
  token: string;
  productId: string;
  productLabel: string;
  onClose: () => void;
  onPhotoChange?: (url: string | null) => void;
};

export default function ProductPhotoManager({
  token,
  productId,
  productLabel,
  onClose,
  onPhotoChange,
}: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void fetchProductPhoto(productId, token).then(
      (photo) => {
        if (!active) return;
        setPhotoUrl(photo.signed_url);
        setError("");
      },
      (cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Unable to load product photo.");
        }
      },
    ).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [productId, token]);

  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError("Choose a JPEG, PNG, or WebP image up to 5 MB.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await uploadProductPhoto(productId, token, file);
      setPhotoUrl(result.signed_url);
      onPhotoChange?.(result.signed_url);
      setNotice("Product photo saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save product photo.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy || !photoUrl || !window.confirm(`Remove the photo for ${productLabel}?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await deleteProductPhoto(productId, token);
      setPhotoUrl(null);
      onPhotoChange?.(null);
      setNotice("Product photo removed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove product photo.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  return (
    <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-photo-title"
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id="product-photo-title" className="font-semibold text-[#0b2341]">Product photo</h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">{productLabel}</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close product photo"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5">
          <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-slate-100">
            {loading ? (
              <LoaderCircle className="h-6 w-6 animate-spin text-slate-400" />
            ) : photoUrl ? (
              <img src={photoUrl} alt={`${productLabel} product`} className="h-full w-full object-contain" />
            ) : (
              <Package aria-hidden="true" className="h-10 w-10 text-slate-300" />
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <label className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-[#ffd43b] px-4 text-sm font-semibold text-[#0b2341] hover:bg-[#f2c200] ${busy ? "pointer-events-none opacity-60" : ""}`}>
              <ImagePlus className="h-4 w-4" />
              {busy ? "Saving…" : photoUrl ? "Change photo" : "Upload photo"}
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(event) => {
                  void upload(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            {photoUrl && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove()}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-rose-200 px-4 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">JPEG, PNG, or WebP · up to 5 MB. This photo is shared wherever this product appears.</p>
          {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          {notice && <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}
        </div>
      </section>
    </div>
  );
}
