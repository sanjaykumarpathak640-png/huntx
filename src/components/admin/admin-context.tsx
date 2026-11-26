"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useToast } from "@/components/toast";
import { api } from "@/lib/utils";
import type { AdminRole, Phase } from "@/lib/types";
import type { EventSettings } from "@/lib/settings";

export interface Notification {
  id: string;
  event_id: string;
  team_id: string | null;
  team_name: string | null;
  type: string;
  severity: "info" | "success" | "warning" | "critical";
  clue_number: number | null;
  message: string;
  read: boolean;
  created_at: string;
}

interface Ctx {
  role: AdminRole;
  email: string;
  event: { id: string; name: string; phase: Phase } | null;
  settings: EventSettings | null;
  notifications: Notification[];
  unread: number;
  tick: number; // increments on every realtime change → pages refetch
  realtime: "connecting" | "live" | "off";
  sound: boolean;
  setSound: (v: boolean) => void;
  markRead: (ids: string[] | "all") => Promise<void>;
  refreshMeta: () => Promise<void>;
  can: (min: AdminRole) => boolean;
}

const AdminCtx = createContext<Ctx | null>(null);
export const useAdmin = () => {
  const c = useContext(AdminCtx);
  if (!c) throw new Error("useAdmin outside provider");
  return c;
};

const RANK: Record<AdminRole, number> = { reviewer: 1, organiser: 2, super_admin: 3 };

function beep(severity: string) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const freqs = severity === "critical" ? [880, 660, 880] : severity === "warning" ? [660, 520] : [740];
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.16 + 0.14);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.16);
      o.stop(ctx.currentTime + i * 0.16 + 0.15);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch {}
}

export function AdminProvider({ role, email, children }: { role: AdminRole; email: string; children: React.ReactNode }) {
  const toast = useToast();
  const [event, setEvent] = useState<Ctx["event"]>(null);
  const [settings, setSettings] = useState<EventSettings | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [tick, setTick] = useState(0);
  const [realtime, setRealtime] = useState<Ctx["realtime"]>("connecting");
  const [sound, setSoundState] = useState(true);
  const soundRef = useRef(true);

  useEffect(() => {
    try {
      const v = localStorage.getItem("huntx:sound");
      if (v != null) {
        setSoundState(v === "1");
        soundRef.current = v === "1";
      }
    } catch {}
  }, []);
  const setSound = (v: boolean) => {
    setSoundState(v);
    soundRef.current = v;
    try {
      localStorage.setItem("huntx:sound", v ? "1" : "0");
    } catch {}
  };

  const refreshMeta = useCallback(async () => {
    const me = await api<{ event: Ctx["event"]; settings: EventSettings | null }>("/api/admin/me");
    setEvent(me.event);
    setSettings(me.settings);
    if (me.event) {
      const n = await api<{ notifications: Notification[] }>("/api/admin/notifications");
      setNotifications(n.notifications);
    }
  }, []);

  useEffect(() => {
    refreshMeta().catch(() => {});
  }, [refreshMeta]);

  // Realtime alert stream (RLS: admins only)
  useEffect(() => {
    if (!event?.id) return;
    const sb = getBrowserSupabase();
    const bump = () => setTick((t) => t + 1);
    const ch = sb
      .channel(`admin-${event.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `event_id=eq.${event.id}` }, (p) => {
        const n = p.new as Notification;
        setNotifications((list) => [n, ...list].slice(0, 300));
        bump();
        if (n.severity === "warning" || n.severity === "critical" || n.type === "photo_submitted" || n.type === "finished") {
          toast({ kind: n.severity === "critical" ? "error" : n.severity === "warning" ? "warning" : n.severity === "success" ? "success" : "info", title: n.message });
        }
        if (soundRef.current && settings?.sound_alerts !== false) beep(n.severity);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "teams", filter: `event_id=eq.${event.id}` }, bump)
      .subscribe((s) => setRealtime(s === "SUBSCRIBED" ? "live" : s === "CHANNEL_ERROR" || s === "CLOSED" ? "off" : "connecting"));
    return () => {
      sb.removeChannel(ch);
    };
  }, [event?.id, toast, settings?.sound_alerts]);

  const markRead = useCallback(async (ids: string[] | "all") => {
    await api("/api/admin/notifications", { method: "PATCH", body: JSON.stringify(ids === "all" ? { all: true } : { ids }) });
    setNotifications((list) => list.map((n) => (ids === "all" || ids.includes(n.id) ? { ...n, read: true } : n)));
  }, []);

  const value: Ctx = {
    role,
    email,
    event,
    settings,
    notifications,
    unread: notifications.filter((n) => !n.read).length,
    tick,
    realtime,
    sound,
    setSound,
    markRead,
    refreshMeta,
    can: (min) => RANK[role] >= RANK[min],
  };
  return <AdminCtx.Provider value={value}>{children}</AdminCtx.Provider>;
}

/** Fetch helper that refetches when realtime ticks (debounced). */
export function useAdminData<T>(url: string | null, deps: unknown[] = []) {
  const { tick } = useAdmin();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!url) return;
    try {
      const d = await api<T>(url);
      setData(d);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, ...deps]);
  useEffect(() => {
    if (!tick) return;
    const t = setTimeout(reload, 600);
    return () => clearTimeout(t);
  }, [tick, reload]);
  return { data, error, loading, reload, setData };
}
