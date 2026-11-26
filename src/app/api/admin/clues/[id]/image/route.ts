import { randomUUID } from "crypto";
import { HttpError, json, route } from "@/lib/server/http";
import { requireAdminEvent } from "@/lib/server/admin-helpers";
import { sniffImage } from "@/lib/server/images";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

const MAX = 5 * 1024 * 1024;

/** Upload / replace the challenge image (stored privately, shown only when the clue is unlocked). */
export const POST = route<Ctx>(async (req, { params }) => {
  const { db, event } = await requireAdminEvent("organiser");
  const { data: clue } = await db.from("clues").select("id,image_path").eq("id", params.id).eq("event_id", event.id).maybeSingle();
  if (!clue) throw new HttpError(404, "Clue not found.");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Expected an image upload.");
  }
  const file = form.get("image");
  if (!(file instanceof Blob) || file.size === 0) throw new HttpError(400, "Choose an image.");
  if (file.size > MAX) throw new HttpError(413, "Image must be under 5 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(buf);
  if (!kind) throw new HttpError(415, "Use a JPG, PNG or WEBP image.");

  const path = `${event.id}/${clue.id}/${randomUUID()}.${kind.ext}`;
  const up = await db.storage.from("clue-media").upload(path, buf, { contentType: kind.mime, upsert: false });
  if (up.error) {
    console.error("[clue-image]", up.error);
    throw new HttpError(500, "Upload failed. Did you run migration 0002?");
  }
  await db.from("clues").update({ image_path: path }).eq("id", clue.id);
  if (clue.image_path) await db.storage.from("clue-media").remove([clue.image_path]);
  const { data: signed } = await db.storage.from("clue-media").createSignedUrl(path, 3600);
  return json({ ok: true, image_url: signed?.signedUrl ?? null });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { db, event } = await requireAdminEvent("organiser");
  const { data: clue } = await db.from("clues").select("id,image_path").eq("id", params.id).eq("event_id", event.id).maybeSingle();
  if (!clue) throw new HttpError(404, "Clue not found.");
  if (clue.image_path) await db.storage.from("clue-media").remove([clue.image_path]);
  await db.from("clues").update({ image_path: null }).eq("id", clue.id);
  return json({ ok: true });
});
