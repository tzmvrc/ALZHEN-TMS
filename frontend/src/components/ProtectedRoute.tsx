import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import RouteLoading from "./RouteLoading";
import { getRoleBasedHomePath, useAuth } from "../context/AuthContext";

type ProtectedRouteProps = {
  children: ReactNode;
  loginPath?: string;
};

export default function ProtectedRoute({
  children,
  loginPath = "/login",
}: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading && !user) {
    return <RouteLoading />;
  }

  if (!user) {
    return (
      <Navigate to={loginPath} replace state={{ from: location.pathname }} />
    );
  }

  if (location.pathname === "/" && profile?.role === "TRUCKER") {
    return <Navigate to={getRoleBasedHomePath(profile?.role)} replace />;
  }

  if (location.pathname === "/trucker" && profile?.role !== "TRUCKER") {
    return <Navigate to={getRoleBasedHomePath(profile?.role)} replace />;
  }

  if (location.pathname === "/login" && profile) {
    return <Navigate to={getRoleBasedHomePath(profile.role)} replace />;
  }

  if (location.pathname === "/trucker/login" && profile) {
    return <Navigate to={getRoleBasedHomePath(profile.role)} replace />;
  }

  if (loginPath === "/trucker/login" && profile?.role !== "TRUCKER") {
    return <Navigate to={getRoleBasedHomePath(profile?.role)} replace />;
  }

  if (loginPath === "/login" && profile?.role === "TRUCKER") {
    return <Navigate to={getRoleBasedHomePath(profile.role)} replace />;
  }

  return <>{children}</>;
}
