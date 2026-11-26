import { HttpError, json, route } from "@/lib/server/http";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getSessionUser, loadCurrentEvent } from "@/lib/server/auth";
import { computeLeaderboard } from "@/lib/server/leaderboard";
import { eventPhase } from "@/lib/event-time";
import { rateLimit } from "@/lib/server/rate-limit";
import { clientIp } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  rateLimit(`lb:${clientIp(req)}`, 60, 60_000);
  const db = getAdminSupabase();
  const current = await loadCurrentEvent(db);
  if (!current) return json({ rows: [], event: null });
  const { event, settings } = current;
  if (!settings.public_leaderboard) {
    const user = await getSessionUser();
    if (!user) throw new HttpError(403, "Leaderboard is hidden by the organisers.");
  }
  const rows = await computeLeaderboard(db, event, settings);
  // Public view: hide internal anti-cheat details
  const safe = rows.map(({ flagged: _f, warning_count: _w, ...r }) => r);
  return json({
    event: { name: event.name, phase: eventPhase(event), ranking: settings.ranking },
    rows: safe,
    serverNow: Date.now(),
  });
});
