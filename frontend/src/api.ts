import { storage } from "@/src/utils/storage";

export const API = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

export type Jet = {
  id: string;
  maker: string;
  family: "Global" | "Challenger" | "Gulfstream" | "Boeing";
  name: string;
  pax: number;
  range_nm: number;
  speed_kts: number;
  hourly_usd: number;
  cabin_ft: number;
  cabin_height_ft: number;
  living_spaces: number;
  tagline: string;
  highlights: string[];
};

export type Airport = { code: string; city: string; name: string; country: string; lat: number; lon: number };

export type PopularRoute = {
  from_code: string;
  to_code: string;
  from_city: string;
  to_city: string;
  jet_id: string;
  jet_name: string;
  flight_minutes: number;
  estimated_price_usd: number;
};

export type Estimate = {
  distance_nm: number;
  flight_minutes: number;
  fuel_stops: number;
  estimated_price_usd: number;
  legs: number;
};

export type Quote = Estimate & {
  id: string;
  from_code: string;
  to_code: string;
  jet_id: string;
  jet_name: string;
  trip_type: "one_way" | "return";
  depart_date: string;
  return_date?: string | null;
  depart_window: string;
  pax: number;
  name: string;
  email: string;
  notes: string;
  status: string;
  final_price_usd?: number | null;
  team_message?: string | null;
  email_status?: string | null;
  payment_status?: string | null;
  invoice_number?: string | null;
  company_id?: string | null;
  guests?: Guest[];
  created_at: string;
  updated_at?: string | null;
};

export type Guest = {
  id?: string;
  full_name: string;
  nationality: string;
  date_of_birth: string;
  passport_number: string;
  passport_expiry: string;
};

export const maskPassport = (p: string) => (p.length > 3 ? `•••• ${p.slice(-3)}` : p);

// Formats typed digits as YYYY-MM-DD
export const asDate = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)].filter(Boolean).join("-");
};

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; created_at: string };

export type User = { user_id: string; email: string; name: string; picture?: string | null; is_admin: boolean; company_id?: string | null; company_role?: string | null };

// In-memory copy of the session token; AuthProvider owns storage and keeps this in sync.
let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
export const setAuthToken = (t: string | null) => {
  authToken = t;
};
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};
export const authHeaders = (): Record<string, string> => (authToken ? { Authorization: `Bearer ${authToken}` } : {});

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) },
  });
  if (res.status === 401 && authToken && !path.startsWith("/auth/session")) onUnauthorized?.();
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) detail = body.detail[0]?.msg ?? detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

let cachedId: string | null = null;
export async function getDeviceId(): Promise<string> {
  if (cachedId) return cachedId;
  let id = await storage.getItem("sidra_member_id", "");
  if (!id) {
    id = `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    await storage.setItem("sidra_member_id", id);
  }
  cachedId = id;
  return id;
}

export const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export const formatDuration = (mins: number) => `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;

export const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
};
