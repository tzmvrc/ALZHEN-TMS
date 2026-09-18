import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen w-full bg-[#f7faff] p-0 sm:p-4 lg:p-6">
      <div className="dotted-surface relative flex w-full flex-col justify-center border border-[#dbe2e9] px-6 py-12 sm:rounded-2xl sm:px-12 lg:px-16 xl:px-24">
        <div className="relative z-10 mx-auto flex w-full max-w-sm flex-col items-center text-center">
          <img
            src={logo}
            alt="Alzhen Trucking Services"
            className="mx-auto mb-6 h-44 w-44 rounded-xl object-contain"
          />

          <h1 className=" text-[1.75rem] font-black tracking-tight text-slate-900 sm:text-5xl mb-2">
            Page not found
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            The page you're looking for doesn't exist, was moved, or you don't
            have access to it.
          </p>

          <button
            type="button"
            onClick={() => navigate("/")}
            className="mt-8 w-full cursor-pointer rounded-lg bg-slate-900 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2">
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
