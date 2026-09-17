import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import loginBackground from "../../assets/loginBG.jpg";
import logo from "../../assets/logo.png";

export default function LoginPage() {
  const navigate = useNavigate();
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate("/dashboard");
  };

  return (
    <div className="flex min-h-screen w-full bg-[#eef4fb] p-0 sm:p-4 lg:p-6">
      {/* ───────── Left: Photo Panel ───────── */}
      <div className="relative hidden overflow-hidden rounded-l-2xl lg:flex lg:w-1/2 lg:flex-col">
        {/* Background photo */}
        <img
          src={loginBackground}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Dark tint so text stays readable */}
        <div className="absolute inset-0 bg-black/40" />

        {/* Top bar: brand + back link */}
        <div className="relative z-10 flex items-center justify-between p-8">
          <div className="flex items-center gap-2">
            <img
              src={logo}
              alt=""
              className="h-8 w-8 object-contain"
            />
            <span className="text-sm font-semibold text-white">
              Alzhen Trucking
            </span>
          </div>
        </div>

        {/* Bottom copy */}
        <div className="relative z-10 mt-auto p-8 xl:p-12">
          <h2 className="max-w-lg text-4xl font-bold leading-tight text-white xl:text-5xl">
            Keep your fleet moving.
            <br />
            Dispatch smarter, deliver faster.
          </h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-white/85">
            From daily dispatch to long-haul shipments, manage your drivers,
            routes, and deliveries from one place.
          </p>
          <div className="mt-8 h-1 w-6 rounded-full bg-white" />
        </div>
      </div>

      {/* ───────── Right: Login Form ───────── */}
      <div className="flex w-full flex-col justify-center bg-white px-6 py-12 sm:rounded-2xl sm:px-12 lg:w-1/2 lg:rounded-l-none lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-md">
          <h1 className="text-3xl font-bold text-slate-900 xl:text-4xl">
            Welcome Back!
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Sign in to continue to your Alzhen workspace.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="Input your email"
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-slate-700"
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
                  placeholder="Input your password"
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 pr-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                />
                Remember Me
              </label>
              <button
                type="button"
                className="text-sm text-slate-500 transition hover:text-slate-900"
              >
                Forgot Password?
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="mt-2 w-full rounded-xl bg-[#2563d9] py-3.5 text-sm font-medium text-white transition hover:bg-[#1d4ed8] focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
            >
              Login
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-4">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-xs text-slate-400">Need help?</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          {/* Contact IT (replaces Google button) */}
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Contact your system administrator
          </button>

          <p className="mt-6 text-center text-sm text-slate-500">
            Having trouble signing in?{" "}
            <button
              type="button"
              className="font-medium text-slate-900 underline underline-offset-2"
            >
              Get help
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}