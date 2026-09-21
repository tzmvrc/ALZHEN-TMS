import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { getRoleBasedHomePath, useAuth } from "../context/AuthContext";

type PublicRouteProps = {
  children: ReactNode;
  redirectTo?: string;
};

export default function PublicRoute({
  children,
  redirectTo,
}: PublicRouteProps) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
      </div>
    );
  }

  if (user) {
    const destination =
      redirectTo && profile?.role !== "TRUCKER"
        ? redirectTo
        : getRoleBasedHomePath(profile?.role);
    return <Navigate to={destination} replace />;
  }

  return <>{children}</>;
}
