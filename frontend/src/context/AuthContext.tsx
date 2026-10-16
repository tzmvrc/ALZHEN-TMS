import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  ApiError,
  apiPost,
  clearApiCache,
  clearAppSessionId,
  registerSessionExpiredHandler,
  setAppSessionId,
  unregisterSessionExpiredHandler,
} from "../services/api.service";
import { cancelAdminPreload, preloadAdminPageData } from "../services/admin-preload.service";
import { clearReportPageCache } from "../services/report.service";
import { clearSharedWidths } from "../services/shared-table-widths";
import { startCollaboration } from "../services/collaboration.service";
import { useToast } from "../components/ui/Toast";

export type AuthProfile = {
  id: string;
  role: string;
  is_admin: boolean;
  first_name?: string | null;
  last_name?: string | null;
  profile_picture_path?: string | null;
  profile_picture_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type AuthUser = {
  id: string;
  email?: string | null;
  role?: string | null;
  user_metadata?: Record<string, unknown>;
};

export type AuthSessionResponse = {
  authUser: AuthUser;
  profile: AuthProfile;
};

export type AllowedPortalRole = "ADMIN" | "STAFF" | "TRUCKER";

type AuthContextValue = {
  user: AuthUser | null;
  profile: AuthProfile | null;
  accessToken: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (
    email: string,
    password: string,
    allowedRole?: AllowedPortalRole,
  ) => Promise<AuthSessionResponse>;
  logout: () => Promise<void>;
  refreshSession: (options?: { silent?: boolean }) => Promise<void>;
  clearSessionState: () => void;
  suspendSessionSync: () => void;
  resumeSessionSync: () => void;
};

export function getRoleBasedHomePath(role?: string | null): string {
  return role === "TRUCKER" ? "/trucker" : "/";
}

export function getRoleBasedLoginPath(role?: string | null): string {
  return role === "TRUCKER" ? "/trucker/login" : "/login";
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const cacheOwnerRef = useRef<string | null>(null);
  useEffect(()=>startCollaboration(loading?null:accessToken,profile?.id,profile?.role),[loading,accessToken,profile?.id,profile?.role]);
  const cacheTokenRef = useRef<string | null>(null);
  const cacheRoleRef=useRef<string|null>(null);
  const retryRefreshTimerRef = useRef<number | undefined>(undefined);
  const refreshSessionRef = useRef<AuthContextValue["refreshSession"] | null>(null);
  const authSyncLockedRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const sessionExpiredRef = useRef(false);
  const { addToast } = useToast();

  const clearSessionState = useCallback(() => {
    cancelAdminPreload();
    sessionExpiredRef.current = false;
    window.clearTimeout(retryRefreshTimerRef.current);
    retryRefreshTimerRef.current = undefined;
    cacheOwnerRef.current = null;
    cacheTokenRef.current = null;
    cacheRoleRef.current=null;
    clearAppSessionId();
    clearApiCache();
    clearReportPageCache();
    clearSharedWidths();
    setUser(null);
    setProfile(null);
    setAccessToken(null);
    setSessionExpiresAt(null);
    setLoading(false);
  }, []);

  const clearSession = useCallback(() => {
    clearSessionState();
  }, [clearSessionState]);

  const handleSessionExpired = useCallback(async (reason?: string) => {
    if (sessionExpiredRef.current) {
      return;
    }

    sessionExpiredRef.current = true;
    authSyncLockedRef.current = true;
    setLoading(true);

    try {
      await supabase.auth.signOut().catch(() => undefined);
    } finally {
      clearSessionState();
      authSyncLockedRef.current = false;
    }

    const currentPath = window.location.pathname;
    const isTruckerSessionError = reason?.startsWith("TRUCKER_") ?? false;
    const loginTarget =
      profile?.role === "TRUCKER" || isTruckerSessionError
        ? "/trucker/login"
        : "/login";

    if (currentPath !== "/login" && currentPath !== "/trucker/login") {
      navigate(loginTarget, { replace: true });
    }

    if (reason !== "ADMIN_SESSION_EXPIRED") {
      addToast({
        title: reason === "TRUCKER_SESSION_REPLACED"
          ? "This account was signed in on another device."
          : "Your session has expired.",
        description: "Please log in again to continue.",
        variant: "error",
        duration: 4000,
      });
    }
  }, [addToast, clearSessionState, profile?.role]);

  const suspendSessionSync = useCallback(() => {
    authSyncLockedRef.current = true;
  }, []);

  const resumeSessionSync = useCallback(() => {
    authSyncLockedRef.current = false;
  }, []);

  const refreshSession = useCallback(
    async (options: { silent?: boolean } = {}) => {
      const { silent = false } = options;

      if (authSyncLockedRef.current) {
        return;
      }

      let preserveInitialLoading = false;

      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (!session?.access_token) {
          clearSessionState();
          return;
        }

        // Keep API consumers on the latest Supabase token even when the
        // profile/session bootstrap below is deduplicated.
        setAccessToken((current) => current === session.access_token ? current : session.access_token);

        const now = Date.now();
        const sameAccount = cacheOwnerRef.current === session.user.id;
        if (now - lastRefreshAtRef.current < 15000 && user && sameAccount) {
          return;
        }
        lastRefreshAtRef.current = now;

        if (!silent && !user) {
          setLoading(true);
        }

        const response = await apiPost<{
          success: boolean;
          message?: string;
          data: AuthSessionResponse & { role: string; expiresAt?: string | null };
        }>("/auth/session/bootstrap", {}, session.access_token);

        if (!response.success || !response.data) {
          throw new Error(response.message ?? "Unable to load account profile");
        }

        window.clearTimeout(retryRefreshTimerRef.current);
        retryRefreshTimerRef.current = undefined;

        if (
          cacheOwnerRef.current !== response.data.profile.id ||
          cacheTokenRef.current !== session.access_token ||
          cacheRoleRef.current !== response.data.profile.role
        ) {
          clearApiCache();
          clearReportPageCache();
          clearSharedWidths();
        }
        cacheOwnerRef.current = response.data.profile.id;
        cacheTokenRef.current = session.access_token;
        cacheRoleRef.current=response.data.profile.role;
        await preloadAdminPageData(session.access_token, response.data.profile.role);

        sessionExpiredRef.current = false;
        setUser(response.data.authUser);
        setProfile(response.data.profile);
        setAccessToken(session.access_token);
        setSessionExpiresAt(response.data.expiresAt ?? null);
      } catch (error) {
        const definitiveAuthFailure = error instanceof ApiError && (
          error.status === 401 ||
          (error.status === 403 && /access denied|not authorized|unauthorized/i.test(error.message))
        );
        if (definitiveAuthFailure) {
          // The shared API client has already routed 401 session failures
          // through the registered expiry handler. Only handle a bootstrap
          // role denial here; repeating logout for 401 can race that handler.
          if (error instanceof ApiError && error.status === 403) {
            await handleSessionExpired();
          }
          return;
        }

        console.error("Failed to refresh auth session:", error);
        // A transient network or backend failure must not destroy a still-valid
        // Supabase token or the app-session identifier. Keep the initial route
        // gated until bootstrap can be retried if no usable profile is loaded.
        preserveInitialLoading = !user;
        if (!user && !silent) setLoading(true);
        if (retryRefreshTimerRef.current === undefined) {
          retryRefreshTimerRef.current = window.setTimeout(() => {
            retryRefreshTimerRef.current = undefined;
            lastRefreshAtRef.current = 0;
            void refreshSessionRef.current?.({ silent: true });
          }, 5000);
        }
      } finally {
        if (!silent && !preserveInitialLoading) {
          setLoading(false);
        }
      }
    },
    [clearSessionState, handleSessionExpired, user],
  );

  useEffect(() => {
    refreshSessionRef.current = refreshSession;
  }, [refreshSession]);

  const login = useCallback(
    async (
      email: string,
      password: string,
      allowedRole?: AllowedPortalRole,
    ) => {
      authSyncLockedRef.current = true;

      try {
        const response = await apiPost<{
          success: boolean;
          message?: string;
          data: AuthSessionResponse & {
            session: { access_token: string; refresh_token: string };
            appSessionId: string;
            expiresAt?: string | null;
          };
        }>("/auth/login", { email, password });

        if (!response.success || !response.data) {
          throw new Error(
            response.message ?? "Unable to fetch profile information.",
          );
        }

        const profileRole = response.data.profile.role;

        const persistAppSession = async () => {
          try {
            setAppSessionId(response.data.appSessionId);
          } catch (error) {
            await apiPost("/auth/logout", {}, response.data.session.access_token).catch(() => undefined);
            clearAppSessionId();
            throw error;
          }
        };

        if (allowedRole && profileRole !== allowedRole) {
          await persistAppSession();
          await apiPost("/auth/logout", {}, response.data.session.access_token).catch(() => undefined);
          await supabase.auth.signOut().catch(() => undefined);
          clearSessionState();
          throw new Error("Invalid account or login credentials.");
        }

        await persistAppSession();

        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: response.data.session.access_token,
          refresh_token: response.data.session.refresh_token,
        });
        if (setSessionError) {
          await apiPost("/auth/logout", {}, response.data.session.access_token).catch(() => undefined);
          await supabase.auth.signOut().catch(() => undefined);
          clearSessionState();
          throw new Error("Unable to establish the authenticated browser session.");
        }

        clearApiCache();
        clearReportPageCache();
        clearSharedWidths();
        cacheOwnerRef.current = response.data.profile.id;
        cacheTokenRef.current = response.data.session.access_token;
        cacheRoleRef.current=profileRole;
        await preloadAdminPageData(response.data.session.access_token, profileRole);
        sessionExpiredRef.current = false;
        setUser(response.data.authUser);
        setProfile(response.data.profile);
        setAccessToken(response.data.session.access_token);
        setSessionExpiresAt(response.data.expiresAt ?? null);
        setLoading(false);

        return response.data;
      } finally {
        authSyncLockedRef.current = false;
      }
    },
    [clearSessionState],
  );

  const logout = useCallback(async () => {
    setLoading(true);

    const token =
      accessToken ??
      (await supabase.auth.getSession()).data.session?.access_token;

    let backendLogoutFailed = false;

    if (token) {
      try {
        await apiPost<{ success: boolean; message?: string }>(
          "/auth/logout",
          {},
          token,
        );
      } catch (error) {
        backendLogoutFailed = true;
        console.error("Backend logout failed:", error);
      }
    }

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Supabase signOut failed:", error);
      throw new Error("Unable to log out completely. Please try again.");
    }

    clearSession();
    setLoading(false);

    if (backendLogoutFailed) {
      throw new Error("Unable to log out completely. Please try again.");
    }
  }, [accessToken, clearSession]);

  useEffect(() => {
    registerSessionExpiredHandler(handleSessionExpired);

    return () => {
      unregisterSessionExpiredHandler();
    };
  }, [handleSessionExpired]);

  useEffect(() => {
    void refreshSession({ silent: false });

    const handleFocusOrVisible = () => {
      if (document.visibilityState === "visible" || document.hasFocus()) {
        const elapsed = Date.now() - lastRefreshAtRef.current;
        if (elapsed > 30000) {
          void refreshSession({ silent: true });
        }
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (authSyncLockedRef.current) {
        return;
      }

      if (event === "SIGNED_OUT") {
        clearSessionState();
        return;
      }

      if (!session?.access_token) {
        clearSessionState();
        return;
      }

      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED"
      ) {
        void refreshSession({ silent: false });
      }
    });

    window.addEventListener("focus", handleFocusOrVisible);
    document.addEventListener("visibilitychange", handleFocusOrVisible);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("focus", handleFocusOrVisible);
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
    };
  }, [clearSessionState, refreshSession]);

  useEffect(() => {
    if (!user || profile?.role !== "TRUCKER" || !accessToken) return;
    let inFlight = false;
    const heartbeat = () => {
      if (document.visibilityState !== "visible" || inFlight) return;
      inFlight = true;
      void apiPost("/auth/session/heartbeat", {}, accessToken)
        .catch(() => undefined)
        .finally(() => { inFlight = false; });
    };
    const interval = window.setInterval(heartbeat, 30_000);
    window.addEventListener("focus", heartbeat);
    document.addEventListener("visibilitychange", heartbeat);
    heartbeat();
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", heartbeat);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, [accessToken, profile?.role, user]);

  useEffect(() => {
    const role = profile?.role;
    const deadline = sessionExpiresAt ? Date.parse(sessionExpiresAt) : NaN;
    if (!user || (role !== "ADMIN" && role !== "STAFF") || !Number.isFinite(deadline)) {
      return;
    }

    let timer: number | undefined;
    let loggingOut = false;
    const checkExpiry = () => {
      if (Date.now() >= deadline) {
        if (!loggingOut) {
          loggingOut = true;
          void logout().catch(() => undefined);
        }
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(checkExpiry, Math.min(deadline - Date.now(), 2_147_000_000));
    };
    const checkWhenAwake = () => {
      if (document.visibilityState === "visible" || document.hasFocus()) checkExpiry();
    };

    checkExpiry();
    window.addEventListener("focus", checkWhenAwake);
    window.addEventListener("pageshow", checkWhenAwake);
    document.addEventListener("visibilitychange", checkWhenAwake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", checkWhenAwake);
      window.removeEventListener("pageshow", checkWhenAwake);
      document.removeEventListener("visibilitychange", checkWhenAwake);
    };
  }, [logout, profile?.id, profile?.role, sessionExpiresAt, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      accessToken,
      loading,
      isAuthenticated: Boolean(user),
      isAdmin: Boolean(profile?.role === "ADMIN" && profile.is_admin === true),
      login,
      logout,
      refreshSession,
      clearSessionState,
      suspendSessionSync,
      resumeSessionSync,
    }),
    [
      accessToken,
      clearSessionState,
      loading,
      login,
      logout,
      profile,
      refreshSession,
      suspendSessionSync,
      resumeSessionSync,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
