import { z } from "zod";
import { HttpError, json, parseBody, route } from "@/lib/server/http";
import { requireAdminEvent } from "@/lib/server/admin-helpers";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const { db, event } = await requireAdminEvent();
  const { data } = await db.from("announcements").select("*").eq("event_id", event.id).order("created_at", { ascending: false }).limit(50);
  return json({ announcements: data ?? [] });
});

const schema = z.object({
  message: z.string().trim().min(1).max(500),
  severity: z.enum(["info", "warning", "critical"]).default("info"),
});

/** Broadcast to every participant (delivered via Supabase Realtime). */
export const POST = route(async (req) => {
  const { db, event, user } = await requireAdminEvent("organiser");
  const body = await parseBody(req, schema);
  const { data, error } = await db
    .from("announcements")
    .insert({ event_id: event.id, created_by: user.id, ...body })
    .select("*")
    .single();
  if (error) throw new HttpError(500, "Could not send.");
  return json({ announcement: data }, 201);
});
