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
    <div className="dotted-surface flex min-h-screen w-full items-center justify-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-[420px] space-y-6">
        {/* Logo & Brand */}
        <div className="flex items-center gap-3 px-1">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#dce8f5] bg-white shadow-sm">
            <img src={logo} alt="Alzhen Logo" className="h-8 w-8 rounded-lg object-contain" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">ALZHEN</p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Tracker portal</p>
          </div>
        </div>

        <div className="px-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome back, driver</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to view your assigned trips and send updates.</p>
        </div>

        {/* Login Form */}
        <div className="rounded-2xl border border-[#dfe9f4] bg-white p-6 shadow-[0_10px_30px_rgba(71,104,143,0.08)] sm:p-7">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2 text-left">
              <label htmlFor="username" className="text-xs font-semibold text-slate-700">
                Driver ID or Email
              </label>
              <input
                id="username"
                type="text"
                required
                placeholder="Enter your ID"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="space-y-2 text-left">
              <label htmlFor="password" className="text-xs font-semibold text-slate-700">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Enter password"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 pr-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-6 w-6" /> : <Eye className="h-6 w-6" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-[#2563d9] py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1d4ed8] active:scale-[0.99]"
            >
              Login to Portal
            </button>
          </form>
        </div>

        {/* Footer Help */}
        <p className="text-center text-xs text-slate-500">
          Having trouble signing in?{" "}
          <button type="button" className="font-semibold text-blue-600 hover:underline">
            Contact Dispatch Office
          </button>
        </p>
      </div>
    </div>
  );
}
