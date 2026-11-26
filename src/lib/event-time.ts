import type { EventRow, Phase } from "./types";

/** Server is the source of truth: phase is always computed from DB values + server clock. */
export function eventPhase(ev: Pick<EventRow, "status" | "start_at" | "end_at">, now = Date.now()): Phase {
  if (ev.status === "draft") return "draft";
  if (ev.status === "ended") return "ended";
  if (ev.status === "paused") return "paused";
  const start = Date.parse(ev.start_at);
  const end = Date.parse(ev.end_at);
  if (now >= end) return "ended";
  if (ev.status === "live" || now >= start) return "live";
  return "upcoming";
}

export function remainingMs(ev: Pick<EventRow, "status" | "start_at" | "end_at" | "paused_at">, now = Date.now()) {
  const end = Date.parse(ev.end_at);
  if (ev.status === "paused" && ev.paused_at) return Math.max(0, end - Date.parse(ev.paused_at));
  return Math.max(0, end - now);
}
