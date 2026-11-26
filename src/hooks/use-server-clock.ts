"use client";
import { useEffect, useState } from "react";

/**
 * Server-synchronised clock. Uses performance.now() (monotonic) between
 * syncs, so changing the device clock has no effect on countdowns.
 * Offsets are measured with an RTT midpoint estimate and re-synced every minute.
 */
let anchorServer = 0;
let anchorPerf = 0;
let synced = false;
let syncing: Promise<void> | null = null;

async function syncOnce() {
  let best: { rtt: number; server: number; perf: number } | null = null;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    try {
      const res = await fetch("/api/time", { cache: "no-store" });
      const { now } = (await res.json()) as { now: number };
      const t1 = performance.now();
      const rtt = t1 - t0;
      if (!best || rtt < best.rtt) best = { rtt, server: now + rtt / 2, perf: t1 };
    } catch {
      /* offline – keep last anchor */
    }
  }
  if (best) {
    anchorServer = best.server;
    anchorPerf = best.perf;
    synced = true;
  }
}

export function syncServerClock(seed?: number) {
  if (seed && !synced) {
    anchorServer = seed;
    anchorPerf = performance.now();
  }
  if (!syncing) syncing = syncOnce().finally(() => (syncing = null));
  return syncing;
}

export function serverNow(): number {
  if (!anchorPerf) return Date.now();
  return anchorServer + (performance.now() - anchorPerf);
}

/** Re-renders every `intervalMs` with current server time. */
export function useServerNow(intervalMs = 1000, seed?: number) {
  const [now, setNow] = useState(() => (seed ?? Date.now()));
  useEffect(() => {
    syncServerClock(seed);
    const tick = setInterval(() => setNow(serverNow()), intervalMs);
    const resync = setInterval(() => syncServerClock(), 60_000);
    const onVis = () => document.visibilityState === "visible" && syncServerClock();
    document.addEventListener("visibilitychange", onVis);
    setNow(serverNow());
    return () => {
      clearInterval(tick);
      clearInterval(resync);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);
  return now;
}
