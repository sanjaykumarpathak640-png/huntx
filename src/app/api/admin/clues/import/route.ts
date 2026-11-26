import { z } from "zod";
import { HttpError, json, parseBody, route } from "@/lib/server/http";
import { requireAdminEvent } from "@/lib/server/admin-helpers";
import { clueSchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";

const schema = z.object({
  clues: z.array(clueSchema).min(1).max(200),
  replace: z.boolean().default(false),
});

/** Bulk upload of challenges (from CSV parsed in the browser). */
export const POST = route(async (req) => {
  const { db, event } = await requireAdminEvent("organiser");
  const { clues, replace } = await parseBody(req, schema);

  if (replace) {
    const { count } = await db
      .from("photo_submissions")
      .select("id,clues!inner(event_id)", { count: "exact", head: true })
      .eq("clues.event_id", event.id);
    if ((count ?? 0) > 0) throw new HttpError(409, "Clues already have submissions — import without 'replace', or delete them one by one.");
    await db.from("clues").delete().eq("event_id", event.id);
  }

  const { data: last } = await db
    .from("clues")
    .select("order_index")
    .eq("event_id", event.id)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const start = (last?.order_index ?? 0) + 1;
  const rows = clues.map((c, i) => ({ ...c, event_id: event.id, order_index: start + i }));
  const { error } = await db.from("clues").insert(rows);
  if (error) {
    console.error("[import]", error);
    throw new HttpError(500, "Import failed: " + error.message);
  }
  return json({ ok: true, imported: rows.length }, 201);
});
