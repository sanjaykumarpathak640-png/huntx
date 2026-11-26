import { HttpError, route } from "@/lib/server/http";
import { csv, requireAdminEvent } from "@/lib/server/admin-helpers";
import { computeLeaderboard } from "@/lib/server/leaderboard";

export const dynamic = "force-dynamic";

const TYPES = ["leaderboard", "teams", "submissions", "anticheat", "locations", "notifications", "scores"] as const;
type ExportType = (typeof TYPES)[number];

export const GET = route(async (req) => {
  const { db, event, settings } = await requireAdminEvent("organiser");
  const type = new URL(req.url).searchParams.get("type") as ExportType;
  if (!TYPES.includes(type)) throw new HttpError(400, `type must be one of ${TYPES.join(", ")}`);
  let body = "";

  switch (type) {
    case "leaderboard": {
      const rows = await computeLeaderboard(db, event, settings);
      body = csv(
        rows.map((r) => ({ ...r, completion_minutes: r.completion_ms ? (r.completion_ms / 60000).toFixed(1) : "" })),
        ["rank", "name", "team_uid", "score", "completed", "penalties", "completion_minutes", "status", "flagged", "warning_count"],
      );
      break;
    }
    case "teams": {
      const { data } = await db.from("teams").select("*,team_members(name,email,is_leader)").eq("event_id", event.id);
      body = csv(
        (data ?? []).map((t) => ({
          ...t,
          members: (t.team_members ?? []).map((m: { name: string }) => m.name),
        })),
        ["team_uid", "name", "username", "join_code", "leader_name", "contact_email", "members", "status", "flagged", "warning_count", "started_at", "finished_at", "created_at"],
      );
      break;
    }
    case "submissions": {
      const { data } = await db
        .from("photo_submissions")
        .select("*,teams!inner(name,team_uid,event_id),clues(order_index,title)")
        .eq("teams.event_id", event.id)
        .order("created_at");
      body = csv(
        (data ?? []).map((s) => ({
          ...s,
          team: s.teams?.name,
          team_uid: s.teams?.team_uid,
          clue_number: s.clues?.order_index,
          clue_title: s.clues?.title,
        })),
        ["id", "team", "team_uid", "clue_number", "clue_title", "status", "source", "captured_at", "created_at", "is_late", "location_verified", "lat", "lng", "accuracy", "flag_reasons", "points_awarded", "admin_comment", "reviewed_at", "storage_path"],
      );
      break;
    }
    case "anticheat": {
      const { data } = await db.from("anti_cheat_events").select("*,teams(name,team_uid)").eq("event_id", event.id).order("created_at");
      body = csv(
        (data ?? []).map((a) => ({ ...a, team: a.teams?.name, team_uid: a.teams?.team_uid })),
        ["created_at", "team", "team_uid", "type", "counted", "ignored", "client_at", "user_agent", "meta"],
      );
      break;
    }
    case "locations": {
      const { data } = await db
        .from("location_verifications")
        .select("*,teams!inner(name,event_id),clues(order_index)")
        .eq("teams.event_id", event.id)
        .order("created_at");
      body = csv(
        (data ?? []).map((v) => ({ ...v, team: v.teams?.name, clue_number: v.clues?.order_index })),
        ["created_at", "team", "clue_number", "lat", "lng", "accuracy", "distance_m", "within_radius", "verified", "suspicious", "suspicion_reasons"],
      );
      break;
    }
    case "notifications": {
      const { data } = await db.from("notifications").select("*").eq("event_id", event.id).order("created_at");
      body = csv(data ?? [], ["created_at", "severity", "type", "team_name", "clue_number", "message", "read"]);
      break;
    }
    case "scores": {
      const { data } = await db
        .from("scoring_records")
        .select("*,teams!inner(name,event_id),clues(order_index)")
        .eq("teams.event_id", event.id)
        .order("created_at");
      body = csv(
        (data ?? []).map((r) => ({ ...r, team: r.teams?.name, clue_number: r.clues?.order_index })),
        ["created_at", "team", "clue_number", "kind", "points", "reason"],
      );
      break;
    }
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="huntx-${type}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
});
