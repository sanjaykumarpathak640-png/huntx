import { z } from "zod";
import { HttpError, json, parseBody, route } from "@/lib/server/http";
import { loadCurrentEvent, requireAdmin } from "@/lib/server/auth";
import { eventPhase, remainingMs } from "@/lib/event-time";
import { notify } from "@/lib/server/notify";
import type { EventRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const { db } = await requireAdmin();
  const current = await loadCurrentEvent(db);
  if (!current) return json({ event: null, serverNow: Date.now() });
  const { event, settings } = current;
  const ev = event.id;

  const [teams, clues, pending, alerts, finished] = await Promise.all([
    db.from("teams").select("id,status,flagged", { count: "exact" }).eq("event_id", ev),
    db.from("clues").select("id", { count: "exact", head: true }).eq("event_id", ev).eq("is_active", true),
    db
      .from("photo_submissions")
      .select("id,teams!inner(event_id)", { count: "exact", head: true })
      .eq("teams.event_id", ev)
      .in("status", ["pending", "flagged"]),
    db.from("notifications").select("id", { count: "exact", head: true }).eq("event_id", ev).eq("read", false),
    db.from("teams").select("id", { count: "exact", head: true }).eq("event_id", ev).eq("status", "finished"),
  ]);
  const t = teams.data ?? [];
  return json({
    serverNow: Date.now(),
    event: { ...event, phase: eventPhase(event), remaining_ms: remainingMs(event) },
    settings,
    stats: {
      teams: t.length,
      active_teams: t.filter((x) => x.status === "active").length,
      flagged_teams: t.filter((x) => x.flagged).length,
      disqualified: t.filter((x) => x.status === "disqualified").length,
      finished: finished.count ?? 0,
      clues: clues.count ?? 0,
      pending_reviews: pending.count ?? 0,
      unread_alerts: alerts.count ?? 0,
    },
  });
});

const details = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(2000).optional(),
  venue: z.string().max(200).optional(),
  rules: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
  start_at: z.string().datetime({ offset: true }),
  end_at: z.string().datetime({ offset: true }),
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create") }).merge(details),
  z.object({ action: z.literal("update") }).merge(details.partial()),
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("end") }),
  z.object({ action: z.literal("emergency_stop"), message: z.string().max(300).optional() }),
  z.object({ action: z.literal("extend"), minutes: z.number().int().min(1).max(24 * 60) }),
]);

export const PATCH = route(async (req) => {
  const { db, user } = await requireAdmin("organiser");
  const body = await parseBody(req, schema);
  const nowIso = new Date().toISOString();
  const now = Date.now();

  if (body.action === "create") {
    if (Date.parse(body.end_at) <= Date.parse(body.start_at)) throw new HttpError(400, "End must be after start.");
    await db.from("events").update({ is_current: false }).eq("is_current", true);
    const { data, error } = await db
      .from("events")
      .insert({
        name: body.name,
        description: body.description ?? "",
        venue: body.venue || "IIT Patna, Bihta Campus",
        rules: body.rules ?? [],
        start_at: body.start_at,
        end_at: body.end_at,
        status: "scheduled",
        is_current: true,
      })
      .select("*")
      .single();
    if (error || !data) throw new HttpError(500, "Could not create event.");
    await db.from("event_settings").insert({ event_id: data.id, settings: {} });
    return json({ event: data }, 201);
  }

  const current = await loadCurrentEvent(db);
  if (!current) throw new HttpError(404, "No event.");
  const ev = current.event;
  const phase = eventPhase(ev, now);
  let patch: Partial<EventRow> = {};
  let announce: { message: string; severity: "info" | "warning" | "critical" } | null = null;

  switch (body.action) {
    case "update": {
      const { action: _a, ...rest } = body;
      patch = rest as Partial<EventRow>;
      const s = Date.parse(patch.start_at ?? ev.start_at);
      const e = Date.parse(patch.end_at ?? ev.end_at);
      if (e <= s) throw new HttpError(400, "End must be after start.");
      break;
    }
    case "start":
      if (phase === "live") throw new HttpError(409, "Already live.");
      if (phase === "ended") throw new HttpError(409, "Event ended. Extend the end time first.");
      patch = { status: "live", start_at: Date.parse(ev.start_at) > now ? nowIso : ev.start_at, paused_at: null };
      announce = { message: "🚀 The hunt is LIVE! Your first clue is unlocked.", severity: "info" };
      break;
    case "pause":
      if (phase !== "live") throw new HttpError(409, "Only a live event can be paused.");
      patch = { status: "paused", paused_at: nowIso };
      announce = { message: "⏸️ The hunt is paused by the organisers. Timers are frozen.", severity: "warning" };
      break;
    case "emergency_stop":
      patch = { status: "paused", paused_at: ev.paused_at ?? nowIso };
      announce = {
        message: `🛑 EMERGENCY STOP: ${body.message || "Stop where you are and follow organiser instructions."}`,
        severity: "critical",
      };
      break;
    case "resume": {
      if (ev.status !== "paused" || !ev.paused_at) throw new HttpError(409, "Event is not paused.");
      const pausedMs = now - Date.parse(ev.paused_at);
      const shift = (iso: string) => new Date(Date.parse(iso) + pausedMs).toISOString();
      patch = {
        status: "live",
        paused_at: null,
        end_at: shift(ev.end_at),
        total_paused_seconds: ev.total_paused_seconds + Math.round(pausedMs / 1000),
      };
      // Shift active clue deadlines so paused time isn't lost.
      const { data: active } = await db
        .from("team_progress")
        .select("id,deadline_at,teams!inner(event_id)")
        .eq("teams.event_id", ev.id)
        .eq("status", "active")
        .not("deadline_at", "is", null);
      await Promise.all(
        (active ?? []).map((p) => db.from("team_progress").update({ deadline_at: shift(p.deadline_at) }).eq("id", p.id)),
      );
      announce = { message: "▶️ The hunt has resumed. Timers extended by the paused duration.", severity: "info" };
      break;
    }
    case "end":
      patch = { status: "ended", end_at: Date.parse(ev.end_at) > now ? nowIso : ev.end_at, paused_at: null };
      announce = { message: "🏁 The hunt has ended. Submissions are closed.", severity: "info" };
      break;
    case "extend": {
      const ms = body.minutes * 60_000;
      const base = phase === "ended" ? Math.max(now, Date.parse(ev.end_at)) : Date.parse(ev.end_at);
      patch = { end_at: new Date(base + ms).toISOString() };
      if (ev.status === "ended") patch.status = "live";
      announce = { message: `⏱️ The hunt has been extended by ${body.minutes} minutes.`, severity: "info" };
      break;
    }
  }

  const { data, error } = await db.from("events").update(patch).eq("id", ev.id).select("*").single();
  if (error || !data) throw new HttpError(500, "Could not update event.");
  if (announce) {
    await db.from("announcements").insert({ event_id: ev.id, created_by: user.id, ...announce });
    await notify(db, {
      event_id: ev.id,
      type: `event_${body.action}`,
      severity: body.action === "emergency_stop" ? "critical" : "info",
      message: `🛠️ Event ${body.action.replace("_", " ")} by organiser.`,
    });
  }
  return json({ event: { ...data, phase: eventPhase(data), remaining_ms: remainingMs(data) } });
});
