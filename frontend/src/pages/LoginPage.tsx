import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";

export default function LoginPage() {
  const navigate = useNavigate();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate("/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <Card className="w-full max-w-md border border-slate-700 bg-slate-900/80 shadow-2xl shadow-slate-950/50 backdrop-blur-sm">
        <div className="mb-8 text-center">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-400">
            ALZHEN TMS
          </p>
          <h1 className="mt-3 text-3xl font-bold text-white">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-400">
            Sign in to manage operations
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <Input label="Email" type="email" placeholder="name@company.com" />
          <Input
            label="Password"
            type="password"
            placeholder="Enter your password"
          />

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
              />
              Remember me
            </label>
            <button
              type="button"
              className="text-cyan-400 transition hover:text-cyan-300">
              Forgot password?
            </button>
          </div>

          <Button type="submit" className="w-full">
            Login
          </Button>
        </form>
      </Card>
    </div>
  );
}
