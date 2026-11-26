import { json, route } from "@/lib/server/http";
import { requireAdminEvent } from "@/lib/server/admin-helpers";
import { computeLeaderboard } from "@/lib/server/leaderboard";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const { db, event, settings } = await requireAdminEvent();
  const [{ data: teams }, { data: clues }, { data: verifs }, { data: subs }, { data: active }, board] = await Promise.all([
    db.from("teams").select("*").eq("event_id", event.id),
    db.from("clues").select("id,order_index,title,target_lat,target_lng,radius_m,is_active").eq("event_id", event.id).order("order_index"),
    db
      .from("location_verifications")
      .select("id,team_id,lat,lng,accuracy,verified,suspicious,created_at,clues(order_index),teams!inner(event_id,name)")
      .eq("teams.event_id", event.id)
      .eq("verified", true)
      .order("created_at", { ascending: false })
      .limit(500),
    db
      .from("photo_submissions")
      .select("id,team_id,lat,lng,status,created_at,clues(order_index),teams!inner(event_id,name)")
      .eq("teams.event_id", event.id)
      .not("lat", "is", null)
      .limit(500),
    db
      .from("team_progress")
      .select("team_id,location_verified_at,clues(order_index,title),teams!inner(event_id)")
      .eq("teams.event_id", event.id)
      .eq("status", "active"),
    computeLeaderboard(db, event, settings),
  ]);
  const lb = new Map(board.map((r) => [r.team_id, r]));
  const show = settings.gps.share_last_location;
  return json({
    clues: clues ?? [],
    teams: (teams ?? []).map((t) => {
      const cur = (active ?? []).find((a) => a.team_id === t.id) as
        | { location_verified_at: string | null; clues: { order_index: number; title: string } | null }
        | undefined;
      return {
        id: t.id,
        name: t.name,
        team_uid: t.team_uid,
        status: t.status,
        flagged: t.flagged,
        warning_count: t.warning_count,
        score: lb.get(t.id)?.score ?? 0,
        completed: lb.get(t.id)?.completed ?? 0,
        current_clue: cur?.clues?.order_index ?? null,
        current_verified: Boolean(cur?.location_verified_at),
        last: show && t.last_lat != null ? { lat: t.last_lat, lng: t.last_lng, accuracy: t.last_accuracy, at: t.last_location_at } : null,
      };
    }),
    verifications: verifs ?? [],
    submissions: subs ?? [],
    privacy: { share_last_location: show, periodic_updates: settings.gps.periodic_updates, retention_hours: settings.gps.retention_hours },
  });
});
