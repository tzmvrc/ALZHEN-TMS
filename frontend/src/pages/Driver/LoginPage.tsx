import {rememberedEmail,rememberEmail} from '../../services/remembered-login';
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import logo from "../../assets/logo.png";
import { useToast } from "../../components/ui/Toast";
import { getRoleBasedHomePath, useAuth } from "../../context/AuthContext";

export default function DriverLoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState(rememberedEmail);
  const [remember,setRemember]=useState(()=>Boolean(rememberedEmail()));
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { addToast } = useToast();
  const { login } = useAuth();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      addToast({
        title: "Please enter your email and password.",
        variant: "error",
        duration: 3500,
      });
      return;
    }

    setSubmitting(true);

    try {
      const session = await login(trimmedEmail, trimmedPassword, "TRUCKER");
      rememberEmail(trimmedEmail,remember);
      const nextPath = getRoleBasedHomePath(session.profile.role);

      addToast({
        title: `Welcome back, ${session.profile.first_name}!`,
        description:
          session.profile.role === "TRUCKER"
            ? "You're successfully signed in."
            : "You're successfully signed in.",
        variant: "success",
        duration: 2500,
      });
      navigate(nextPath);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong.";

      if (message === "Invalid account or login credentials.") {
        setEmail("");
        setPassword("");
        addToast({
          title: message,
          description:
            "Check your credentials and try again, or contact IT support if the issue persists.",
          variant: "error",
          duration: 4500,
        });
        return;
      }

      const lowerMessage = message.toLowerCase();

      const description =
        /invalid login|invalid credentials|email or password/.test(lowerMessage)
          ? "Invalid email or password."
          : /network|fetch|failed to fetch|server/.test(lowerMessage)
            ? "Unable to connect to the server. Please try again."
            : "Something went wrong. Please try again.";

      addToast({
        title: description,
        description: "Please check your credentials and try again.",
        variant: "error",
        duration: 4000,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full bg-[#dde1e7] sm:h-dvh sm:p-4">
      {/* ───────── Full-viewport dotted panel ───────── */}
      <div className="dotted-surface relative flex min-h-dvh w-full flex-col border border-[#dbe2e9] px-4 pb-4 pt-4 sm:h-full sm:min-h-0 sm:rounded-2xl sm:px-7 sm:py-5">
        <div className="relative z-10 mx-auto flex w-full max-w-sm flex-col pt-1 sm:pt-0">
          {/* Header */}
          <div className="text-center">
            {/* Logo tile */}
            <div className="relative mx-auto mb-2 h-[72px] w-[72px] sm:mb-2 sm:h-[84px] sm:w-[84px]">
              {/* soft glow — locked to same size as tile */}
              <div className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-amber-400/15 blur-xl" />

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
            <div className="mb-2 flex flex-col items-center gap-1 sm:mb-4">
              <p className="text-sm font-bold tracking-wide text-slate-900">
                ALZHEN
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Driver Portal
              </p>
            </div>

            {/* Badge */}
            <span className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 backdrop-blur-sm sm:mb-4">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Driver Access
            </span>

            <h1 className="text-[1.35rem] font-black tracking-tight text-slate-900 sm:text-3xl">
              Welcome back, trucker!
            </h1>
            <p className="mt-2 text-[11px] text-slate-500 sm:text-sm">
              Sign in to view your assigned trips and send updates.
            </p>
          </div>

          {/* Form */}
          <form
            autoComplete="on"
            onSubmit={handleSubmit}
            className="mt-4 space-y-3">
            {/* Driver ID */}
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Work Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-[#e9edf4] bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#0b2343] focus:ring-2 focus:ring-[#0b2343]/15"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
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
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-lg border border-[#e9edf4] bg-white px-4 py-2.5 pr-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#0b2343] focus:ring-2 focus:ring-[#0b2343]/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700">
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

<label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Remember Me</label>
            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="mt-1 w-full cursor-pointer rounded-full bg-[#0b2343] py-2.5 text-sm font-semibold text-white transition hover:bg-[#17385f] focus:outline-none focus:ring-2 focus:ring-[#0b2343] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 sm:py-3.5">
              {submitting ? "Signing in…" : "Login to Portal"}
            </button>
          </form>

          {/* Footer */}
          <p className="mt-4 text-center text-[11px] text-slate-500 sm:text-xs">
            Having trouble signing in?{" "}
            <button
              type="button"
              className="font-semibold text-slate-900 underline underline-offset-4 transition-colors hover:text-slate-600">
              Contact Dispatch Office
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
