import RememberDevicePrompt from '../components/auth/RememberDevicePrompt';
import {loginPreference,saveLoginPreference,forgetLoginPreference,rememberedAccount} from '../services/remembered-login';
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
import { useLocation,useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  ApiError,
  apiPost,
  apiGet,
  clearApiCache,
  clearAppSessionId,
  registerSessionExpiredHandler,
  setAppSessionId,
  unregisterSessionExpiredHandler,
} from "../services/api.service";
import { cancelAdminPreload, preloadAdminPageData } from "../services/admin-preload.service";
import { clearReportPageCache } from "../services/report.service";
import { clearSharedWidths } from "../services/shared-table-widths";
import { startCollaboration,collaborationSnapshot,subscribeCollaborationEvents } from "../services/collaboration.service";
import {browserDeviceIdentifier,forgetBrowserDevice} from '../services/device-identity';
import { useToast } from "../components/ui/Toast";

export type AuthProfile = {
  crew_role?:"DRIVER"|"HELPER"|null;
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
  resumeRemembered:(id:string)=>Promise<AuthProfile>;
  forgetDevice:(id?:string)=>Promise<void>;
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
  const navigate = useNavigate();const location=useLocation();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rememberPrompt,setRememberPrompt]=useState<AuthProfile|null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const cacheOwnerRef = useRef<string | null>(null);
  useEffect(()=>{startCollaboration(loading?null:accessToken,profile?.id,profile?.role);},[loading,accessToken,profile?.id,profile?.role]);
  useEffect(()=>()=>{startCollaboration(null,undefined,undefined);},[]);
  const cacheTokenRef = useRef<string | null>(null);
  const cacheRoleRef=useRef<string|null>(null);
  const retryRefreshTimerRef = useRef<number | undefined>(undefined);
  const retryRefreshAttemptRef=useRef(0);
  const refreshSessionRef = useRef<AuthContextValue["refreshSession"] | null>(null);
  const authSyncLockedRef = useRef(false);
  const refreshFlight = useRef<Promise<void>|null>(null);
  const sessionEpoch = useRef(0);
  const lastRefreshAtRef = useRef(0);
  const sessionExpiredRef = useRef(false);
  const { addToast } = useToast();

  const clearSessionState = useCallback(() => {
    sessionEpoch.current++;
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
    setRememberPrompt(null);
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
      if(reason==='ACCOUNT_LOCKED'){
        sessionStorage.setItem('alzhen.account-locked','true');
        sessionStorage.setItem('alzhen.locked-login',profile?.role==='TRUCKER'||window.location.pathname.startsWith('/trucker')?'/trucker/login':'/login');
      }
      await supabase.auth.signOut({scope:'local'}).catch(() => undefined);
    } finally {
      clearSessionState();
      authSyncLockedRef.current = false;
    }

    const currentPath = window.location.pathname;
    const isTruckerSessionError = reason?.startsWith("TRUCKER_") ?? false;
    const loginTarget =
      reason==='ACCOUNT_LOCKED'?'/account-locked':profile?.role === "TRUCKER" || isTruckerSessionError
        ? "/trucker/login"
        : "/login";

    if (reason==='ACCOUNT_LOCKED'||currentPath !== "/login" && currentPath !== "/trucker/login") {
      navigate(loginTarget, { replace: true });
    }

    if (reason !== "ADMIN_SESSION_EXPIRED" && reason!=='ACCOUNT_LOCKED') {
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

      if(refreshFlight.current)return refreshFlight.current;
      const epoch=sessionEpoch.current;
      const run=async()=>{
      let preserveInitialLoading = false;

      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if(epoch!==sessionEpoch.current||authSyncLockedRef.current)return;
        if(session?.user.id&&loginPreference(session.user.id)===false&&sessionStorage.getItem('alzhen.interactive-login')!==session.user.id){await supabase.auth.signOut({scope:'local'});clearSessionState();return;}
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
        }>("/auth/session/bootstrap", {}, session.access_token,undefined,20_000);

        if(epoch!==sessionEpoch.current||authSyncLockedRef.current)return;
        if (!response.success || !response.data) {
          throw new Error(response.message ?? "Unable to load account profile");
        }

        window.clearTimeout(retryRefreshTimerRef.current);
        retryRefreshTimerRef.current = undefined;
        retryRefreshAttemptRef.current=0;

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
        if(epoch!==sessionEpoch.current||authSyncLockedRef.current)return;
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
          }, Math.min(60000,5000*2**Math.min(retryRefreshAttemptRef.current++,4)));
        }
      } finally {
        if (epoch===sessionEpoch.current && !preserveInitialLoading) setLoading(false);
      }
      };
      const pending=run();refreshFlight.current=pending;
      try{await pending;}finally{if(refreshFlight.current===pending)refreshFlight.current=null;}
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
      sessionEpoch.current++;

      try {
        const response = await apiPost<{
          success: boolean;
          message?: string;
          data: AuthSessionResponse & {
            session: { access_token: string; refresh_token: string };
            appSessionId: string;
            expiresAt?: string | null;
          };
        }>("/auth/login", { email, password,device_identifier:browserDeviceIdentifier(email) });

        if (!response.success || !response.data) {
          throw new Error(
            response.message ?? "Unable to fetch profile information.",
          );
        }

        sessionStorage.setItem('alzhen.interactive-login',response.data.profile.id);
        const profileRole = response.data.profile.role;
        sessionStorage.removeItem('alzhen.account-locked');

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
          await supabase.auth.signOut({scope:"local"}).catch(() => undefined);
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
          await supabase.auth.signOut({scope:"local"}).catch(() => undefined);
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
        if(loginPreference(response.data.profile.id)===undefined)setRememberPrompt(response.data.profile);
        else if(loginPreference(response.data.profile.id)===true){try{saveLoginPreference(response.data.profile,response.data.authUser.email||'',true);}catch{/* Current authentication does not depend on optional display preferences. */}}
        setAccessToken(response.data.session.access_token);
        setSessionExpiresAt(response.data.expiresAt ?? null);
        setLoading(false);

        return response.data;
      } catch(error) {
        if(error instanceof ApiError&&error.code==='ACCOUNT_LOCKED'){
          sessionStorage.setItem('alzhen.account-locked','true');
          await handleSessionExpired('ACCOUNT_LOCKED');
          navigate('/account-locked',{replace:true});
        }
        throw error;
      } finally {
        authSyncLockedRef.current = false;
      }
    },
    [clearSessionState, handleSessionExpired, navigate],
  );

  const logout = useCallback(async () => {
    setLoading(true);

    const token =
      accessToken ??
      (await supabase.auth.getSession()).data.session?.access_token;

    try {
      if(token)await apiPost('/auth/logout',{},token);
      const signedOut=await supabase.auth.signOut({scope:'local'});
      if(signedOut.error)throw new Error('Device access was revoked, but browser sign-out could not finish. Retry logout.');
      clearSession();
      navigate(profile?.role==='TRUCKER'?'/trucker/login':'/login',{replace:true});
    } catch(error) {
      throw new Error(error instanceof Error?error.message:'Logout could not be confirmed. Please retry.');
    } finally {setLoading(false);}
  }, [accessToken, clearSession, navigate, profile?.role]);

  const resumeRemembered=useCallback(async(expectedId:string)=>{
    try{
      let {data,error}=await supabase.auth.getSession();if(error&&!([400,401,403].includes(Number((error as {status?:number}).status))))throw new ApiError('Your session could not be checked. Check your connection and try again.',503);if(error||!data.session||data.session.user.id!==expectedId)throw new ApiError('Your saved session has expired. Sign in again.',401);
      if((data.session.expires_at??0)*1000<Date.now()+30000){const refreshed=await supabase.auth.refreshSession();if(refreshed.error&&!([400,401,403].includes(Number((refreshed.error as {status?:number}).status))))throw new ApiError('Your session could not be refreshed. Check your connection and try again.',503);if(refreshed.error||!refreshed.data.session)throw new ApiError('Your saved session could not be refreshed. Sign in again.',401);data=refreshed.data;}
      const session=data.session!;const r=await apiGet<{success:boolean;data:AuthSessionResponse;message?:string}>('/auth/me',session.access_token);
      if(!r.success||r.data?.profile.id!==expectedId)throw new ApiError('Sign in again to verify this account.',401);
      clearApiCache();setUser(r.data.authUser);setProfile(r.data.profile);setAccessToken(session.access_token);return r.data.profile;
    }catch(error){if(error instanceof ApiError&&(error.status===401||error.status===403))await handleSessionExpired();throw error;}
  },[handleSessionExpired]);
  const forgetDevice=useCallback(async(id?:string)=>{
    const target=id||profile?.id||rememberedAccount()?.id,role=profile?.role||rememberedAccount()?.role;
    const saved=rememberedAccount();if(!accessToken&&saved&&saved.id===target)forgetBrowserDevice(saved.email);
    if(accessToken&&profile?.id===target)await apiPost('/users/me/forget-device',{},accessToken);
    try{await logout();}catch(error){const signedOut=await supabase.auth.signOut({scope:'local'});if(signedOut.error)throw error;clearSessionState();}
    forgetLoginPreference(target);navigate(getRoleBasedLoginPath(role),{replace:true});
  },[logout,accessToken,profile?.id,profile?.role,clearSessionState,navigate]);

  useEffect(() => {
    registerSessionExpiredHandler(handleSessionExpired);

    return () => {
      unregisterSessionExpiredHandler();
    };
  }, [handleSessionExpired]);

  useEffect(() => {
    void refreshSessionRef.current?.({ silent: false });

    const handleFocusOrVisible = () => {
      if (document.visibilityState === "visible" || document.hasFocus()) {
        const elapsed = Date.now() - lastRefreshAtRef.current;
        if (elapsed > 30000) {
          void refreshSessionRef.current?.({ silent: true });
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
        void refreshSessionRef.current?.({ silent: false });
      }
    });

    window.addEventListener("focus", handleFocusOrVisible);
    document.addEventListener("visibilitychange", handleFocusOrVisible);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("focus", handleFocusOrVisible);
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
    };
  }, [clearSessionState]);

  useEffect(() => {
    if (!user || !profile || !accessToken) return;
    let inFlight = false, pending = false, live = true;
    const heartbeat = () => {
      if (!live || document.visibilityState !== "visible") return;
      if (inFlight) { pending = true; return; }
      inFlight = true;
      void apiPost("/auth/session/heartbeat", {}, accessToken)
        .catch(() => undefined)
        .finally(() => { inFlight = false; if (pending) { pending = false; heartbeat(); } });
    };
    const off=subscribeCollaborationEvents(e=>{if(e.kind==='security'||e.kind==='connected')heartbeat();});
    const interval = window.setInterval(()=>{const connection=collaborationSnapshot();if(!connection.connected||!connection.bridgeHealthy)heartbeat();}, 15_000);
    window.addEventListener("focus", heartbeat);
    document.addEventListener("visibilitychange", heartbeat);
    heartbeat();
    return () => {
      live = false;
      window.clearInterval(interval);
      off();
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
      resumeRemembered,forgetDevice,
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
      resumeRemembered,forgetDevice,
      profile,
      refreshSession,
      suspendSessionSync,
      resumeSessionSync,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}{rememberPrompt&&location.pathname===getRoleBasedHomePath(rememberPrompt.role)&&<RememberDevicePrompt onChoose={remember=>{try{saveLoginPreference(rememberPrompt,user?.email||'',remember);}catch{addToast({title:'Device preference could not be saved',description:'This browser could not save the preference. Your signed-in session is still available.',variant:'error'});}setRememberPrompt(null);}}/>}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
