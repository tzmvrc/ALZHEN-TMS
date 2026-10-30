import {
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Pencil,
  TriangleAlert,
  X,
} from "lucide-react";
import {ToastContext} from "./toast-context";
import {createPortal} from 'react-dom';

export type ToastVariant = "success" | "error" | "info" | "warning";

export type ToastItem = {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration?: number;
  notificationKey?: string;
  activity?: boolean;
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = nextId.current++;
    const item: ToastItem = {
      ...toast,
      id,
      duration: toast.duration ?? 3000,
    };

    setToasts((current) => [...current.filter(existing => !toast.notificationKey || existing.notificationKey !== toast.notificationKey), item]);
  }, []);

  const value = useMemo(() => ({ addToast, dismissToast }), [addToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  return context;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  const [host,setHost]=useState<HTMLElement|null>(null);
  useEffect(()=>{
    if(!toasts.length)return;
    // Native modal dialogs sit above every z-index. Keep the existing toast
    // inside the active dialog's top layer while the upload form is open.
    const locate=()=>{
      const focused=document.activeElement?.closest<HTMLDialogElement>('dialog[open]');
      setHost(focused??Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).at(-1)??document.body);
    };
    locate();const observer=new MutationObserver(locate);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
    document.addEventListener('focusin',locate);
    return()=>{observer.disconnect();document.removeEventListener('focusin',locate);};
  },[toasts.length]);
  if(!toasts.length)return null;
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-3 top-3 z-[2300] flex max-w-full justify-center sm:inset-x-0 sm:top-4 sm:justify-center"
      style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
      <div className="flex max-h-[calc(100dvh-48px)] w-full max-w-sm flex-col gap-3 overflow-y-auto sm:w-[360px]">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </div>
    </div>,host?.isConnected?host:document.body
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsLeaving(true);
      window.setTimeout(() => onDismiss(toast.id), 180);
    }, toast.duration ?? 3000);

    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.duration, toast.id]);

  const variants = {
    success: {
      icon: CheckCircle2,
      wrapper: "border-emerald-200 bg-emerald-50 text-emerald-900",
      iconWrap: "bg-emerald-100 text-emerald-700",
      text: "text-emerald-700",
    },
    error: {
      icon: AlertCircle,
      wrapper: "border-red-200 bg-red-50 text-red-900",
      iconWrap: "bg-red-100 text-red-700",
      text: "text-red-700",
    },
    warning: {
      icon: TriangleAlert,
      wrapper: "border-amber-200 bg-amber-50 text-amber-900",
      iconWrap: "bg-amber-100 text-amber-700",
      text: "text-amber-700",
    },
    info: {
      icon: Info,
      wrapper: "border-slate-200 bg-white text-slate-800",
      iconWrap: "bg-slate-100 text-slate-700",
      text: "text-slate-700",
    },
  } as const;

  const config = toast.activity ? {
    icon: Pencil,
    wrapper: "border-[#dce5f0] border-l-[3px] border-l-[#2678b9] bg-white text-[#0b2341]",
    iconWrap: "bg-[#eaf2fa] text-[#2678b9]",
    text: "text-[#526580]",
  } : variants[toast.variant];
  const Icon = config.icon;

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-3 shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur-sm ${config.wrapper} ${isLeaving ? "animate-toast-out" : "animate-toast-in"}`}
      role={toast.variant === "error" ? "alert" : "status"}
      aria-live={toast.variant === "error" ? "assertive" : "polite"}>
      <div
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${config.iconWrap}`}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-5">{toast.title}</p>
        {toast.description ? (
          <p className={`mt-1 text-xs leading-5 ${config.text}`}>
            {toast.description}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => {
          setIsLeaving(true);
          window.setTimeout(() => onDismiss(toast.id), 180);
        }}
        className="mt-0.5 inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-500 transition hover:bg-black/5 hover:text-slate-700 focus:outline-none"
        aria-label="Dismiss notification">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
