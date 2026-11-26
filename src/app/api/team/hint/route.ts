import { HttpError, json, route } from "@/lib/server/http";
import { requireTeam } from "@/lib/server/auth";
import { syncTeamProgress } from "@/lib/server/progress";
import { eventPhase } from "@/lib/event-time";
import { award } from "@/lib/server/scoring";
import { notify } from "@/lib/server/notify";

export const dynamic = "force-dynamic";

export const POST = route(async () => {
  const { db, team, event, settings } = await requireTeam();
  if (eventPhase(event) !== "live") throw new HttpError(409, "The hunt is not live.");
  if (team.status !== "active") throw new HttpError(403, "Not allowed.");
  const sync = await syncTeamProgress(db, team, event, settings);
  const p = sync.active;
  if (!p) throw new HttpError(409, "No active clue.");
  const clue = sync.clues.find((c) => c.id === p.clue_id);
  if (!clue?.hint) throw new HttpError(404, "No hint for this clue.");
  if (p.hint_used) return json({ hint: clue.hint, penalty: 0 });

  const { data } = await db
    .from("team_progress")
    .update({ hint_used: true, hint_used_at: new Date().toISOString() })
    .eq("id", p.id)
    .eq("hint_used", false)
    .select("id");
  if (data?.length) {
    await award(db, {
      team_id: team.id,
      clue_id: clue.id,
      kind: "hint",
      points: -clue.hint_penalty,
      reason: `Hint used – Clue ${clue.order_index}`,
    });
    await notify(db, {
      event_id: event.id,
      team,
      type: "hint_used",
      severity: "info",
      clue_number: clue.order_index,
      message: `💡 Team ${team.name} – Used the hint for Clue ${clue.order_index} (−${clue.hint_penalty}).`,
    });
  }
  return json({ hint: clue.hint, penalty: clue.hint_penalty });
});
