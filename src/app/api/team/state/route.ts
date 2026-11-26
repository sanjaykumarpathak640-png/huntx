import { json, route } from "@/lib/server/http";
import { requireTeam } from "@/lib/server/auth";
import { syncTeamProgress } from "@/lib/server/progress";
import { computeLeaderboard } from "@/lib/server/leaderboard";
import { eventPhase, remainingMs } from "@/lib/event-time";
import { fuzzedZone } from "@/lib/geo";
import type { SubmissionRow, TeamState } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The participant's single source of truth. Returns ONLY:
 *  - the currently unlocked clue (no coordinates, no future clues),
 *  - the hint text only if the team already paid for it,
 *  - an approximate zone (never the exact target) if the organiser enabled reveal_zone.
 */
export const GET = route(async () => {
  const ctx = await requireTeam({ allowDisabled: true });
  const { db, event, settings } = ctx;
  const sync = await syncTeamProgress(db, ctx.team, event, settings);
  const team = sync.team;
  const now = Date.now();

  const [membersRes, subsRes, annRes, board] = await Promise.all([
    db.from("team_members").select("name,is_leader").eq("team_id", team.id).order("is_leader", { ascending: false }),
    db.from("photo_submissions").select("*").eq("team_id", team.id).order("created_at", { ascending: false }).limit(50),
    db.from("announcements").select("id,message,severity,created_at").eq("event_id", event.id).order("created_at", { ascending: false }).limit(5),
    computeLeaderboard(db, event, settings),
  ]);
  const subs = (subsRes.data ?? []) as SubmissionRow[];
  const me = board.find((r) => r.team_id === team.id);

  const progressByClue = new Map(sync.progress.map((p) => [p.clue_id, p]));
  const track = sync.clues.map((c) => {
    const p = progressByClue.get(c.id);
    return {
      number: c.order_index,
      status: (p ? p.status : "locked") as "completed" | "skipped" | "active" | "locked",
    };
  });

  let current: TeamState["current"] = null;
  if (sync.active && team.status !== "disqualified") {
    const clue = sync.clues.find((c) => c.id === sync.active!.clue_id);
    if (clue) {
      const p = sync.active;
      const latest = subs.find((s) => s.clue_id === clue.id) ?? null;
      const verified = Boolean(p.location_verified_at);
      const maxAttempts = clue.max_gps_attempts ?? settings.gps.max_attempts_per_clue;
      let awaiting: NonNullable<TeamState["current"]>["awaiting"] = null;
      const live = latest && ["pending", "approved", "flagged"].includes(latest.status);
      if (!verified && (settings.gps.require_before_photo || !clue.photo_required)) awaiting = "verification";
      else if (clue.photo_required && !live) awaiting = "photo";
      else if (clue.unlock_rule === "on_approval") awaiting = "approval";
      else if (clue.unlock_rule === "manual") awaiting = "organiser";
      let imageUrl: string | null = null;
      if (clue.image_path) {
        const { data: signed } = await db.storage.from("clue-media").createSignedUrl(clue.image_path, 15 * 60);
        imageUrl = signed?.signedUrl ?? null;
      }
      current = {
        clue: {
          id: clue.id,
          number: clue.order_index,
          title: clue.title,
          body: clue.body,
          body_alt: clue.body_alt,
          language: clue.language,
          difficulty: clue.difficulty,
          points: clue.points,
          photo_required: clue.photo_required,
          unlock_rule: clue.unlock_rule,
          has_hint: Boolean(clue.hint),
          hint: p.hint_used ? clue.hint : null,
          hint_penalty: clue.hint_penalty,
          radius_m: clue.radius_m,
          image_url: imageUrl,
        },
        unlocked_at: p.unlocked_at,
        deadline_at: p.deadline_at,
        location_verified: verified,
        gps_attempts: p.gps_attempts,
        gps_max_attempts: maxAttempts,
        zone: verified
          ? { lat: clue.target_lat, lng: clue.target_lng, radius_m: clue.radius_m, exact: true }
          : clue.reveal_zone
            ? { ...fuzzedZone(clue.id, clue.target_lat, clue.target_lng, clue.radius_m), exact: false }
            : null,
        submission: latest
          ? { id: latest.id, status: latest.status, comment: latest.admin_comment, created_at: latest.created_at }
          : null,
        awaiting,
      };
    }
  }

  // Retakes requested on already-completed clues
  const clueById = new Map(sync.clues.map((c) => [c.id, c]));
  const latestPerClue = new Map<string, SubmissionRow>();
  for (const s of subs) if (!latestPerClue.has(s.clue_id)) latestPerClue.set(s.clue_id, s);
  const retakes = [...latestPerClue.values()]
    .filter((s) => s.status === "retake_requested" && s.clue_id !== current?.clue.id && clueById.has(s.clue_id))
    .map((s) => ({
      clue_id: s.clue_id,
      number: clueById.get(s.clue_id)!.order_index,
      title: clueById.get(s.clue_id)!.title,
      comment: s.admin_comment,
    }));

  const state: TeamState = {
    serverNow: now,
    event: {
      id: event.id,
      name: event.name,
      venue: event.venue,
      phase: eventPhase(event, now),
      start_at: event.start_at,
      end_at: event.end_at,
      remaining_ms: remainingMs(event, now),
      rules: event.rules ?? [],
    },
    team: {
      id: team.id,
      name: team.name,
      team_uid: team.team_uid,
      join_code: team.join_code,
      leader_name: team.leader_name,
      status: team.status,
      warning_count: team.warning_count,
      flagged: team.flagged,
      submissions_locked: team.submissions_locked,
      location_sharing: team.location_sharing,
      members: (membersRes.data ?? []).map((m) => m.name),
      started_at: team.started_at,
      finished_at: team.finished_at,
    },
    config: {
      warning_threshold: settings.anticheat.warning_threshold,
      anticheat_enabled: settings.anticheat.enabled,
      fullscreen_mode: settings.anticheat.fullscreen_mode,
      allow_gallery_upload: settings.photo.allow_gallery_upload,
      require_gps_before_photo: settings.gps.require_before_photo,
      periodic_updates: settings.gps.periodic_updates,
      periodic_interval_seconds: settings.gps.periodic_interval_seconds,
      max_accuracy_m: settings.gps.max_accuracy_m,
      max_size_mb: settings.photo.max_size_mb,
    },
    stats: {
      rank: me?.rank ?? null,
      score: me?.score ?? 0,
      total_clues: sync.clues.length,
      completed: sync.progress.filter((p) => p.status === "completed").length,
      teams: board.length,
    },
    track,
    current,
    retakes,
    history: subs.slice(0, 20).map((s) => ({
      clue_number: clueById.get(s.clue_id)?.order_index ?? 0,
      title: clueById.get(s.clue_id)?.title ?? "Clue",
      status: s.status,
      created_at: s.created_at,
      is_late: s.is_late,
    })),
    announcements: annRes.data ?? [],
    finished: sync.finished,
  };
  return json(state);
});
