import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import logo from "../../assets/logo.png";

export default function DriverLoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // In a real app, this would be an auth call
    navigate("/driver");
  };

  return (
    <div className="flex min-h-screen w-full bg-[#f7faff] p-0 sm:p-4">
      {/* ───────── Full-screen dotted panel (like admin login) ───────── */}
      <div className="dotted-surface relative flex w-full flex-col justify-start border border-[#dbe2e9] px-6 py-12 sm:rounded-2xl sm:px-10 sm:py-16">
        <div className="relative z-10 mx-auto flex w-full max-w-sm flex-col">
          {/* Header */}
          <div className="text-center">
            {/* Logo tile */}
            <div className="relative mx-auto mb-3 h-[100px] w-[100px]">
              {/* soft glow — locked to same size as tile */}
              <div className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-blue-500/10 blur-xl" />

              {/* circular white tile — flex centers the image both axes */}
              <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
                <img
                  src={logo}
                  alt="Alzhen Trucking Services"
                  className="block h-full w-auto object-contain"
                />
              </div>
            </div>

            {/* Brand row */}
            <div className="mb-4 flex flex-col items-center gap-1">
              <p className="text-sm font-bold tracking-wide text-slate-900">
                ALZHEN
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Driver Portal
              </p>
            </div>

            {/* Badge */}
            <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Driver Access
            </span>

            <h1 className="text-[1.75rem] font-black tracking-tight text-slate-900 sm:text-3xl">
              Welcome back, driver
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Sign in to view your assigned trips and send updates.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-10 space-y-5">
            {/* Driver ID */}
            <div>
              <label
                htmlFor="username"
                className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500"
              >
                Driver ID or Email
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                placeholder="Enter your ID"
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 pr-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                >
                  {showPassword ? (
                    <EyeOff className="h-6 w-6" />
                  ) : (
                    <Eye className="h-6 w-6" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="mt-2 w-full cursor-pointer rounded-lg bg-slate-900 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            >
              Login to Portal
            </button>
          </form>

          {/* Footer */}
          <p className="mt-10 text-center text-sm text-slate-500">
            Having trouble signing in?{" "}
            <button
              type="button"
              className="font-semibold text-slate-900 underline underline-offset-4 transition-colors hover:text-slate-600"
            >
              Contact Dispatch Office
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}