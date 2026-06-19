import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getMe,
  login as loginRequest,
  logout as logoutRequest,
  setUnauthorizedHandler,
  type AuthUser,
} from "@workspace/api-client-react";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  user: AuthUser | null;
  status: AuthStatus;
  /**
   * Set when an authenticated session was ended by a server 401 (expiry),
   * rather than by an explicit sign-out. The login screen reads this to show
   * a "please sign in again" notice, then calls `clearSessionExpired()`.
   */
  sessionExpired: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearSessionExpired: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [sessionExpired, setSessionExpired] = useState(false);

  // Read the latest status synchronously inside the global 401 handler without
  // re-registering it on every status change.
  const statusRef = useRef(status);
  statusRef.current = status;

  // Validate the session cookie on launch. React Native's native fetch
  // persists the server's session cookie automatically, so getMe() succeeds
  // when a valid session exists and 401s otherwise.
  useEffect(() => {
    let active = true;
    getMe()
      .then((me) => {
        if (!active) return;
        setUser(me);
        setStatus("authenticated");
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setStatus("unauthenticated");
      });
    return () => {
      active = false;
    };
  }, []);

  // Centrally handle expired sessions: any 401 from a normal API call (when we
  // currently believe we're authenticated) drops local auth state. The route
  // guards then redirect to the login screen. We only act while authenticated,
  // so a failed login or the launch-time getMe() 401 never trigger this, and a
  // burst of concurrent 401s only fires the expiry flow once.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (statusRef.current !== "authenticated") return;
      statusRef.current = "unauthenticated";
      setUser(null);
      setStatus("unauthenticated");
      setSessionExpired(true);
      queryClient.clear();
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const me = await loginRequest({ username, password });
      setSessionExpired(false);
      setUser(me);
      setStatus("authenticated");
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // Even if the network call fails, drop the local session.
    }
    setUser(null);
    setStatus("unauthenticated");
    setSessionExpired(false);
    queryClient.clear();
  }, [queryClient]);

  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  const value = useMemo(
    () => ({
      user,
      status,
      sessionExpired,
      signIn,
      signOut,
      clearSessionExpired,
    }),
    [user, status, sessionExpired, signIn, signOut, clearSessionExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
