import { z } from "zod";
import { HttpError, json, parseBody, route } from "@/lib/server/http";
import { requireAdminEvent } from "@/lib/server/admin-helpers";

export const dynamic = "force-dynamic";

const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

export const POST = route(async (req) => {
  const { db, event } = await requireAdminEvent("organiser");
  const { ids } = await parseBody(req, schema);
  const { data: all } = await db.from("clues").select("id").eq("event_id", event.id);
  const known = new Set((all ?? []).map((c) => c.id));
  if (ids.length !== known.size || ids.some((id) => !known.has(id))) {
    throw new HttpError(400, "Reorder list must contain every clue exactly once.");
  }
  const { error } = await db.rpc("reorder_clues", { p_event: event.id, p_ids: ids });
  if (error) throw new HttpError(500, "Could not reorder clues.");
  return json({ ok: true });
});
