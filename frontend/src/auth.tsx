import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { api, getDeviceId, setAuthToken, setUnauthorizedHandler, User } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { storage } from "@/src/utils/storage";

const TOKEN_KEY = "sidra_session_token";

type AuthState = {
  user: User | null;
  loading: boolean;
  verifyCode: (code: string) => Promise<void>;
  register: (p: { invite_code: string; name: string; email: string; password: string }) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const clear = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    setAuthToken(null);
    queryClient.clear();
    setUser(null);
  }, []);

  const accept = useCallback(async (res: { access_token: string; user: User }) => {
    await storage.secureSet(TOKEN_KEY, res.access_token);
    setAuthToken(res.access_token);
    // Carry over trips and chats made on this phone before signing in.
    try {
      await api("/me/claim", { method: "POST", body: JSON.stringify({ device_id: await getDeviceId() }) });
    } catch {}
    queryClient.clear();
    setUser(res.user);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clear();
    });
    (async () => {
      const token = await storage.secureGet(TOKEN_KEY, "");
      if (token) {
        setAuthToken(token);
        try {
          setUser(await api<User>("/auth/me"));
        } catch {
          await clear();
        }
      }
      setLoading(false);
    })();
    return () => setUnauthorizedHandler(null);
  }, [clear]);

  const verifyCode = useCallback(async (code: string) => {
    await api("/auth/verify-code", { method: "POST", body: JSON.stringify({ invite_code: code }) });
  }, []);

  const register = useCallback(
    async (p: { invite_code: string; name: string; email: string; password: string }) => {
      await accept(await api("/auth/register", { method: "POST", body: JSON.stringify(p) }));
    },
    [accept],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      await accept(await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }));
    },
    [accept],
  );

  return (
    <AuthContext.Provider value={{ user, loading, verifyCode, register, signIn, signOut: clear }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
