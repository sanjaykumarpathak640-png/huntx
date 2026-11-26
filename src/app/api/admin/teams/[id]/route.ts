import { z } from "zod";
import { HttpError, json, parseBody, route } from "@/lib/server/http";
import { requireAdminEvent } from "@/lib/server/admin-helpers";
import { completeActiveClue, syncTeamProgress } from "@/lib/server/progress";
import { award } from "@/lib/server/scoring";
import { notify } from "@/lib/server/notify";
import { uniqueTeamCodes } from "@/lib/server/codes";
import type { TeamRow } from "@/lib/types";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

async function loadTeam(db: Awaited<ReturnType<typeof requireAdminEvent>>["db"], id: string, eventId: string) {
  const { data } = await db.from("teams").select("*").eq("id", id).eq("event_id", eventId).maybeSingle();
  if (!data) throw new HttpError(404, "Team not found.");
  return data as TeamRow;
}

/** Full team detail: members, progress, verifications, anti-cheat log, score ledger. */
export const GET = route<Ctx>(async (_req, { params }) => {
  const { db, event } = await requireAdminEvent();
  const team = await loadTeam(db, params.id, event.id);
  const [members, progress, verifications, ace, ledger, subs] = await Promise.all([
    db.from("team_members").select("*").eq("team_id", team.id),
    db.from("team_progress").select("*,clues(order_index,title)").eq("team_id", team.id).order("unlocked_at"),
    db.from("location_verifications").select("*").eq("team_id", team.id).order("created_at", { ascending: false }).limit(50),
    db.from("anti_cheat_events").select("*").eq("team_id", team.id).order("created_at", { ascending: false }).limit(100),
    db.from("scoring_records").select("*").eq("team_id", team.id).order("created_at", { ascending: false }),
    db.from("photo_submissions").select("id,clue_id,status,created_at,is_late").eq("team_id", team.id).order("created_at", { ascending: false }),
  ]);
  return json({
    team,
    members: members.data ?? [],
    progress: progress.data ?? [],
    verifications: verifications.data ?? [],
    anticheat: ace.data ?? [],
    ledger: ledger.data ?? [],
    submissions: subs.data ?? [],
  });
});

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("disable") }),
  z.object({ action: z.literal("enable") }),
  z.object({ action: z.literal("disqualify"), reason: z.string().max(300).optional() }),
  z.object({ action: z.literal("reinstate") }),
  z.object({ action: z.literal("reset_progress") }),
  z.object({ action: z.literal("reset_warnings") }),
  z.object({ action: z.literal("unlock_next") }),
  z.object({ action: z.literal("lock_submissions") }),
  z.object({ action: z.literal("unlock_submissions") }),
  z.object({ action: z.literal("unflag") }),
  z.object({ action: z.literal("reset_gps_attempts") }),
  z.object({ action: z.literal("new_code") }),
  z.object({
    action: z.literal("adjust_points"),
    points: z.number().int().min(-100000).max(100000).refine((n) => n !== 0, "Cannot be zero"),
    reason: z.string().trim().min(1).max(200),
  }),
  z.object({ action: z.literal("rename"), name: z.string().trim().min(2).max(48) }),
]);

export const PATCH = route<Ctx>(async (req, { params }) => {
  const ctx = await requireAdminEvent("organiser");
  const { db, event, settings, user } = ctx;
  const body = await parseBody(req, schema);
  const team = await loadTeam(db, params.id, event.id);
  const set = (patch: Partial<TeamRow>) => db.from("teams").update(patch).eq("id", team.id);
  let extra: Record<string, unknown> = {};

  switch (body.action) {
    case "disable":
      await set({ status: "disabled" });
      break;
    case "enable":
      await set({ status: team.finished_at ? "finished" : "active" });
      break;
    case "disqualify":
      await set({ status: "disqualified" });
      await notify(db, {
        event_id: event.id,
        team,
        type: "disqualified",
        severity: "critical",
        message: `⛔ Team ${team.name} – Disqualified by organiser${body.reason ? `: ${body.reason}` : ""}.`,
      });
      break;
    case "reinstate":
      await set({ status: team.finished_at ? "finished" : "active" });
      break;
    case "reset_progress":
      await db.from("team_progress").delete().eq("team_id", team.id);
      await db
        .from("scoring_records")
        .delete()
        .eq("team_id", team.id)
        .in("kind", ["photo", "location", "hint", "late", "completion", "tab_switch"]);
      await db
        .from("photo_submissions")
        .update({ status: "rejected", admin_comment: "Progress reset by organiser" })
        .eq("team_id", team.id)
        .in("status", ["pending", "approved", "flagged", "retake_requested"]);
      await set({ status: "active", started_at: null, finished_at: null, warning_count: 0, flagged: false, submissions_locked: false });
      break;
    case "reset_warnings":
      await set({ warning_count: 0, flagged: false });
      break;
    case "reset_gps_attempts":
      await db.from("team_progress").update({ gps_attempts: 0 }).eq("team_id", team.id).eq("status", "active");
      break;
    case "unlock_next": {
      const sync = await syncTeamProgress(db, team, event, settings);
      if (!sync.active) throw new HttpError(409, "Team has no active clue (is the event live?).");
      const clue = sync.clues.find((c) => c.id === sync.active!.clue_id);
      await completeActiveClue(db, team, event, settings, sync.active.id, { byAdmin: true, clueNumber: clue?.order_index });
      break;
    }
    case "lock_submissions":
      await set({ submissions_locked: true });
      break;
    case "unlock_submissions":
      await set({ submissions_locked: false });
      break;
    case "unflag":
      await set({ flagged: false });
      break;
    case "rename":
      await set({ name: body.name });
      break;
    case "new_code": {
      // Old code stops working immediately; already-open sessions are signed out.
      const { join_code } = await uniqueTeamCodes(db);
      await set({ join_code } as Partial<TeamRow>);
      if (team.auth_user_id) await db.auth.admin.signOut(team.auth_user_id, "global").catch(() => {});
      extra = { credentials: { join_code, name: team.name } };
      break;
    }
    case "adjust_points":
      await award(db, {
        team_id: team.id,
        kind: body.points > 0 ? "bonus" : "deduction",
        points: body.points,
        reason: body.reason,
        created_by: user.id,
      });
      await notify(db, {
        event_id: event.id,
        team,
        type: "points_adjusted",
        severity: "info",
        message: `${body.points > 0 ? "➕" : "➖"} Team ${team.name} – ${body.points > 0 ? "+" : ""}${body.points} pts (${body.reason}).`,
      });
      break;
  }
  return json({ ok: true, ...extra });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { db, event } = await requireAdminEvent("super_admin");
  const team = await loadTeam(db, params.id, event.id);
  const { data: subs } = await db.from("photo_submissions").select("storage_path").eq("team_id", team.id);
  if (subs?.length) await db.storage.from("submissions").remove(subs.map((s) => s.storage_path));
  await db.from("teams").delete().eq("id", team.id);
  if (team.auth_user_id) await db.auth.admin.deleteUser(team.auth_user_id);
  return json({ ok: true });
});
