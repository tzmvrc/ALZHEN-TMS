import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import loginBackground from "../../assets/loginBG.jpg";
import logo from "../../assets/logo.png";

export default function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate("/dashboard");
  };

  return (
    <div className="flex min-h-screen w-full bg-[#f7faff]  p-0 sm:p-4 lg:p-6">
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
      <div className=" relative flex w-full flex-col justify-center px-6 py-12 sm:rounded-2xl border border-[#dbe2e9] dotted-surface sm:px-12 lg:w-1/2 lg:rounded-l-none lg:px-16 xl:px-24">
        <div className=" relative z-10 mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-[#dbe2e9] bg-[#f7faff] p-6 shadow-[0_8px_30px_rgba(71,104,143,0.08)] sm:p-8">
          {/* <img
            src={logo}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 m-auto h-64 w-64 select-none object-contain opacity-[0.045]"
          /> */}
          <div className="relative z-10 text-center">
            <img src={logo} alt="Alzhen Trucking" className="mx-auto mb-4 h-12 w-12 rounded-xl object-contain" />
            <h1 className="text-3xl font-black text-slate-900 xl:text-4xl">Welcome Back!</h1>
            <p className="mt-2 text-sm text-slate-500">Sign in to continue to your Alzhen workspace.</p>
          </div>

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

            {/* Submit */}
            <button
              type="submit"
              className="mt-2 w-full rounded-xl bg-[#2563d9] py-3.5 text-sm font-medium text-white transition hover:bg-[#1d4ed8] focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
            >
              Login
            </button>
          </form>

          {/* Divider */}
          <div className="my-8 flex items-center gap-4">
            <span className="h-px flex-1 bg-slate-100" />
            <span className="text-xs font-medium text-slate-400">Support</span>
            <span className="h-px flex-1 bg-slate-100" />
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            Having trouble signing in?{" "}
            <button
              type="button"
              className="font-semibold text-blue-600 hover:text-blue-700 underline underline-offset-4 transition-colors"
            >
              Get help
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}