import { HttpError, json, parseBody, route } from "@/lib/server/http";
import { requireAdminEvent } from "@/lib/server/admin-helpers";
import { clueSchema } from "@/lib/server/schemas";

export const dynamic = "force-dynamic";


export const GET = route(async () => {
  const { db, event } = await requireAdminEvent("organiser");
  const { data } = await db.from("clues").select("*").eq("event_id", event.id).order("order_index");
  const ids = (data ?? []).map((c) => c.id);
  const { data: prog } = ids.length
    ? await db.from("team_progress").select("clue_id,status").in("clue_id", ids)
    : { data: [] as { clue_id: string; status: string }[] };
  const stats = new Map<string, { active: number; completed: number }>();
  for (const p of prog ?? []) {
    const s = stats.get(p.clue_id) ?? { active: 0, completed: 0 };
    if (p.status === "active") s.active++;
    if (p.status === "completed") s.completed++;
    stats.set(p.clue_id, s);
  }
  return json({ clues: (data ?? []).map((c) => ({ ...c, stats: stats.get(c.id) ?? { active: 0, completed: 0 } })) });
});

export const POST = route(async (req) => {
  const { db, event } = await requireAdminEvent("organiser");
  const body = await parseBody(req, clueSchema);
  const { data: last } = await db
    .from("clues")
    .select("order_index")
    .eq("event_id", event.id)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await db
    .from("clues")
    .insert({ ...body, event_id: event.id, order_index: (last?.order_index ?? 0) + 1 })
    .select("*")
    .single();
  if (error) throw new HttpError(500, "Could not create clue.");
  return json({ clue: data }, 201);
});
