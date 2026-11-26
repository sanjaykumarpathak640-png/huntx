import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventSettings } from "@/lib/settings";
import type { EventRow, LeaderboardRow, TeamRow } from "@/lib/types";

export async function computeLeaderboard(
  db: SupabaseClient,
  event: EventRow,
  settings: EventSettings,
): Promise<LeaderboardRow[]> {
  const { data: teamsData } = await db
    .from("teams")
    .select("id,name,team_uid,status,flagged,warning_count,started_at,finished_at")
    .eq("event_id", event.id);
  const teams = (teamsData ?? []) as Pick<
    TeamRow,
    "id" | "name" | "team_uid" | "status" | "flagged" | "warning_count" | "started_at" | "finished_at"
  >[];
  if (teams.length === 0) return [];

  const [{ data: records }, { data: progress }] = await Promise.all([
    db.from("scoring_records").select("team_id,points,teams!inner(event_id)").eq("teams.event_id", event.id),
    db.from("team_progress").select("team_id,status,teams!inner(event_id)").eq("teams.event_id", event.id),
  ]);

  const score = new Map<string, number>();
  const penalties = new Map<string, number>();
  for (const r of records ?? []) {
    score.set(r.team_id, (score.get(r.team_id) ?? 0) + r.points);
    if (r.points < 0) penalties.set(r.team_id, (penalties.get(r.team_id) ?? 0) + -r.points);
  }
  const completed = new Map<string, number>();
  for (const p of progress ?? []) {
    if (p.status === "completed") completed.set(p.team_id, (completed.get(p.team_id) ?? 0) + 1);
  }

  const start = Date.parse(event.start_at);
  const rows: LeaderboardRow[] = teams
    .filter((t) => t.status !== "disabled")
    .map((t) => ({
      rank: null,
      team_id: t.id,
      name: t.name,
      team_uid: t.team_uid,
      score: score.get(t.id) ?? 0,
      penalties: penalties.get(t.id) ?? 0,
      completed: completed.get(t.id) ?? 0,
      completion_ms: t.finished_at ? Date.parse(t.finished_at) - Math.min(start, Date.parse(t.started_at ?? t.finished_at)) : null,
      status: t.status,
      flagged: t.flagged,
      warning_count: t.warning_count,
    }));

  const byTime = (a: LeaderboardRow, b: LeaderboardRow) =>
    (a.completion_ms ?? Number.MAX_SAFE_INTEGER) - (b.completion_ms ?? Number.MAX_SAFE_INTEGER);

  rows.sort((a, b) => {
    const dq = Number(a.status === "disqualified") - Number(b.status === "disqualified");
    if (dq) return dq;
    switch (settings.ranking) {
      case "clues_then_time":
        return b.completed - a.completed || byTime(a, b) || b.score - a.score || a.name.localeCompare(b.name);
      case "score_only":
        return b.score - a.score || a.name.localeCompare(b.name);
      default:
        return b.score - a.score || b.completed - a.completed || byTime(a, b) || a.name.localeCompare(b.name);
    }
  });

  let rank = 0;
  for (const r of rows) r.rank = r.status === "disqualified" ? null : ++rank;
  return rows;
}
