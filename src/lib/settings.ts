import { z } from "zod";

/**
 * The configurable rules engine. Everything that affects scoring, GPS,
 * anti-cheat and photo rules lives here and is stored per event in
 * event_settings.settings (jsonb). Defaults fill any missing key.
 */
export const DEFAULT_SETTINGS = {
  registration_open: true,
  public_leaderboard: true,
  ranking: "score_then_time" as "score_then_time" | "clues_then_time" | "score_only",
  scoring: {
    location_verified: 50,
    late_penalty: 25,
    tab_switch_penalty: 10,
    free_warnings: 2, // first N counted warnings carry no penalty
    completion_bonus: 200,
  },
  gps: {
    require_before_photo: true,
    max_accuracy_m: 50, // reports less accurate than this are not accepted
    min_retry_seconds: 15,
    max_attempts_per_clue: 0, // 0 = unlimited (clue can override)
    suspicious_accuracy_below_m: 1, // perfectly precise readings are typical of mock-location apps
    max_speed_mps: 12, // faster movement between reports is flagged for review
    share_last_location: true, // show last verified location on admin map
    periodic_updates: false, // optional, participant-consented location pings
    periodic_interval_seconds: 120,
    retention_hours: 72,
  },
  anticheat: {
    enabled: true,
    warning_threshold: 3, // shown as "Warning n/threshold"; above it alerts escalate to critical
    flag_threshold: 5, // team gets flagged for admin review
    auto_lock_submissions: false,
    lock_threshold: 8,
    fullscreen_mode: false,
    ignored_events: [] as string[],
  },
  photo: {
    allow_gallery_upload: false,
    allow_late_submissions: true,
    max_size_mb: 8,
  },
  sound_alerts: true,
};

export type EventSettings = typeof DEFAULT_SETTINGS;

const num = (min: number, max: number) => z.number().finite().min(min).max(max);

export const settingsPatchSchema = z
  .object({
    registration_open: z.boolean(),
    public_leaderboard: z.boolean(),
    ranking: z.enum(["score_then_time", "clues_then_time", "score_only"]),
    scoring: z
      .object({
        location_verified: num(0, 10000),
        late_penalty: num(0, 10000),
        tab_switch_penalty: num(0, 10000),
        free_warnings: num(0, 100),
        completion_bonus: num(0, 100000),
      })
      .partial(),
    gps: z
      .object({
        require_before_photo: z.boolean(),
        max_accuracy_m: num(5, 1000),
        min_retry_seconds: num(0, 3600),
        max_attempts_per_clue: num(0, 1000),
        suspicious_accuracy_below_m: num(0, 50),
        max_speed_mps: num(1, 500),
        share_last_location: z.boolean(),
        periodic_updates: z.boolean(),
        periodic_interval_seconds: num(30, 3600),
        retention_hours: num(1, 24 * 365),
      })
      .partial(),
    anticheat: z
      .object({
        enabled: z.boolean(),
        warning_threshold: num(1, 100),
        flag_threshold: num(1, 1000),
        auto_lock_submissions: z.boolean(),
        lock_threshold: num(1, 1000),
        fullscreen_mode: z.boolean(),
        ignored_events: z.array(
          z.enum(["tab_hidden", "window_blur", "fullscreen_exit", "page_unload"]),
        ),
      })
      .partial(),
    photo: z
      .object({
        allow_gallery_upload: z.boolean(),
        allow_late_submissions: z.boolean(),
        max_size_mb: num(1, 10),
      })
      .partial(),
    sound_alerts: z.boolean(),
  })
  .partial();

type Obj = Record<string, unknown>;
function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObj(base) || !isObj(patch)) return (patch === undefined ? base : (patch as T));
  const out: Obj = { ...(base as Obj) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isObj(out[k]) && isObj(v) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

export function resolveSettings(stored: unknown): EventSettings {
  return deepMerge(DEFAULT_SETTINGS, isObj(stored) ? stored : {});
}
