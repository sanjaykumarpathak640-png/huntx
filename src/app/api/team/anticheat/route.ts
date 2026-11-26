import { z } from "zod";
import { json, parseBody, route } from "@/lib/server/http";
import { requireTeam } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/rate-limit";
import { eventPhase } from "@/lib/event-time";
import { notify } from "@/lib/server/notify";
import { award } from "@/lib/server/scoring";

export const dynamic = "force-dynamic";

const schema = z.object({
  type: z.enum(["tab_hidden", "tab_visible", "window_blur", "window_focus", "fullscreen_exit", "fullscreen_enter", "page_unload", "page_reload"]),
  client_at: z.number().finite().optional(),
  meta: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const COUNTABLE = new Set(["tab_hidden", "window_blur", "fullscreen_exit"]);

/**
 * Records signals that the participant left THIS page. It cannot (and does
 * not try to) see other tabs, apps or device activity. Signals are noisy
 * (notifications, incoming calls, OS dialogs also blur the window), so they
 * only add warnings/penalties and flags — never automatic disqualification.
 */
export const POST = route(async (req) => {
  const ctx = await requireTeam();
  const { db, team, event, settings } = ctx;
  rateLimit(`ac:${team.id}`, 40, 60_000);
  const body = await parseBody(req, schema);
  const ac = settings.anticheat;

  const live = eventPhase(event) === "live" && team.status === "active";
  const ignored = !ac.enabled || ac.ignored_events.includes(body.type);
  let countable =
    live &&
    !ignored &&
    COUNTABLE.has(body.type) &&
    (body.type !== "fullscreen_exit" || ac.fullscreen_mode);

  // De-duplicate: a single tab switch fires blur + visibilitychange together.
  if (countable) {
    const since = new Date(Date.now() - 4000).toISOString();
    const { data: recent } = await db
      .from("anti_cheat_events")
      .select("id")
      .eq("team_id", team.id)
      .eq("counted", true)
      .gte("created_at", since)
      .limit(1);
    if (recent?.length) countable = false;
  }

  await db.from("anti_cheat_events").insert({
    event_id: event.id,
    team_id: team.id,
    type: body.type,
    counted: countable,
    ignored,
    client_at: body.client_at ? new Date(body.client_at).toISOString() : null,
    user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    meta: body.meta ?? {},
  });

  // Repeated refresh / leave attempts → alert (not counted as a warning)
  if (live && !ignored && (body.type === "page_unload" || body.type === "page_reload")) {
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await db
      .from("anti_cheat_events")
      .select("id", { count: "exact", head: true })
      .eq("team_id", team.id)
      .in("type", ["page_unload", "page_reload"])
      .gte("created_at", since);
    if ((count ?? 0) === 4) {
      await notify(db, {
        event_id: event.id,
        team,
        type: "repeated_reload",
        severity: "warning",
        message: `🔄 Team ${team.name} – Reloaded/left the hunt page 4+ times in 10 minutes.`,
      });
    }
  }

  if (!countable) return json({ counted: false, warning_count: team.warning_count, threshold: ac.warning_threshold });

  const { data: newCount } = await db.rpc("increment_team_warning", { p_team: team.id });
  const count = typeof newCount === "number" ? newCount : team.warning_count + 1;

  if (count > settings.scoring.free_warnings && settings.scoring.tab_switch_penalty > 0) {
    await award(db, {
      team_id: team.id,
      kind: "tab_switch",
      points: -settings.scoring.tab_switch_penalty,
      reason: `Anti-cheat warning #${count} (${body.type})`,
    });
  }

  const updates: Record<string, unknown> = {};
  if (count >= ac.flag_threshold && !team.flagged) updates.flagged = true;
  if (ac.auto_lock_submissions && count >= ac.lock_threshold && !team.submissions_locked) updates.submissions_locked = true;
  if (Object.keys(updates).length) await db.from("teams").update(updates).eq("id", team.id);

  const label =
    body.type === "fullscreen_exit" ? "Exited fullscreen hunt mode." : "Switched away from the hunt page.";
  const severity = count >= ac.warning_threshold ? "critical" : "warning";
  await notify(db, {
    event_id: event.id,
    team,
    type: body.type === "fullscreen_exit" ? "fullscreen_exit" : "tab_switch",
    severity,
    message:
      count >= ac.warning_threshold
        ? `🚨 Team ${team.name} – ${count} tab-switch warnings. ${label}`
        : `⚠️ Team ${team.name} – ${label} (warning ${count}/${ac.warning_threshold})`,
  });
  if (updates.flagged) {
    await notify(db, {
      event_id: event.id,
      team,
      type: "team_flagged",
      severity: "critical",
      message: `🚩 Team ${team.name} – Auto-flagged for review after ${count} warnings.`,
    });
  }
  if (updates.submissions_locked) {
    await notify(db, {
      event_id: event.id,
      team,
      type: "submissions_locked",
      severity: "critical",
      message: `🔒 Team ${team.name} – Submissions auto-locked after ${count} warnings.`,
    });
  }

  return json({
    counted: true,
    warning_count: count,
    threshold: ac.warning_threshold,
    locked: Boolean(updates.submissions_locked) || team.submissions_locked,
  });
});
