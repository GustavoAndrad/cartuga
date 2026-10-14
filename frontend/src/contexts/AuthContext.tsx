import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";

import { apiClient, refreshAccessToken, setAccessToken } from "../services/api";
import { login as loginRequest, logout as logoutRequest } from "../services/authApi";
import type { User } from "../types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        await refreshAccessToken();
        const { data } = await apiClient.get<User>("/users/me");
        if (!cancelled) {
          setUser(data);
          setStatus("authenticated");
        }
      } catch {
        if (!cancelled) {
          setAccessToken(null);
          setUser(null);
          setStatus("unauthenticated");
        }
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleSessionExpired() {
      setAccessToken(null);
      setUser(null);
      setStatus("unauthenticated");
    }
    window.addEventListener("cartuga:session-expired", handleSessionExpired);
    return () => window.removeEventListener("cartuga:session-expired", handleSessionExpired);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: loggedInUser } = await loginRequest(email, password);
    setUser(loggedInUser);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest().catch(() => undefined);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
