export type EventStatus = "draft" | "scheduled" | "live" | "paused" | "ended";
export type Phase = "draft" | "upcoming" | "live" | "paused" | "ended";
export type TeamStatus = "active" | "disabled" | "disqualified" | "finished";
export type SubmissionStatus = "pending" | "approved" | "rejected" | "flagged" | "retake_requested";
export type AdminRole = "super_admin" | "organiser" | "reviewer";
export type Severity = "info" | "success" | "warning" | "critical";
export type UnlockRule = "on_submission" | "on_approval" | "on_verification" | "manual";

export interface EventRow {
  id: string;
  name: string;
  description: string | null;
  venue: string;
  rules: string[];
  start_at: string;
  end_at: string;
  status: EventStatus;
  paused_at: string | null;
  total_paused_seconds: number;
  is_current: boolean;
}

export interface TeamRow {
  id: string;
  event_id: string;
  auth_user_id: string | null;
  name: string;
  team_uid: string;
  join_code: string;
  username: string;
  leader_name: string;
  contact_email: string | null;
  status: TeamStatus;
  flagged: boolean;
  submissions_locked: boolean;
  warning_count: number;
  location_sharing: boolean;
  last_lat: number | null;
  last_lng: number | null;
  last_accuracy: number | null;
  last_location_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface ClueRow {
  id: string;
  event_id: string;
  order_index: number;
  title: string;
  body: string;
  body_alt: string | null;
  language: "en" | "hi" | "bilingual";
  difficulty: "easy" | "medium" | "hard" | "insane";
  target_lat: number;
  target_lng: number;
  radius_m: number;
  time_limit_minutes: number | null;
  deadline_at: string | null;
  points: number;
  photo_required: boolean;
  is_active: boolean;
  hint: string | null;
  hint_penalty: number;
  unlock_rule: UnlockRule;
  reveal_zone: boolean;
  max_gps_attempts: number | null;
  image_path?: string | null;
}

export interface ProgressRow {
  id: string;
  team_id: string;
  clue_id: string;
  status: "active" | "completed" | "skipped";
  unlocked_at: string;
  deadline_at: string | null;
  location_verified_at: string | null;
  gps_attempts: number;
  hint_used: boolean;
  submitted_at: string | null;
  completed_at: string | null;
}

export interface SubmissionRow {
  id: string;
  team_id: string;
  clue_id: string;
  storage_path: string;
  status: SubmissionStatus;
  source: "camera" | "gallery";
  captured_at: string | null;
  created_at: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  location_verified: boolean;
  is_late: boolean;
  flag_reasons: string[];
  admin_comment: string | null;
  points_awarded: number | null;
}

/** Shape returned by /api/team/state — the ONLY clue data a participant ever sees. */
export interface TeamState {
  serverNow: number;
  event: {
    id: string;
    name: string;
    venue: string;
    phase: Phase;
    start_at: string;
    end_at: string;
    remaining_ms: number;
    rules: string[];
  };
  team: {
    id: string;
    name: string;
    team_uid: string;
    join_code: string;
    leader_name: string;
    status: TeamStatus;
    warning_count: number;
    flagged: boolean;
    submissions_locked: boolean;
    location_sharing: boolean;
    members: string[];
    started_at: string | null;
    finished_at: string | null;
  };
  config: {
    warning_threshold: number;
    anticheat_enabled: boolean;
    fullscreen_mode: boolean;
    allow_gallery_upload: boolean;
    require_gps_before_photo: boolean;
    periodic_updates: boolean;
    periodic_interval_seconds: number;
    max_accuracy_m: number;
    max_size_mb: number;
  };
  stats: { rank: number | null; score: number; total_clues: number; completed: number; teams: number };
  track: { number: number; status: "completed" | "skipped" | "active" | "locked" }[];
  current: null | {
    clue: {
      id: string;
      number: number;
      title: string;
      body: string;
      body_alt: string | null;
      language: string;
      difficulty: string;
      points: number;
      photo_required: boolean;
      unlock_rule: UnlockRule;
      has_hint: boolean;
      hint: string | null;
      hint_penalty: number;
      radius_m: number;
      image_url: string | null;
    };
    unlocked_at: string;
    deadline_at: string | null;
    location_verified: boolean;
    gps_attempts: number;
    gps_max_attempts: number;
    zone: { lat: number; lng: number; radius_m: number; exact: boolean } | null;
    submission: { id: string; status: SubmissionStatus; comment: string | null; created_at: string } | null;
    awaiting: "verification" | "photo" | "approval" | "organiser" | null;
  };
  retakes: { clue_id: string; number: number; title: string; comment: string | null }[];
  history: { clue_number: number; title: string; status: SubmissionStatus; created_at: string; is_late: boolean }[];
  announcements: { id: string; message: string; severity: string; created_at: string }[];
  finished: boolean;
}

export interface LeaderboardRow {
  rank: number | null;
  team_id: string;
  name: string;
  team_uid: string;
  score: number;
  penalties: number;
  completed: number;
  completion_ms: number | null;
  status: TeamStatus;
  flagged: boolean;
  warning_count: number;
}
