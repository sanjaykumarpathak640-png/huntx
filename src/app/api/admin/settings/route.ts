import { HttpError, json, parseBody, route } from "@/lib/server/http";
import { requireAdminEvent } from "@/lib/server/admin-helpers";
import { deepMerge, resolveSettings, settingsPatchSchema } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const { settings } = await requireAdminEvent();
  return json({ settings });
});

export const PATCH = route(async (req) => {
  const { db, event } = await requireAdminEvent("organiser");
  const patch = await parseBody(req, settingsPatchSchema);
  const { data: row } = await db.from("event_settings").select("settings").eq("event_id", event.id).maybeSingle();
  const merged = deepMerge((row?.settings as object) ?? {}, patch);
  const { error } = await db.from("event_settings").upsert({ event_id: event.id, settings: merged });
  if (error) throw new HttpError(500, "Could not save settings.");
  return json({ settings: resolveSettings(merged) });
});
