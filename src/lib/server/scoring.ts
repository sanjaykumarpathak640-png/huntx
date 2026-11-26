import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ScoreKind =
  | "photo"
  | "location"
  | "hint"
  | "late"
  | "tab_switch"
  | "bonus"
  | "deduction"
  | "completion"
  | "adjustment";

/**
 * Adds a ledger row. Automatic awards (photo/location/hint/late/completion)
 * are protected by unique indexes, so retries can never double-count.
 */
export async function award(
  db: SupabaseClient,
  r: { team_id: string; clue_id?: string | null; kind: ScoreKind; points: number; reason: string; created_by?: string | null },
): Promise<boolean> {
  if (!Number.isFinite(r.points) || r.points === 0) return false;
  const { error } = await db.from("scoring_records").insert({
    team_id: r.team_id,
    clue_id: r.clue_id ?? null,
    kind: r.kind,
    points: Math.round(r.points),
    reason: r.reason,
    created_by: r.created_by ?? null,
  });
  if (error) {
    if (error.code === "23505") return false; // already awarded
    console.error("[award]", error);
    return false;
  }
  return true;
}

export async function teamScore(db: SupabaseClient, teamId: string): Promise<number> {
  const { data } = await db.from("scoring_records").select("points").eq("team_id", teamId);
  return (data ?? []).reduce((s, r) => s + (r.points as number), 0);
}
