import RememberedAccountCard from '../../components/auth/RememberedAccountCard';
import {rememberedEmail,rememberedAccount} from '../../services/remembered-login';
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import loginBackground from "../../assets/loginBG.jpg";
import logo from "../../assets/logo.png";
import { useToast } from "../../components/ui/Toast";
import { getRoleBasedHomePath, useAuth } from "../../context/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState(rememberedEmail);
  const [useAnother,setUseAnother]=useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { addToast } = useToast();
  const { login,profile,accessToken,loading } = useAuth();
  const saved=rememberedAccount(),showQuick=!useAnother&&!!saved&&!loading&&!!accessToken&&profile?.id===saved.id;

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

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      addToast({
        title: "Please enter a valid email address.",
        variant: "error",
        duration: 3500,
      });
      return;
    }

    setSubmitting(true);

    try {
      const session = await login(trimmedEmail, trimmedPassword);
      setPassword("");
      const nextPath = getRoleBasedHomePath(session.profile.role);

      addToast({
        title: `Welcome back, ${session.profile.first_name}!`,
        description:
          session.profile.role === "TRUCKER"
            ? "Redirecting to the trucker portal…"
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
            : lowerMessage.includes("valid email")
              ? "Please enter a valid email address."
              : "Something went wrong. Please try again.";

      addToast({
        title: description,
        description:
          "Check your credentials and try again, or contact IT support if the issue persists.",
        variant: "error",
        duration: 4000,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-[#dde1e7] p-0 sm:p-4 lg:p-6">
      {/* ───────── Left: Photo Panel ───────── */}
      <div className="relative hidden overflow-hidden rounded-l-[28px] lg:flex lg:w-1/2 lg:flex-col">
        <img
          src={loginBackground}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-[#071d37]/65" />

        {/* Top brand row */}
        <div className="relative z-10 flex items-center gap-3 p-10 xl:p-6">
          <img
            src={logo}
            alt="Alzhen Trucking Services"
            className="h-10 w-10 rounded-lg object-contain"
          />
          <span className="text-sm font-semibold tracking-wide text-white">
            Alzhen Trucking Services
          </span>
        </div>

        {/* Bottom copy */}
        <div className="relative z-10 mt-auto p-10 xl:p-14">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
            Operations Console
          </p>
          <h2 className="max-w-lg text-4xl font-bold leading-[1.1] tracking-tight text-white xl:text-5xl">
            Move freight with
            <br />
            <span className="text-white/70">precision and control.</span>
          </h2>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-white/75">
            Centralized tools for dispatch, driver assignments, route
            monitoring, and delivery tracking — built for Alzhen's daily
            operations.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <span className="h-1 w-10 rounded-full bg-white/90" />
            <span className="text-[11px] font-medium uppercase tracking-widest text-white/60">
              Since day one
            </span>
          </div>
        </div>
      </div>

      {/* ───────── Right: Login Form ───────── */}
      <div className="dotted-surface relative flex w-full flex-col justify-center items-center border border-[#dbe2e9] px-5 py-6 sm:rounded-2xl sm:px-8 lg:w-1/2 lg:rounded-l-none lg:px-12 lg:py-8 xl:px-16">
        <div className="relative z-10 mx-auto flex w-full max-w-sm flex-col">
          {/* Header */}
          <div className="text-center">
            <img
              src={logo}
              alt="Alzhen Trucking Services"
              className="mx-auto mb-3 h-22 w-22 rounded-xl object-contain"
            />

            <h1 className="text-[1.75rem] font-black tracking-tight text-slate-900 sm:text-3xl">
              Operations Sign In
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Authorized personnel only. Use your Alzhen operations credentials to
              continue.
            </p>
          </div>

          {/* Form */}
          {showQuick&&<RememberedAccountCard onAnother={()=>{setUseAnother(true);setEmail('');setPassword('');}}/>}
          {!showQuick&&<form autoComplete="on" onSubmit={handleSubmit} className="mt-5 space-y-3">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
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
                className="w-full rounded-lg border border-[#e9edf4] bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#0b2343] focus:ring-2 focus:ring-[#0b2343]/15"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
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
                  className="w-full rounded-lg border border-[#e9edf4] bg-white px-4 py-3 pr-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#0b2343] focus:ring-2 focus:ring-[#0b2343]/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700">
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
              disabled={submitting}
              className="mt-2 w-full cursor-pointer rounded-full bg-[#0b2343] py-3.5 text-sm font-semibold text-white transition hover:bg-[#17385f] focus:outline-none focus:ring-2 focus:ring-[#0b2343] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70">
              {submitting ? "Signing in…" : "Access Dashboard"}
            </button>
          </form>}

          {useAnother&&saved&&<button type="button" onClick={()=>{setUseAnother(false);setPassword('');}} className="mt-4 min-h-11 w-full text-sm font-medium text-[#0b2341] underline underline-offset-4">Back to saved account</button>}
          {/* Footer */}
          <p className="mt-5 text-center text-sm text-slate-500">
            Need access or locked out?{" "}
            <button
              type="button"
              className="font-semibold cursor-pointer text-slate-900 underline underline-offset-4 transition-colors hover:text-slate-600">
              Contact IT Admin
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
