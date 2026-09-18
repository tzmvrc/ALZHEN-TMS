import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

type AuthContextValue = {
  user: AuthUser | null;
  profile: AuthProfile | null;
  accessToken: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<AuthSessionResponse>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    setUser(null);
    setProfile(null);
    setAccessToken(null);
  }, []);

  const refreshSession = useCallback(async () => {
    setLoading(true);

    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        throw error;
      }

      if (!session?.access_token) {
        clearSession();
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
      clearSession();
      await supabase.auth.signOut().catch(() => undefined);
    } finally {
      setLoading(false);
    }
  }, [clearSession]);

  const login = useCallback(async (email: string, password: string) => {
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

    setUser(response.data.authUser);
    setProfile(response.data.profile);
    setAccessToken(data.session.access_token);
    setLoading(false);

    return response.data;
  }, []);

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
    void refreshSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.access_token) {
        clearSession();
        setLoading(false);
        return;
      }

      void refreshSession();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [clearSession, refreshSession]);

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
    }),
    [accessToken, loading, login, logout, profile, refreshSession, user],
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
