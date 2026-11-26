import "server-only";
import { getAdminSupabase, hasServiceRole } from "@/lib/supabase/admin";
import { loadCurrentEvent } from "./auth";
import { eventPhase, remainingMs } from "@/lib/event-time";
import type { Phase } from "@/lib/types";

export interface PublicEvent {
  configured: boolean;
  serverNow: number;
  event: null | {
    name: string;
    description: string | null;
    venue: string;
    rules: string[];
    start_at: string;
    end_at: string;
    phase: Phase;
    remaining_ms: number;
    teams: number;
    clues: number;
    registration_open: boolean;
  };
}

export async function getPublicEvent(): Promise<PublicEvent> {
  const serverNow = Date.now();
  if (!hasServiceRole()) return { configured: false, serverNow, event: null };
  try {
    const db = getAdminSupabase();
    const current = await loadCurrentEvent(db);
    if (!current) return { configured: true, serverNow, event: null };
    const { event, settings } = current;
    const [{ count: teams }, { count: clues }] = await Promise.all([
      db.from("teams").select("id", { count: "exact", head: true }).eq("event_id", event.id).neq("status", "disabled"),
      db.from("clues").select("id", { count: "exact", head: true }).eq("event_id", event.id).eq("is_active", true),
    ]);
    const phase = eventPhase(event, serverNow);
    return {
      configured: true,
      serverNow,
      event: {
        name: event.name,
        description: event.description,
        venue: event.venue,
        rules: event.rules ?? [],
        start_at: event.start_at,
        end_at: event.end_at,
        phase,
        remaining_ms: remainingMs(event, serverNow),
        teams: teams ?? 0,
        clues: clues ?? 0,
        registration_open: settings.registration_open && phase !== "ended",
      },
    };
  } catch (e) {
    console.error("[public-event]", e);
    return { configured: true, serverNow, event: null };
  }
}
