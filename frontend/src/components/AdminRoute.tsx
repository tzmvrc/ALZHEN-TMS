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

  const canAccessDashboard =
    (profile?.role === "ADMIN" && profile.is_admin === true) ||
    profile?.role === "STAFF";

  if (!canAccessDashboard) {
    return (
      <Navigate to={profile?.role === "TRUCKER" ? "/trucker" : "/"} replace />
    );
  }

  return <>{children}</>;
}
