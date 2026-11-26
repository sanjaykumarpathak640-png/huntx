import { z } from "zod";
import { json, parseBody, route } from "@/lib/server/http";
import { requireAdminEvent } from "@/lib/server/admin-helpers";

export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("purge_locations"), older_than_hours: z.number().min(0).max(24 * 365).optional() }),
  z.object({ action: z.literal("purge_photos"), confirm: z.literal("DELETE PHOTOS") }),
]);

/** Data retention controls. */
export const POST = route(async (req) => {
  const { db, event, settings } = await requireAdminEvent("super_admin");
  const body = await parseBody(req, schema);
  const { data: teams } = await db.from("teams").select("id").eq("event_id", event.id);
  const ids = (teams ?? []).map((t) => t.id);
  if (!ids.length) return json({ ok: true, affected: 0 });

  if (body.action === "purge_locations") {
    const hours = body.older_than_hours ?? settings.gps.retention_hours;
    const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
    const { count: pings } = await db.from("location_pings").delete({ count: "exact" }).in("team_id", ids).lt("created_at", cutoff);
    const { count: verifs } = await db
      .from("location_verifications")
      .update({ lat: null, lng: null }, { count: "exact" })
      .in("team_id", ids)
      .lt("created_at", cutoff);
    await db.from("photo_submissions").update({ lat: null, lng: null }).in("team_id", ids).lt("created_at", cutoff);
    await db
      .from("teams")
      .update({ last_lat: null, last_lng: null, last_accuracy: null, last_location_at: null })
      .in("id", ids)
      .lt("last_location_at", cutoff);
    return json({ ok: true, pings_deleted: pings ?? 0, verifications_anonymised: verifs ?? 0, cutoff });
  }

  const { data: subs } = await db.from("photo_submissions").select("storage_path").in("team_id", ids);
  const paths = (subs ?? []).map((s) => s.storage_path);
  for (let i = 0; i < paths.length; i += 100) await db.storage.from("submissions").remove(paths.slice(i, i + 100));
  return json({ ok: true, photos_deleted: paths.length });
});
