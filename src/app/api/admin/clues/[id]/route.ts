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

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { db, event } = await requireAdminEvent("organiser");
  const { count } = await db
    .from("photo_submissions")
    .select("id", { count: "exact", head: true })
    .eq("clue_id", params.id);
  if ((count ?? 0) > 0) {
    throw new HttpError(409, "This clue already has submissions. Deactivate it instead of deleting.");
  }
  const { error } = await db.from("clues").delete().eq("id", params.id).eq("event_id", event.id);
  if (error) throw new HttpError(500, "Could not delete clue.");
  // compact numbering
  const { data: rest } = await db.from("clues").select("id").eq("event_id", event.id).order("order_index");
  if (rest?.length) await db.rpc("reorder_clues", { p_event: event.id, p_ids: rest.map((r) => r.id) });
  return json({ ok: true });
});
