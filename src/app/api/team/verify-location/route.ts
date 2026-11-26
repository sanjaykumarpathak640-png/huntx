import { z } from "zod";
import { HttpError, json, parseBody, route } from "@/lib/server/http";
import { requireTeam } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/rate-limit";
import { completeActiveClue, syncTeamProgress } from "@/lib/server/progress";
import { eventPhase } from "@/lib/event-time";
import { coarseDistance, haversine, round } from "@/lib/geo";
import { notify } from "@/lib/server/notify";
import { award } from "@/lib/server/scoring";

export const dynamic = "force-dynamic";

const schema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).max(100000),
  timestamp: z.number().finite().optional(), // GeolocationPosition.timestamp
});

/**
 * GPS verification. All comparison happens here — the target never leaves
 * the server. NOTE: browser GPS can be spoofed (mock-location apps, devtools
 * sensors). We therefore flag anomalies for organiser review instead of
 * claiming spoof-proof verification.
 */
export const POST = route(async (req) => {
  const ctx = await requireTeam();
  const { db, team, event, settings } = ctx;
  rateLimit(`gps:${team.id}`, 6, 60_000);
  const body = await parseBody(req, schema);

  if (eventPhase(event) !== "live") throw new HttpError(409, "The hunt is not live right now.");
  if (team.status !== "active") throw new HttpError(403, "Your team cannot verify locations right now.");

  const sync = await syncTeamProgress(db, team, event, settings);
  const progress = sync.active;
  if (!progress) throw new HttpError(409, "No active clue to verify.");
  const clue = sync.clues.find((c) => c.id === progress.clue_id);
  if (!clue) throw new HttpError(409, "Active clue not found.");

  if (progress.location_verified_at) {
    return json({ verified: true, already: true, message: "Location already verified for this clue." });
  }

  const maxAttempts = clue.max_gps_attempts ?? settings.gps.max_attempts_per_clue;
  if (maxAttempts > 0 && progress.gps_attempts >= maxAttempts) {
    throw new HttpError(403, "GPS attempts exhausted for this clue. Contact an organiser.", {
      attempts_used: progress.gps_attempts,
      attempts_max: maxAttempts,
    });
  }

  // DB-enforced retry interval (works across serverless instances)
  const { data: last } = await db
    .from("location_verifications")
    .select("lat,lng,accuracy,created_at")
    .eq("team_id", team.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const now = Date.now();
  if (last) {
    const since = (now - Date.parse(last.created_at)) / 1000;
    if (since < settings.gps.min_retry_seconds) {
      const wait = Math.ceil(settings.gps.min_retry_seconds - since);
      throw new HttpError(429, `Please wait ${wait}s before retrying.`, { retry_after_s: wait });
    }
  }

  // ---- anomaly detection (flags for review, never auto-punishes) ----
  const reasons: string[] = [];
  if (body.accuracy <= settings.gps.suspicious_accuracy_below_m) {
    reasons.push(`Unrealistically precise accuracy (${body.accuracy} m)`);
  }
  if (last?.lat != null && last?.lng != null) {
    const dt = (now - Date.parse(last.created_at)) / 1000;
    const moved = haversine(last.lat, last.lng, body.lat, body.lng);
    if (dt > 0 && moved / dt > settings.gps.max_speed_mps && moved > 150) {
      reasons.push(`Implausible movement: ${Math.round(moved)} m in ${Math.round(dt)} s`);
    }
    if (last.lat === body.lat && last.lng === body.lng && last.accuracy === body.accuracy) {
      reasons.push("Identical coordinates & accuracy repeated");
    }
  }
  if (body.timestamp && Math.abs(body.timestamp - now) > 5 * 60_000) {
    reasons.push("Location fix timestamp far from server time (stale/cached fix)");
  }

  const distance = haversine(body.lat, body.lng, clue.target_lat, clue.target_lng);
  const within = distance <= clue.radius_m;
  const accurateEnough = body.accuracy <= settings.gps.max_accuracy_m;
  const verified = within && accurateEnough;
  const suspicious = reasons.length > 0;

  await db.from("location_verifications").insert({
    team_id: team.id,
    clue_id: clue.id,
    lat: body.lat,
    lng: body.lng,
    accuracy: body.accuracy,
    distance_m: round(distance, 1),
    within_radius: within,
    verified,
    suspicious,
    suspicion_reasons: reasons,
    client_timestamp: body.timestamp ? new Date(body.timestamp).toISOString() : null,
  });

  const attempts = progress.gps_attempts + 1;
  await db
    .from("team_progress")
    .update({ gps_attempts: attempts, ...(verified ? { location_verified_at: new Date().toISOString() } : {}) })
    .eq("id", progress.id);
  await db
    .from("teams")
    .update({ last_lat: body.lat, last_lng: body.lng, last_accuracy: body.accuracy, last_location_at: new Date().toISOString() })
    .eq("id", team.id);

  if (suspicious) {
    await notify(db, {
      event_id: event.id,
      team,
      type: "gps_suspicious",
      severity: "warning",
      clue_number: clue.order_index,
      message: `🛰️ Team ${team.name} – Suspicious GPS report on Clue ${clue.order_index}: ${reasons.join("; ")}`,
    });
  }

  if (verified) {
    await award(db, {
      team_id: team.id,
      clue_id: clue.id,
      kind: "location",
      points: settings.scoring.location_verified,
      reason: `Location verified – Clue ${clue.order_index}`,
    });
    await notify(db, {
      event_id: event.id,
      team,
      type: "gps_verified",
      severity: "success",
      clue_number: clue.order_index,
      message: `📍 Team ${team.name} – Location verified for Clue ${clue.order_index}.`,
    });
    const completesNow =
      clue.unlock_rule === "on_verification" || (!clue.photo_required && clue.unlock_rule === "on_submission");
    if (completesNow) {
      await completeActiveClue(db, team, event, settings, progress.id, { clueNumber: clue.order_index });
    }
  } else if (attempts % 3 === 0) {
    await notify(db, {
      event_id: event.id,
      team,
      type: "gps_failed_repeatedly",
      severity: "warning",
      clue_number: clue.order_index,
      message: `❌ Team ${team.name} – ${attempts} failed GPS attempts on Clue ${clue.order_index}.`,
    });
  }

  let message: string;
  if (verified) message = "Location verified! You can now capture your photo.";
  else if (!accurateEnough)
    message = `GPS accuracy is ±${Math.round(body.accuracy)} m (need ≤ ${settings.gps.max_accuracy_m} m). Move to open sky and retry.`;
  else message = `You are about ${coarseDistance(distance)} m from the target zone. Keep searching!`;

  return json({
    verified,
    distance_m: coarseDistance(distance),
    accuracy_m: Math.round(body.accuracy),
    accuracy_ok: accurateEnough,
    attempts_used: attempts,
    attempts_max: maxAttempts,
    retry_after_s: settings.gps.min_retry_seconds,
    message,
  });
});
