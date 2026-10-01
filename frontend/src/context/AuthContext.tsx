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
import { supabase } from "../lib/supabase";
import { apiGet, apiPost } from "../services/api.service";

export type AuthProfile = {
  id: string;
  role: string;
  is_admin: boolean;
  first_name?: string | null;
  last_name?: string | null;
  profile_picture_path?: string | null;
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
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const authSyncLockedRef = useRef(false);
  const lastRefreshAtRef = useRef(0);

  const clearSessionState = useCallback(() => {
    setUser(null);
    setProfile(null);
    setAccessToken(null);
    setLoading(false);
  }, []);

  const clearSession = useCallback(() => {
    clearSessionState();
  }, [clearSessionState]);

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

      const now = Date.now();
      if (now - lastRefreshAtRef.current < 15000 && user) {
        return;
      }
      lastRefreshAtRef.current = now;

      if (!silent && !user) {
        setLoading(true);
      }

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

        const response = await apiGet<{
          success: boolean;
          message?: string;
          data: AuthSessionResponse;
        }>("/auth/me", session.access_token);

        if (!response.success || !response.data) {
          throw new Error(response.message ?? "Unable to load account profile");
        }

        setUser(response.data.authUser);
        setProfile(response.data.profile);
        setAccessToken(session.access_token);
      } catch (error) {
        console.error("Failed to refresh auth session:", error);
        clearSessionState();
        await supabase.auth.signOut().catch(() => undefined);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [clearSessionState, user],
  );

  const login = useCallback(
    async (
      email: string,
      password: string,
      allowedRole?: AllowedPortalRole,
    ) => {
      authSyncLockedRef.current = true;

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error || !data.session || !data.user) {
          throw new Error(error?.message ?? "Unable to sign in.");
        }

        const response = await apiGet<{
          success: boolean;
          message?: string;
          data: AuthSessionResponse;
        }>("/auth/me", data.session.access_token);

        if (!response.success || !response.data) {
          throw new Error(
            response.message ?? "Unable to fetch profile information.",
          );
        }

        const profileRole = response.data.profile.role;

        if (allowedRole && profileRole !== allowedRole) {
          try {
            await supabase.auth.signOut();
          } catch {
            // Wrong portal account is rejected without redirecting the user.
          }

          clearSessionState();
          throw new Error("Invalid account or login credentials.");
        }

        setUser(response.data.authUser);
        setProfile(response.data.profile);
        setAccessToken(data.session.access_token);
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
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (authSyncLockedRef.current) {
        return;
      }

      if (!session?.access_token) {
        clearSessionState();
        return;
      }

      void refreshSession({ silent: false });
    });

    window.addEventListener("focus", handleFocusOrVisible);
    document.addEventListener("visibilitychange", handleFocusOrVisible);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("focus", handleFocusOrVisible);
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
    };
  }, [clearSessionState, refreshSession]);

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
