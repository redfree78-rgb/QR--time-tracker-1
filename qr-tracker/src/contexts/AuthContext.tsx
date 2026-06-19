import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";

export type Role = "admin" | "staff";

export interface AuthUser {
  id: number;
  displayName: string;
  role: Role;
  passwordUpdatedAt?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Marker placed in sessionStorage after a successful login. sessionStorage is
// scoped to a single tab/app session and is empty whenever the app is opened
// fresh (new tab, or after the browser/app is closed and reopened). We use its
// presence to decide whether to restore an existing session. This guarantees
// the login screen is shown on every fresh access regardless of any lingering
// session cookie left over by the browser's "restore previous session" feature
// or an older long-lived cookie.
const SESSION_FLAG = "qr_session_active";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      setUser(r.ok ? await r.json() : null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const active = sessionStorage.getItem(SESSION_FLAG) === "1";
    if (!active) {
      // Fresh access (new tab / app reopened): do not auto-login from any
      // leftover session cookie. Show the login screen and require credentials.
      // We intentionally do NOT call /api/auth/logout here: the session cookie
      // is shared across tabs, so logging out would invalidate other tabs that
      // are legitimately signed in. Leaving the (browser-session) cookie alone
      // is harmless; a fresh login simply issues a new session.
      setUser(null);
      setLoading(false);
      return;
    }
    refreshMe().finally(() => setLoading(false));
  }, [refreshMe]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "로그인에 실패했습니다");
    }
    const data: AuthUser = await res.json();
    sessionStorage.setItem(SESSION_FLAG, "1");
    setUser(data);
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    sessionStorage.removeItem(SESSION_FLAG);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
