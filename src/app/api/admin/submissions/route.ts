import { json, route } from "@/lib/server/http";
import { requireAdminEvent } from "@/lib/server/admin-helpers";

export const dynamic = "force-dynamic";

/** Lists submissions with short-lived signed URLs (bucket is private). */
export const GET = route(async (req) => {
  const { db, event } = await requireAdminEvent();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const teamId = url.searchParams.get("team");
  let q = db
    .from("photo_submissions")
    .select("*,teams!inner(id,name,team_uid,event_id),clues(order_index,title,photo_required,points,radius_m)")
    .eq("teams.event_id", event.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && ["pending", "approved", "rejected", "flagged", "retake_requested"].includes(status)) q = q.eq("status", status);
  if (teamId && /^[0-9a-f-]{36}$/i.test(teamId)) q = q.eq("team_id", teamId);
  const { data } = await q;
  const rows = data ?? [];
  const paths = rows.map((r) => r.storage_path);
  const signed = paths.length
    ? (await db.storage.from("submissions").createSignedUrls(paths, 60 * 60)).data ?? []
    : [];
  const urlFor = new Map(signed.map((s) => [s.path, s.signedUrl]));
  return json({
    submissions: rows.map((r) => ({ ...r, url: urlFor.get(r.storage_path) ?? null })),
  });
});
