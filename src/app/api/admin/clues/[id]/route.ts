import { HttpError, json, parseBody, route } from "@/lib/server/http";
import { requireAdminEvent } from "@/lib/server/admin-helpers";
import { clueSchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { db, event } = await requireAdminEvent("organiser");
  const body = await parseBody(req, clueSchema.partial());
  const { data, error } = await db
    .from("clues")
    .update(body)
    .eq("id", params.id)
    .eq("event_id", event.id)
    .select("*")
    .single();
  if (error || !data) throw new HttpError(404, "Clue not found.");
  return json({ clue: data });
});

/**
 * Removes a challenge. If teams already submitted photos for it, the call
 * returns 409 with the count; repeating it with ?force=1 also deletes those
 * photos, their points and progress for this clue.
 */
export const DELETE = route<Ctx>(async (req, { params }) => {
  const { db, event } = await requireAdminEvent("organiser");
  const force = new URL(req.url).searchParams.get("force") === "1";
  const { data: clue } = await db.from("clues").select("id,image_path").eq("id", params.id).eq("event_id", event.id).maybeSingle();
  if (!clue) throw new HttpError(404, "Clue not found.");

  const { data: subs } = await db.from("photo_submissions").select("storage_path").eq("clue_id", clue.id);
  if (subs?.length && !force) {
    throw new HttpError(409, `${subs.length} photo(s) were submitted for this clue.`, { submissions: subs.length });
  }
  if (subs?.length) {
    const paths = subs.map((s) => s.storage_path);
    for (let i = 0; i < paths.length; i += 100) await db.storage.from("submissions").remove(paths.slice(i, i + 100));
  }
  await db.from("scoring_records").delete().eq("clue_id", clue.id);
  if (clue.image_path) await db.storage.from("clue-media").remove([clue.image_path]);

  // progress rows and submissions cascade with the clue
  const { error } = await db.from("clues").delete().eq("id", clue.id).eq("event_id", event.id);
  if (error) throw new HttpError(500, "Could not delete clue.");
  // compact numbering
  const { data: rest } = await db.from("clues").select("id").eq("event_id", event.id).order("order_index");
  if (rest?.length) await db.rpc("reorder_clues", { p_event: event.id, p_ids: rest.map((r) => r.id) });
  return json({ ok: true });
});
