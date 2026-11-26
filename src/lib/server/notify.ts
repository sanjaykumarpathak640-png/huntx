import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Severity } from "@/lib/types";

export interface NotifyInput {
  event_id: string;
  team?: { id: string; name: string } | null;
  type: string;
  severity?: Severity;
  clue_number?: number | null;
  message: string;
}

/** Inserts an admin alert. Supabase Realtime pushes it to open admin dashboards instantly. */
export async function notify(db: SupabaseClient, n: NotifyInput) {
  const { error } = await db.from("notifications").insert({
    event_id: n.event_id,
    team_id: n.team?.id ?? null,
    team_name: n.team?.name ?? null,
    type: n.type,
    severity: n.severity ?? "info",
    clue_number: n.clue_number ?? null,
    message: n.message,
  });
  if (error) console.error("[notify]", error);
}
