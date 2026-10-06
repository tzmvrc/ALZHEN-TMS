import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  FileCheck2,
  LogOut,
  MapPin,
  PackageCheck,
  Truck,
  Upload,
} from "lucide-react";
import logo from "../../assets/logo.png";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";

const deliverySteps = [
  {
    label: "Trip assigned",
    detail: "Ready to start",
    nextAction: "Start my trip",
  },
  {
    label: "On the way",
    detail: "Trip is in progress",
    nextAction: "I have arrived at the store",
  },
  {
    label: "At delivery stop",
    detail: "You are at the delivery location",
    nextAction: "Start unloading",
  },
  {
    label: "Unloading",
    detail: "Appliances are being unloaded",
    nextAction: "Delivery is complete",
  },
  {
    label: "Delivered",
    detail: "Delivery completed",
    nextAction: null,
  },
] as const;

type StatusTime = {
  label: string;
  time: string;
};

const cardClass =
  "rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_4px_18px_rgba(11,35,65,0.05)] sm:p-6";

export default function DriverPortal() {
  const { logout, profile } = useAuth();
  const { addToast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [statusTimes, setStatusTimes] = useState<StatusTime[]>([]);
  const [drNumber, setDrNumber] = useState("");
  const [podFile, setPodFile] = useState<File | null>(null);
  const [podPreview, setPodPreview] = useState<string | null>(null);
  const podPreviewUrl = useRef<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const currentStatus = deliverySteps[currentStep];
  const driverName = profile?.first_name?.trim() || "Driver";
  const progress = Math.round(
    (currentStep / (deliverySteps.length - 1)) * 100,
  );

  useEffect(
    () => () => {
      if (podPreviewUrl.current) URL.revokeObjectURL(podPreviewUrl.current);
    },
    [],
  );

  const handleConfirmLogout = async () => {
    setLogoutLoading(true);
    try {
      await logout();
      addToast({
        title: "Logged out successfully.",
        variant: "success",
        duration: 2500,
      });
      setShowLogoutConfirm(false);
      window.location.assign("/trucker/login");
    } catch {
      addToast({
        title: "Unable to log out completely. Please try again.",
        variant: "error",
        duration: 3500,
      });
    } finally {
      setLogoutLoading(false);
    }
  };

  const advanceStatus = () => {
    const nextStep = deliverySteps[currentStep + 1];
    if (!nextStep) return;

    setCurrentStep((step) => step + 1);
    setStatusTimes((times) => [
      ...times,
      {
        label: nextStep.label,
        time: new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        }),
      },
    ]);
    addToast({
      title: "Preview updated",
      description: "This update has not been sent to dispatch.",
      variant: "info",
      duration: 4000,
    });
  };

  const selectPodPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    if (!selectedFile) return;
    if (!selectedFile.type.startsWith("image/")) {
      addToast({
        title: "Choose a photo",
        description: "Please select an image of the signed delivery receipt.",
        variant: "error",
        duration: 3500,
      });
      event.target.value = "";
      return;
    }
    if (podPreviewUrl.current) URL.revokeObjectURL(podPreviewUrl.current);
    podPreviewUrl.current = URL.createObjectURL(selectedFile);
    setPodPreview(podPreviewUrl.current);
    setPodFile(selectedFile);
  };

  const previewPodUpload = () => {
    if (!drNumber.trim() || !podFile) return;
    addToast({
      title: "POD preview only",
      description: "The receipt has not been uploaded to dispatch.",
      variant: "warning",
      duration: 4000,
    });
  };

  return (
    <div className="driver-portal min-h-screen bg-[#f1f5f8] text-[#0b2341]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <img
              src={logo}
              alt="Alzhen Trucking Services"
              className="h-12 w-12 rounded-full border border-slate-200 bg-white object-contain p-1"
            />
            <div>
              <p className="text-base font-extrabold tracking-wide">ALZHEN</p>
              <p className="text-xs font-medium text-slate-500">DRIVER PORTAL</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2678b9]"
          >
            <LogOut aria-hidden="true" className="h-5 w-5" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </header>

      <main className="bento-stagger mx-auto max-w-3xl space-y-5 px-4 py-5 sm:px-6 sm:py-7">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-base font-medium text-slate-600">
              Welcome, {driverName}
            </p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Your trip
            </h1>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-2 text-sm font-bold text-blue-900">
            <Truck aria-hidden="true" className="h-5 w-5" />
            Dispatch TR-0981
          </span>
        </div>

        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-base leading-6 text-amber-950"
        >
          <AlertCircle
            aria-hidden="true"
            className="mt-0.5 h-6 w-6 shrink-0 text-amber-700"
          />
          <p>
            <strong>Preview only.</strong> Trip updates and receipt photos are
            not connected to dispatch yet.
          </p>
        </div>

        <section aria-labelledby="trip-summary-title" className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Trip number
              </p>
              <h2
                id="trip-summary-title"
                className="mt-1 text-3xl font-extrabold"
              >
                TR-0981
              </h2>
            </div>
            <span
              key={currentStatus.label}
              className="bento-reveal inline-flex min-h-11 items-center rounded-full bg-blue-100 px-4 text-base font-bold text-blue-900"
            >
              {currentStatus.label}
            </span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#2678b9] shadow-sm">
                <MapPin aria-hidden="true" className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-500">FROM</p>
                <p className="mt-1 text-lg font-bold">Valenzuela Warehouse</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#2678b9] shadow-sm">
                <MapPin aria-hidden="true" className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-500">
                  DELIVER TO
                </p>
                <p className="mt-1 text-lg font-bold">
                  Robinsons Appliance — CDO
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3 border-t border-slate-200 pt-4">
            <Clock3 aria-hidden="true" className="h-6 w-6 shrink-0 text-[#2678b9]" />
            <p className="text-base">
              <span className="font-semibold text-slate-500">ESTIMATED ARRIVAL</span>
              <span className="ml-2 font-bold">Today, 6:30 PM</span>
            </p>
          </div>
        </section>

        <section aria-labelledby="status-title" className={cardClass}>
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e6f0f9] text-[#2678b9]">
              <Truck aria-hidden="true" className="h-6 w-6" />
            </span>
            <div>
              <h2 id="status-title" className="text-2xl font-extrabold">
                Trip status
              </h2>
              <p className="mt-1 text-base leading-6 text-slate-600">
                Tell dispatch when your trip or delivery progress changes.
              </p>
            </div>
          </div>

          <div className="mt-5" aria-label={`Trip progress: ${progress}%`}>
            <div className="flex items-center justify-between text-sm font-bold text-slate-600">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label="Trip progress"
              className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200"
            >
              <div
                className="h-full rounded-full bg-[#2678b9] transition-[width] duration-700 ease-out motion-reduce:transition-none"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <ol className="mt-5 space-y-3">
            {deliverySteps.map((step, index) => {
              const completed = index < currentStep;
              const active = index === currentStep;
              const time = statusTimes.find((item) => item.label === step.label);
              return (
                <li
                  key={step.label}
                  className={`flex min-h-[68px] items-center gap-4 rounded-2xl border px-4 py-3 transition-colors duration-300 ease-out motion-reduce:transition-none ${
                    active
                      ? "border-blue-300 bg-blue-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${
                      completed
                        ? "bg-emerald-100 text-emerald-800"
                        : active
                          ? "bg-[#2678b9] text-white"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {completed ? (
                      <Check aria-hidden="true" className="h-6 w-6" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-bold">{step.label}</span>
                    <span className="mt-0.5 block text-sm text-slate-600">
                      {time
                        ? `Updated at ${time.time}`
                        : active
                          ? step.detail
                          : "Not yet updated"}
                    </span>
                  </span>
                  {completed && (
                    <CheckCircle2
                      aria-label="Completed"
                      className="h-6 w-6 shrink-0 text-emerald-700"
                    />
                  )}
                </li>
              );
            })}
          </ol>

          {currentStatus.nextAction ? (
            <button
              type="button"
              onClick={advanceStatus}
              className="mt-5 inline-flex min-h-[68px] w-full items-center justify-center gap-3 rounded-2xl bg-[#0b2341] px-5 py-4 text-center text-xl font-extrabold text-white shadow-sm transition duration-300 ease-out hover:-translate-y-0.5 hover:bg-[#16385f] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:transform-none"
            >
              {currentStatus.nextAction}
              <ArrowRight aria-hidden="true" className="h-6 w-6 shrink-0" />
            </button>
          ) : (
            <div className="mt-5 flex min-h-[68px] items-center justify-center gap-3 rounded-2xl bg-emerald-50 px-5 text-xl font-bold text-emerald-900">
              <CheckCircle2 aria-hidden="true" className="h-7 w-7" />
              This trip is complete
            </div>
          )}
          <p className="mt-3 text-center text-sm leading-5 text-slate-500">
            Please stop in a safe place before using your phone.
          </p>
        </section>

        <section aria-labelledby="pod-title" className={cardClass}>
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
              <FileCheck2 aria-hidden="true" className="h-6 w-6" />
            </span>
            <div>
              <h2 id="pod-title" className="text-2xl font-extrabold">
                Delivery receipt
              </h2>
              <p className="mt-1 text-base leading-6 text-slate-600">
                After delivery, enter the DR number and take a clear photo of
                the signed receipt.
              </p>
            </div>
          </div>

          <label
            htmlFor="dr-number"
            className="mt-5 block text-base font-bold text-[#0b2341]"
          >
            DR number
            <input
              id="dr-number"
              value={drNumber}
              onChange={(event) => setDrNumber(event.target.value)}
              autoComplete="off"
              inputMode="text"
              placeholder="Enter the number on the receipt"
              className="mt-2 min-h-[58px] w-full rounded-2xl border-2 border-slate-300 bg-white px-4 text-lg text-[#0b2341] placeholder:text-slate-400 focus:border-[#2678b9] focus:outline-none focus:ring-4 focus:ring-blue-100"
            />
          </label>

          <label
            htmlFor="pod-photo"
            className="mt-4 flex min-h-[76px] cursor-pointer items-center gap-4 rounded-2xl border-2 border-dashed border-[#2678b9] bg-blue-50 px-4 py-4 text-[#0b2341] transition hover:bg-blue-100 focus-within:ring-4 focus-within:ring-blue-100"
          >
            {podPreview ? (
              <img
                src={podPreview}
                alt="Selected signed delivery receipt"
                className="h-14 w-14 shrink-0 rounded-xl border border-slate-200 bg-white object-cover"
              />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-[#2678b9]">
                <Camera aria-hidden="true" className="h-7 w-7" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-bold">
                {podFile ? "Receipt photo selected" : "Take or choose a photo"}
              </span>
              <span className="mt-0.5 block truncate text-sm text-slate-600">
                {podFile?.name ?? "Use your camera to photograph the signed receipt"}
              </span>
            </span>
            <Upload aria-hidden="true" className="h-6 w-6 shrink-0 text-[#2678b9]" />
            <input
              id="pod-photo"
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={selectPodPhoto}
            />
          </label>

          <button
            type="button"
            disabled={!drNumber.trim() || !podFile}
            onClick={previewPodUpload}
            className="mt-4 inline-flex min-h-[60px] w-full items-center justify-center gap-3 rounded-2xl bg-emerald-700 px-5 py-4 text-lg font-extrabold text-white transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <PackageCheck aria-hidden="true" className="h-6 w-6" />
            Save delivery receipt
          </button>
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-base leading-6 text-slate-700">
          <p className="font-bold text-[#0b2341]">Need help?</p>
          <p className="mt-1">
            If your route or delivery details look wrong, stop somewhere safe
            and call your dispatcher.
          </p>
        </aside>

        <footer className="pb-3 text-center text-sm text-slate-500">
          Alzhen Trucking Services · Drive safely
        </footer>
      </main>

      <ConfirmDialog
        open={showLogoutConfirm}
        title="Log out?"
        description="Are you sure you want to log out of the driver portal?"
        cancelLabel="Stay on trip"
        confirmLabel="Log out"
        confirmDisabled={logoutLoading}
        isConfirming={logoutLoading}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => void handleConfirmLogout()}
      />
    </div>
  );
}
