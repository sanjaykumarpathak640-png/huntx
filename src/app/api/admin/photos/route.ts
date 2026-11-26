import JSZip from "jszip";
import { HttpError, route } from "@/lib/server/http";
import { requireAdminEvent } from "@/lib/server/admin-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Downloads submission photos as a ZIP (default: approved only). */
export const GET = route(async (req) => {
  const { db, event } = await requireAdminEvent("organiser");
  const status = new URL(req.url).searchParams.get("status") ?? "approved";
  let q = db
    .from("photo_submissions")
    .select("id,storage_path,status,created_at,teams!inner(name,team_uid,event_id),clues(order_index)")
    .eq("teams.event_id", event.id)
    .order("created_at")
    .limit(400);
  if (status !== "all") q = q.eq("status", status);
  const { data } = await q;
  if (!data?.length) throw new HttpError(404, "No photos to download.");

  const zip = new JSZip();
  const safe = (s: string) => s.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 40);
  for (const s of data as unknown as {
    id: string;
    storage_path: string;
    status: string;
    teams: { name: string; team_uid: string };
    clues: { order_index: number } | null;
  }[]) {
    const { data: blob } = await db.storage.from("submissions").download(s.storage_path);
    if (!blob) continue;
    const ext = s.storage_path.split(".").pop();
    zip.file(
      `${safe(s.teams.team_uid)}_${safe(s.teams.name)}/clue-${s.clues?.order_index ?? 0}_${s.status}_${s.id.slice(0, 8)}.${ext}`,
      await blob.arrayBuffer(),
    );
  }
  const buf = await zip.generateAsync({ type: "uint8array" });
  return new Response(buf, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="huntx-photos-${status}.zip"`,
      "cache-control": "no-store",
    },
  });
});
