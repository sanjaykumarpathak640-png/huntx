import { z } from "zod";
import { json, parseBody, route } from "@/lib/server/http";
import { requireAdminEvent } from "@/lib/server/admin-helpers";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const { db, event } = await requireAdminEvent();
  const url = new URL(req.url);
  const severity = url.searchParams.get("severity");
  const unread = url.searchParams.get("unread") === "1";
  let q = db.from("notifications").select("*").eq("event_id", event.id).order("created_at", { ascending: false }).limit(300);
  if (severity && ["info", "success", "warning", "critical"].includes(severity)) q = q.eq("severity", severity);
  if (unread) q = q.eq("read", false);
  const { data } = await q;
  return json({ notifications: data ?? [] });
});

const schema = z.object({
  ids: z.array(z.string().uuid()).max(500).optional(),
  all: z.boolean().optional(),
  read: z.boolean().default(true),
});

export const PATCH = route(async (req) => {
  const { db, event } = await requireAdminEvent();
  const body = await parseBody(req, schema);
  let q = db.from("notifications").update({ read: body.read }).eq("event_id", event.id);
  if (!body.all) q = q.in("id", body.ids ?? []);
  await q;
  return json({ ok: true });
});
