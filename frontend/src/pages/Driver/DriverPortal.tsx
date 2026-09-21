import { useState } from "react";
import {
  Camera,
  CheckCircle2,
  Clock3,
  LogOut,
  MapPin,
  Upload,
} from "lucide-react";
import heroImage from "../../assets/hero.png";
import logo from "../../assets/logo.png";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../context/AuthContext";

type DeliveryStatus =
  | "Assigned"
  | "Arrived at store"
  | "Loading"
  | "Unloading"
  | "Delivered";

const statusSteps: DeliveryStatus[] = [
  "Assigned",
  "Arrived at store",
  "Loading",
  "Unloading",
  "Delivered",
];

export default function DriverPortal() {
  const { logout } = useAuth();
  const { addToast } = useToast();
  const [status, setStatus] = useState<DeliveryStatus>("Assigned");
  const [podFile, setPodFile] = useState("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const currentStep = statusSteps.indexOf(status);

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
    } catch (error) {
      addToast({
        title: "Unable to log out completely. Please try again.",
        variant: "error",
        duration: 3500,
      });
    } finally {
      setLogoutLoading(false);
    }
  };

  return (
    <div className="dotted-surface min-h-screen bg-[#f7faff]">
      <header className="border-b border-[#dbe2e9] bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <img
              src={logo}
              alt="Alzhen Trucking"
              className="h-10 w-10 rounded-full border border-slate-200 bg-white object-contain p-1"
            />
            <div>
              <p className="text-sm font-bold text-slate-900">ALZHEN</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">
                Driver Portal
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Log out"
            onClick={() => setShowLogoutConfirm(true)}
            className="cursor-pointer rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5 sm:px-6">
        {/* Hero */}
        <div className="relative h-36 overflow-hidden rounded-3xl bg-slate-900 shadow-sm">
          <img
            src={heroImage}
            alt="Alzhen delivery truck"
            className="h-full w-full object-cover object-center opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 via-slate-900/30 to-transparent" />
          <div className="absolute inset-y-0 left-0 flex max-w-xs flex-col justify-center px-5 text-white">
            <p className="text-xs font-medium uppercase tracking-wider text-blue-200">
              Good morning, Driver
            </p>
            <h1 className="mt-1 text-xl font-semibold">Your assigned trip</h1>
          </div>
        </div>

        {/* Trip summary */}
        <section className="rounded-3xl border border-[#dbe2e9] bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)] sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Trip reference
              </p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">
                TR-0981
              </h2>
              <p className="mt-1 text-sm text-slate-600">Valenzuela to CDO</p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-700">
              {status}
            </span>
          </div>
          <div className="mt-5 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-600" />
              Delivery: Robinsons Appliance - CDO
            </p>
            <p className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-blue-600" />
              ETA: Today, 18:30
            </p>
          </div>
        </section>

        {/* Status update */}
        <section className="rounded-3xl border border-[#dbe2e9] bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)] sm:p-5">
          <h2 className="text-lg font-semibold text-slate-900">
            Update delivery status
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Send one update as the trip progresses. Each update records the
            current time.
          </p>
          <div className="mt-4 space-y-2">
            {statusSteps.map((step, index) => (
              <button
                key={step}
                type="button"
                onClick={() => setStatus(step)}
                className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm transition ${
                  index <= currentStep
                    ? "border-blue-200 bg-blue-50 text-blue-800"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}>
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full ${
                    index <= currentStep
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100"
                  }`}>
                  {index < currentStep ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="font-medium">{step}</span>
                {index === currentStep && (
                  <span className="ml-auto text-xs">Current</span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* POD */}
        <section className="rounded-3xl border border-[#dbe2e9] bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)] sm:p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Submit POD
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Upload a clear photo of the signed delivery receipt. Enter the
                DR number before submitting.
              </p>
            </div>
          </div>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            DR number
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 outline-none transition focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              placeholder="Enter DR number"
            />
          </label>

          <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 px-4 py-4 text-sm font-medium text-blue-700 transition hover:bg-blue-100">
            <Upload className="h-4 w-4" />
            {podFile || "Choose POD photo"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) =>
                setPodFile(event.target.files?.[0]?.name ?? "")
              }
            />
          </label>

          <button
            type="button"
            className="mt-4 w-full cursor-pointer rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
            Submit POD
          </button>
        </section>
      </main>

      <ConfirmDialog
        open={showLogoutConfirm}
        title="Log out"
        description="Are you sure you want to log out?"
        cancelLabel="Cancel"
        confirmLabel="Log out"
        confirmDisabled={logoutLoading}
        isConfirming={logoutLoading}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => void handleConfirmLogout()}
      />
    </div>
  );
}
