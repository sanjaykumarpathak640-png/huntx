import { createHash, randomUUID } from "crypto";
import { HttpError, json, route } from "@/lib/server/http";
import { requireTeam } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/rate-limit";
import { completeActiveClue, syncTeamProgress } from "@/lib/server/progress";
import { eventPhase } from "@/lib/event-time";
import { notify } from "@/lib/server/notify";
import { award } from "@/lib/server/scoring";
import type { SubmissionRow } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function sniffMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

const numOrNull = (v: FormDataEntryValue | null) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Photo upload. The file is uploaded by the server into a PRIVATE bucket
 * (no public URLs). Every rule (event live, clue unlocked, GPS-before-photo,
 * deadline, one live submission per clue, duplicate image) is enforced here.
 * Metadata is recorded for organiser review — it is NOT proof by itself.
 */
export const POST = route(async (req) => {
  const ctx = await requireTeam();
  const { db, team, event, settings } = ctx;
  rateLimit(`photo:${team.id}`, 4, 60_000);

  if (eventPhase(event) !== "live") throw new HttpError(409, "Submissions are closed — the hunt is not live.");
  if (team.status !== "active") throw new HttpError(403, "Your team cannot submit right now.");
  if (team.submissions_locked) throw new HttpError(403, "Submissions are locked for your team. Contact an organiser.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Expected multipart form data.");
  }
  const file = form.get("photo");
  const clueId = String(form.get("clue_id") ?? "");
  const source = String(form.get("source") ?? "camera") === "gallery" ? "gallery" : "camera";
  const capturedAtRaw = numOrNull(form.get("captured_at"));
  const lat = numOrNull(form.get("lat"));
  const lng = numOrNull(form.get("lng"));
  const accuracy = numOrNull(form.get("accuracy"));

  if (!(file instanceof Blob)) throw new HttpError(400, "Photo missing.");
  if (!/^[0-9a-f-]{36}$/i.test(clueId)) throw new HttpError(400, "Invalid clue.");
  if (source === "gallery" && !settings.photo.allow_gallery_upload) {
    throw new HttpError(403, "Gallery uploads are disabled. Use the in-app camera.");
  }
  const maxBytes = settings.photo.max_size_mb * 1024 * 1024;
  if (file.size === 0 || file.size > maxBytes) throw new HttpError(413, `Photo must be under ${settings.photo.max_size_mb} MB.`);

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime) throw new HttpError(415, "Unsupported image format.");

  // ---- eligibility ----
  const sync = await syncTeamProgress(db, team, event, settings);
  const clue = sync.clues.find((c) => c.id === clueId);
  if (!clue) throw new HttpError(404, "Clue not available.");
  const progress = sync.progress.find((p) => p.clue_id === clueId);
  if (!progress) throw new HttpError(403, "This clue is still locked.");

  const { data: prevData } = await db
    .from("photo_submissions")
    .select("*")
    .eq("team_id", team.id)
    .eq("clue_id", clueId)
    .order("created_at", { ascending: false });
  const prev = (prevData ?? []) as SubmissionRow[];
  const latest = prev[0];
  if (latest && ["pending", "approved", "flagged"].includes(latest.status)) {
    throw new HttpError(409, "A photo for this clue is already submitted.");
  }
  const isActive = progress.status === "active";
  const isRetake = latest?.status === "retake_requested";
  if (!isActive && !isRetake) throw new HttpError(403, "This clue is closed for submissions.");
  if (!isActive && latest?.status === "rejected") throw new HttpError(403, "This clue's submission was rejected.");

  if (settings.gps.require_before_photo && !progress.location_verified_at) {
    throw new HttpError(403, "Verify your location before submitting a photo.");
  }

  const now = Date.now();
  let isLate = false;
  if (isActive && progress.deadline_at && now > Date.parse(progress.deadline_at)) {
    if (!settings.photo.allow_late_submissions) throw new HttpError(403, "The deadline for this clue has passed.");
    isLate = true;
  }

  // ---- integrity checks (flag for review) ----
  const flags: string[] = [];
  if (capturedAtRaw == null) flags.push("No capture timestamp");
  else if (capturedAtRaw > now + 60_000) flags.push("Capture time is in the future (device clock?)");
  else if (now - capturedAtRaw > 15 * 60_000) flags.push("Photo captured more than 15 minutes before submission");
  if (source === "gallery") flags.push("Uploaded from gallery (not live camera)");

  const sha256 = createHash("sha256").update(buf).digest("hex");
  const { data: dup } = await db.from("photo_submissions").select("id,team_id").eq("sha256", sha256).limit(1);
  if (dup?.length) {
    flags.push(dup[0].team_id === team.id ? "Identical image already submitted by this team" : "Identical image submitted by another team");
    await db.from("anti_cheat_events").insert({
      event_id: event.id,
      team_id: team.id,
      type: "suspicious_submission",
      counted: false,
      meta: { reason: "duplicate_image", clue: clue.order_index },
    });
  }

  // ---- upload to private storage ----
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const path = `${event.id}/${team.id}/${clue.id}/${randomUUID()}.${ext}`;
  const up = await db.storage.from("submissions").upload(path, buf, { contentType: mime, upsert: false });
  if (up.error) {
    console.error("[upload]", up.error);
    throw new HttpError(500, "Upload failed. Please retry.");
  }

  const status = flags.some((f) => f.startsWith("Identical")) ? "flagged" : "pending";
  const { data: sub, error } = await db
    .from("photo_submissions")
    .insert({
      team_id: team.id,
      clue_id: clue.id,
      storage_path: path,
      sha256,
      mime,
      file_size: buf.length,
      source,
      captured_at: capturedAtRaw ? new Date(capturedAtRaw).toISOString() : null,
      lat,
      lng,
      accuracy,
      location_verified: Boolean(progress.location_verified_at),
      is_late: isLate,
      status,
      flag_reasons: flags,
    })
    .select("id,status,created_at")
    .single();
  if (error || !sub) {
    await db.storage.from("submissions").remove([path]);
    if (error?.code === "23505") throw new HttpError(409, "A photo for this clue is already submitted.");
    throw new HttpError(500, "Could not save submission.");
  }

  if (isActive) await db.from("team_progress").update({ submitted_at: new Date().toISOString() }).eq("id", progress.id);
  if (isLate) {
    await award(db, {
      team_id: team.id,
      clue_id: clue.id,
      kind: "late",
      points: -settings.scoring.late_penalty,
      reason: `Late submission – Clue ${clue.order_index}`,
    });
  }

  await notify(db, {
    event_id: event.id,
    team,
    type: status === "flagged" ? "suspicious_submission" : "photo_submitted",
    severity: status === "flagged" ? "critical" : flags.length ? "warning" : "info",
    clue_number: clue.order_index,
    message:
      status === "flagged"
        ? `🚩 Team ${team.name} – Suspicious photo on Clue ${clue.order_index}: ${flags.join("; ")}`
        : `📸 Team ${team.name} – Photo submitted for Clue ${clue.order_index}${isRetake ? " (retake)" : ""}${isLate ? " (late)" : ""}.`,
  });

  if (isActive && clue.unlock_rule === "on_submission") {
    await completeActiveClue(db, team, event, settings, progress.id, { clueNumber: clue.order_index });
  }

  return json({ ok: true, submission: sub, late: isLate, flagged: status === "flagged" }, 201);
});
