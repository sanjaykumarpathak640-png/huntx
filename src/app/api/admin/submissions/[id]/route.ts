import { z } from "zod";
import { HttpError, json, parseBody, route } from "@/lib/server/http";
import { requireAdminEvent } from "@/lib/server/admin-helpers";
import { completeActiveClue } from "@/lib/server/progress";
import { award } from "@/lib/server/scoring";
import { notify } from "@/lib/server/notify";
import type { ClueRow, TeamRow } from "@/lib/types";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

const schema = z.object({
  status: z.enum(["approved", "rejected", "flagged", "retake_requested", "pending"]),
  comment: z.string().trim().max(500).optional(),
  points: z.number().int().min(-100000).max(100000).optional(), // custom points for approval
});

/** Manual verification. Metadata alone never auto-approves a photo. */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const { db, event, settings, user } = await requireAdminEvent("reviewer");
  const body = await parseBody(req, schema);

  const { data: sub } = await db
    .from("photo_submissions")
    .select("*,teams!inner(*),clues(*)")
    .eq("id", params.id)
    .eq("teams.event_id", event.id)
    .maybeSingle();
  if (!sub) throw new HttpError(404, "Submission not found.");
  const team = sub.teams as TeamRow;
  const clue = sub.clues as ClueRow;

  const points = body.status === "approved" ? body.points ?? clue.points : null;
  const { error } = await db
    .from("photo_submissions")
    .update({
      status: body.status,
      admin_comment: body.comment ?? sub.admin_comment,
      points_awarded: points,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", sub.id);
  if (error) {
    if (error.code === "23505") throw new HttpError(409, "Another live submission exists for this clue.");
    throw new HttpError(500, "Could not update submission.");
  }

  // Keep the photo ledger entry consistent with the review state.
  await db.from("scoring_records").delete().eq("team_id", team.id).eq("clue_id", clue.id).eq("kind", "photo");
  if (body.status === "approved" && points) {
    await award(db, {
      team_id: team.id,
      clue_id: clue.id,
      kind: "photo",
      points,
      reason: `Photo approved – Clue ${clue.order_index}`,
      created_by: user.id,
    });
  }

  // Approval unlocks the next clue when the rule says so.
  if (body.status === "approved" && clue.unlock_rule === "on_approval") {
    const { data: prog } = await db
      .from("team_progress")
      .select("id")
      .eq("team_id", team.id)
      .eq("clue_id", clue.id)
      .eq("status", "active")
      .maybeSingle();
    if (prog) await completeActiveClue(db, team, event, settings, prog.id, { clueNumber: clue.order_index });
  }

  const icon = { approved: "✅", rejected: "❌", flagged: "🚩", retake_requested: "🔁", pending: "⏳" }[body.status];
  await notify(db, {
    event_id: event.id,
    team,
    type: `submission_${body.status}`,
    severity: body.status === "approved" ? "success" : body.status === "flagged" ? "warning" : "info",
    clue_number: clue.order_index,
    message: `${icon} Team ${team.name} – Clue ${clue.order_index} photo ${body.status.replace("_", " ")}${points ? ` (+${points})` : ""}.`,
  });
  return json({ ok: true });
});
