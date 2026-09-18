import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AdminRoute({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isAdminOnly = profile?.role === "ADMIN" && profile.is_admin === true;

  if (!isAdminOnly) {
    return (
      <Navigate
        to={profile?.role === "TRUCKER" ? "/driver" : "/dashboard"}
        replace
      />
    );
  }

  return <>{children}</>;
}
