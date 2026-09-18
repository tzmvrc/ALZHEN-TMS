import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (location.pathname === "/dashboard" && profile?.role !== "ADMIN") {
    return (
      <Navigate
        to={profile?.role === "TRUCKER" ? "/driver" : "/login"}
        replace
      />
    );
  }

  if (location.pathname === "/driver" && profile?.role !== "TRUCKER") {
    return (
      <Navigate
        to={profile?.role === "ADMIN" ? "/dashboard" : "/login"}
        replace
      />
    );
  }

  return <>{children}</>;
}
