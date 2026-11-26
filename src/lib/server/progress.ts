import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventSettings } from "@/lib/settings";
import type { ClueRow, EventRow, ProgressRow, TeamRow } from "@/lib/types";
import { eventPhase } from "@/lib/event-time";
import { notify } from "./notify";
import { award } from "./scoring";

/**
 * Clue progression engine (server-side only).
 *
 * - A team has at most ONE progress row with status 'active' (DB unique index).
 * - The clue's unlock_rule decides when it is completed:
 *     on_verification → GPS verified
 *     on_submission   → photo submitted (or verified if no photo required)
 *     on_approval     → organiser approves the photo
 *     manual          → organiser unlocks the next clue
 * - When nothing is active and the event is live, the next active clue
 *   (by order_index) that the team hasn't completed/skipped is unlocked.
 * - When no clues remain the team is finished.
 */

export async function getEventClues(db: SupabaseClient, eventId: string): Promise<ClueRow[]> {
  const { data } = await db
    .from("clues")
    .select("*")
    .eq("event_id", eventId)
    .eq("is_active", true)
    .order("order_index", { ascending: true });
  return (data ?? []) as ClueRow[];
}

export async function getProgress(db: SupabaseClient, teamId: string): Promise<ProgressRow[]> {
  const { data } = await db.from("team_progress").select("*").eq("team_id", teamId);
  return (data ?? []) as ProgressRow[];
}

export function computeDeadline(clue: ClueRow, event: EventRow, now = Date.now()): string | null {
  const candidates: number[] = [Date.parse(event.end_at)];
  if (clue.time_limit_minutes) candidates.push(now + clue.time_limit_minutes * 60_000);
  if (clue.deadline_at) candidates.push(Date.parse(clue.deadline_at));
  return new Date(Math.min(...candidates)).toISOString();
}

interface SyncResult {
  clues: ClueRow[];
  progress: ProgressRow[];
  active: ProgressRow | null;
  finished: boolean;
  team: TeamRow;
}

export async function syncTeamProgress(
  db: SupabaseClient,
  team: TeamRow,
  event: EventRow,
  settings: EventSettings,
  depth = 0,
): Promise<SyncResult> {
  const now = Date.now();
  const phase = eventPhase(event, now);
  const [clues, progress] = await Promise.all([getEventClues(db, event.id), getProgress(db, team.id)]);
  let active = progress.find((p) => p.status === "active") ?? null;

  // Expired clue with no late submissions allowed → skip it automatically.
  if (active && phase === "live" && active.deadline_at && Date.parse(active.deadline_at) < now) {
    if (!settings.photo.allow_late_submissions && !active.submitted_at) {
      const { data: updated } = await db
        .from("team_progress")
        .update({ status: "skipped", completed_at: new Date().toISOString() })
        .eq("id", active.id)
        .eq("status", "active")
        .select("id");
      if (updated?.length) {
        const clue = clues.find((c) => c.id === active!.clue_id);
        await notify(db, {
          event_id: event.id,
          team,
          type: "clue_expired",
          severity: "warning",
          clue_number: clue?.order_index ?? null,
          message: `⏱️ Team ${team.name} – Time ran out on Clue ${clue?.order_index ?? "?"}. Moved to next clue.`,
        });
        if (depth < 3) return syncTeamProgress(db, team, event, settings, depth + 1);
      }
    }
  }

  const canUnlock = phase === "live" && team.status === "active";
  if (!active && canUnlock && clues.length > 0) {
    const done = new Set(progress.map((p) => p.clue_id));
    const next = clues.find((c) => !done.has(c.id));
    if (next) {
      const { data: inserted, error } = await db
        .from("team_progress")
        .insert({
          team_id: team.id,
          clue_id: next.id,
          status: "active",
          deadline_at: computeDeadline(next, event, now),
        })
        .select("*")
        .single();
      if (!error && inserted) {
        active = inserted as ProgressRow;
        progress.push(active);
        if (!team.started_at) {
          await db.from("teams").update({ started_at: new Date().toISOString() }).eq("id", team.id);
          team = { ...team, started_at: new Date().toISOString() };
        }
      } else if (error?.code === "23505" && depth < 3) {
        // Concurrent request already unlocked it — re-read.
        return syncTeamProgress(db, team, event, settings, depth + 1);
      }
    } else if (progress.length > 0) {
      team = await finishTeam(db, team, event, settings, clues);
    }
  }

  return { clues, progress, active, finished: team.status === "finished", team };
}

async function finishTeam(
  db: SupabaseClient,
  team: TeamRow,
  event: EventRow,
  settings: EventSettings,
  clues: ClueRow[],
): Promise<TeamRow> {
  const { data } = await db
    .from("teams")
    .update({ status: "finished", finished_at: new Date().toISOString() })
    .eq("id", team.id)
    .eq("status", "active")
    .select("*")
    .single();
  if (!data) return team;
  await award(db, {
    team_id: team.id,
    kind: "completion",
    points: settings.scoring.completion_bonus,
    reason: "Completed all clues",
  });
  await notify(db, {
    event_id: event.id,
    team,
    type: "finished",
    severity: "success",
    clue_number: clues.length,
    message: `🏁 Team ${team.name} – Reached the finish line!`,
  });
  return data as TeamRow;
}

/** Marks the active clue completed (idempotent) and unlocks the next one. */
export async function completeActiveClue(
  db: SupabaseClient,
  team: TeamRow,
  event: EventRow,
  settings: EventSettings,
  progressId: string,
  opts: { byAdmin?: boolean; clueNumber?: number } = {},
) {
  const { data } = await db
    .from("team_progress")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      unlocked_by_admin: Boolean(opts.byAdmin),
    })
    .eq("id", progressId)
    .eq("status", "active")
    .select("id");
  if (data?.length) {
    await notify(db, {
      event_id: event.id,
      team,
      type: "clue_completed",
      severity: "success",
      clue_number: opts.clueNumber ?? null,
      message: opts.byAdmin
        ? `🔓 Team ${team.name} – Organiser unlocked the next clue (after Clue ${opts.clueNumber ?? "?"}).`
        : `✅ Team ${team.name} – Completed Clue ${opts.clueNumber ?? "?"}.`,
    });
  }
  return syncTeamProgress(db, team, event, settings);
}
