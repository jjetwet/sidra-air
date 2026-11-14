import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { api, getDeviceId, setAuthToken, setUnauthorizedHandler, User } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { storage } from "@/src/utils/storage";

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = "sidra_session_token";
const AUTH_URL = "https://auth.emergentagent.com/";

type AuthState = {
  user: User | null;
  loading: boolean;
  signingIn: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const extractSessionId = (url?: string | null) => {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const used = useRef(new Set<string>());

  const clear = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    setAuthToken(null);
    queryClient.clear();
    setUser(null);
  }, []);

  const exchange = useCallback(async (sessionId: string) => {
    if (used.current.has(sessionId)) return false;
    used.current.add(sessionId);
    try {
      const res = await api<{ session_token: string; user: User }>("/auth/session", {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId }),
      });
      await storage.secureSet(TOKEN_KEY, res.session_token);
      setAuthToken(res.session_token);
      // Carry over trips and chats made on this phone before sign-in.
      try {
        await api("/me/claim", { method: "POST", body: JSON.stringify({ device_id: await getDeviceId() }) });
      } catch {}
      queryClient.clear();
      setUser(res.user);
      setError(null);
      return true;
    } catch {
      setError("Sign-in failed. Please try again.");
      return false;
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clear();
    });
    let sub: { remove: () => void } | undefined;
    (async () => {
      // 1. A session_id on the URL wins (web redirect or cold-start deep link).
      let sid: string | null = null;
      if (Platform.OS === "web" && typeof window !== "undefined") {
        sid = extractSessionId(window.location.hash) ?? extractSessionId(window.location.search);
      } else {
        sid = extractSessionId(await Linking.getInitialURL());
      }
      if (sid) {
        const ok = await exchange(sid);
        if (ok && Platform.OS === "web") {
          const url = new URL(window.location.href);
          url.searchParams.delete("session_id");
          const hash = url.hash.replace(/^#/, "").split("&").filter((p) => p && !p.startsWith("session_id=")).join("&");
          url.hash = hash ? `#${hash}` : "";
          window.history.replaceState(window.history.state, "", url.toString());
        }
        if (ok) {
          setLoading(false);
          return;
        }
      }
      // 2. Otherwise restore the stored session.
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
    if (Platform.OS !== "web") {
      sub = Linking.addEventListener("url", ({ url }) => {
        const s = extractSessionId(url);
        if (s) exchange(s);
      });
    }
    return () => {
      sub?.remove();
      setUnauthorizedHandler(null);
    };
  }, [clear, exchange]);

  const signIn = useCallback(async () => {
    setError(null);
    if (Platform.OS === "web") {
      const redirect = window.location.origin + "/";
      window.location.href = `${AUTH_URL}?redirect=${encodeURIComponent(redirect)}`;
      return;
    }
    setSigningIn(true);
    const redirect = Linking.createURL("");
    let captured: string | null = null;
    const listener = Linking.addEventListener("url", ({ url }) => {
      captured = url;
    });
    try {
      const result = await WebBrowser.openAuthSessionAsync(`${AUTH_URL}?redirect=${encodeURIComponent(redirect)}`, redirect);
      const url = (result.type === "success" ? result.url : null) ?? captured ?? (await Linking.getInitialURL());
      const sid = extractSessionId(url);
      if (sid) await exchange(sid);
    } finally {
      listener.remove();
      setSigningIn(false);
    }
  }, [exchange]);

  const signOut = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    await clear();
  }, [clear]);

  return (
    <AuthContext.Provider value={{ user, loading, signingIn, error, signIn, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
