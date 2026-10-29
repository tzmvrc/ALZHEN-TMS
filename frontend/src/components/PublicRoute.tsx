import {rememberedAccount} from '../services/remembered-login';
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

  if(loading&&rememberedAccount())return <div role="status" className="flex min-h-dvh items-center justify-center bg-slate-50 text-sm text-[#0b2341]">Restoring your session...</div>;

  // Restoration must not conceal the login form behind a network-dependent spinner.
  // Protected routes still wait for the verified profile; redirect only when ready.
  if (user && !loading && profile) {
    const destination =
      redirectTo && profile?.role !== "TRUCKER"
        ? redirectTo
        : getRoleBasedHomePath(profile?.role);
    return <Navigate to={destination} replace />;
  }

  return <>{children}</>;
}
