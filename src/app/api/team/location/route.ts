import { z } from "zod";
import { HttpError, json, parseBody, route } from "@/lib/server/http";
import { requireTeam } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/rate-limit";
import { eventPhase } from "@/lib/event-time";

export const dynamic = "force-dynamic";

const pingSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).max(100000),
});

/**
 * Optional periodic location update. Only accepted when the organiser
 * enabled periodic updates AND the team explicitly opted in.
 */
export const POST = route(async (req) => {
  const { db, team, event, settings } = await requireTeam();
  if (!settings.gps.periodic_updates) throw new HttpError(403, "Periodic location updates are disabled.");
  if (!team.location_sharing) throw new HttpError(403, "Location sharing is off for your team.");
  if (eventPhase(event) !== "live") throw new HttpError(409, "Hunt not live.");
  rateLimit(`ping:${team.id}`, 2, Math.max(15, settings.gps.periodic_interval_seconds / 2) * 1000);
  const body = await parseBody(req, pingSchema);
  await db.from("location_pings").insert({ team_id: team.id, ...body });
  await db
    .from("teams")
    .update({ last_lat: body.lat, last_lng: body.lng, last_accuracy: body.accuracy, last_location_at: new Date().toISOString() })
    .eq("id", team.id);
  return json({ ok: true });
});

const consentSchema = z.object({ location_sharing: z.boolean() });

/** Participant toggles consent for periodic location sharing. */
export const PATCH = route(async (req) => {
  const { db, team } = await requireTeam();
  const { location_sharing } = await parseBody(req, consentSchema);
  await db.from("teams").update({ location_sharing }).eq("id", team.id);
  return json({ ok: true, location_sharing });
});
