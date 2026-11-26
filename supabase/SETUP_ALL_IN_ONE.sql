-- HuntX ONE-SHOT SETUP: paste this whole file into Supabase → SQL Editor → Run

-- =====================================================================
-- HuntX – Smart Campus Treasure Hunt :: database schema
-- Run in Supabase SQL editor (or `supabase db push`).
--
-- Security model
--   * Browser clients use the anon key + the user's JWT. RLS decides reads.
--   * ALL writes (GPS verification, submissions, scoring, admin actions)
--     go through Next.js API routes that validate the request server-side
--     and then use the service-role key. No insert/update/delete policies
--     exist for browser clients, so a participant cannot write directly.
--   * `clues` has NO participant read policy. Clue text, coordinates and
--     hints reach participants only through /api/team/state, which returns
--     the currently unlocked clue with coordinates stripped.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- enums ----------
do $$ begin
  create type public.app_role as enum ('participant', 'admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.admin_role as enum ('super_admin', 'organiser', 'reviewer');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.event_status as enum ('draft', 'scheduled', 'live', 'paused', 'ended');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.team_status as enum ('active', 'disabled', 'disqualified', 'finished');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.progress_status as enum ('active', 'completed', 'skipped');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.submission_status as enum ('pending', 'approved', 'rejected', 'flagged', 'retake_requested');
exception when duplicate_object then null; end $$;

-- ---------- generic updated_at trigger ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- events ----------
create table if not exists public.events (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (char_length(name) between 2 and 120),
  description           text default '',
  venue                 text not null default 'IIT Patna, Bihta Campus',
  rules                 text[] not null default '{}',
  start_at              timestamptz not null,
  end_at                timestamptz not null,
  status                public.event_status not null default 'scheduled',
  paused_at             timestamptz,
  total_paused_seconds  integer not null default 0,
  is_current            boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint events_time_order check (end_at > start_at)
);
create unique index if not exists events_one_current on public.events (is_current) where is_current;
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

-- ---------- event_settings (configurable scoring / anti-cheat / GPS engine) ----------
create table if not exists public.event_settings (
  event_id    uuid primary key references public.events(id) on delete cascade,
  settings    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
create trigger event_settings_touch before update on public.event_settings
  for each row execute function public.touch_updated_at();

-- ---------- admins ----------
create table if not exists public.admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        public.admin_role not null default 'organiser',
  display_name text,
  created_at  timestamptz not null default now()
);

-- ---------- teams ----------
create table if not exists public.teams (
  id                   uuid primary key default gen_random_uuid(),
  event_id             uuid not null references public.events(id) on delete cascade,
  auth_user_id         uuid unique references auth.users(id) on delete set null,
  name                 text not null check (char_length(name) between 2 and 48),
  team_uid             text not null unique,             -- e.g. HX-4821 (shown to team)
  join_code            text not null unique,             -- e.g. K7PQ2M (for QR/code login)
  username             text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  leader_name          text not null,
  contact_email        text,
  status               public.team_status not null default 'active',
  flagged              boolean not null default false,
  submissions_locked   boolean not null default false,
  warning_count        integer not null default 0,
  location_sharing     boolean not null default false,  -- participant consent for periodic updates
  last_lat             double precision,
  last_lng             double precision,
  last_accuracy        double precision,
  last_location_at     timestamptz,
  started_at           timestamptz,
  finished_at          timestamptz,
  created_by_admin     boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index if not exists teams_event_name_ci on public.teams (event_id, lower(name));
create index if not exists teams_event_idx on public.teams (event_id);
create trigger teams_touch before update on public.teams
  for each row execute function public.touch_updated_at();

-- ---------- profiles (mirror of auth.users with app role) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        public.app_role not null default 'participant',
  team_id     uuid references public.teams(id) on delete set null,
  created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- team_members ----------
create table if not exists public.team_members (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  email       text,
  is_leader   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists team_members_team_idx on public.team_members (team_id);

-- ---------- clues (CONFIDENTIAL — admin read only) ----------
create table if not exists public.clues (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references public.events(id) on delete cascade,
  order_index         integer not null check (order_index >= 1),
  title               text not null,
  body                text not null,                    -- cryptic clue (primary language)
  body_alt            text,                             -- optional second-language version
  language            text not null default 'en' check (language in ('en', 'hi', 'bilingual')),
  difficulty          text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard', 'insane')),
  target_lat          double precision not null check (target_lat between -90 and 90),
  target_lng          double precision not null check (target_lng between -180 and 180),
  radius_m            integer not null default 30 check (radius_m between 5 and 2000),
  time_limit_minutes  integer check (time_limit_minutes is null or time_limit_minutes > 0),
  deadline_at         timestamptz,                      -- optional absolute deadline
  points              integer not null default 100,
  photo_required      boolean not null default true,
  is_active           boolean not null default true,
  hint                text,
  hint_penalty        integer not null default 20 check (hint_penalty >= 0),
  unlock_rule         text not null default 'on_submission'
                      check (unlock_rule in ('on_submission', 'on_approval', 'on_verification', 'manual')),
  reveal_zone         boolean not null default false,   -- show approximate zone on participant map
  max_gps_attempts    integer check (max_gps_attempts is null or max_gps_attempts >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint clues_order_unique unique (event_id, order_index) deferrable initially deferred
);
create index if not exists clues_event_idx on public.clues (event_id, order_index);
create trigger clues_touch before update on public.clues
  for each row execute function public.touch_updated_at();

-- ---------- team_progress ----------
create table if not exists public.team_progress (
  id                    uuid primary key default gen_random_uuid(),
  team_id               uuid not null references public.teams(id) on delete cascade,
  clue_id               uuid not null references public.clues(id) on delete cascade,
  status                public.progress_status not null default 'active',
  unlocked_at           timestamptz not null default now(),
  deadline_at           timestamptz,
  location_verified_at  timestamptz,
  gps_attempts          integer not null default 0,
  hint_used             boolean not null default false,
  hint_used_at          timestamptz,
  submitted_at          timestamptz,
  completed_at          timestamptz,
  unlocked_by_admin     boolean not null default false,
  unique (team_id, clue_id)
);
-- At most one active clue per team (prevents race conditions on unlock)
create unique index if not exists team_progress_one_active on public.team_progress (team_id) where status = 'active';
create index if not exists team_progress_team_idx on public.team_progress (team_id);

-- ---------- location_verifications ----------
create table if not exists public.location_verifications (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null references public.teams(id) on delete cascade,
  clue_id            uuid references public.clues(id) on delete set null,
  lat                double precision,
  lng                double precision,
  accuracy           double precision,
  distance_m         double precision,
  within_radius      boolean not null default false,
  verified           boolean not null default false,
  suspicious         boolean not null default false,
  suspicion_reasons  text[] not null default '{}',
  client_timestamp   timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists locver_team_idx on public.location_verifications (team_id, created_at desc);

-- ---------- location_pings (optional periodic updates, consent-based) ----------
create table if not exists public.location_pings (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  accuracy    double precision,
  created_at  timestamptz not null default now()
);
create index if not exists pings_team_idx on public.location_pings (team_id, created_at desc);

-- ---------- photo_submissions ----------
create table if not exists public.photo_submissions (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null references public.teams(id) on delete cascade,
  clue_id            uuid not null references public.clues(id) on delete cascade,
  storage_path       text not null,
  sha256             text not null,
  mime               text not null,
  file_size          integer not null,
  source             text not null default 'camera' check (source in ('camera', 'gallery')),
  captured_at        timestamptz,                -- client-reported capture time (informational)
  created_at         timestamptz not null default now(),   -- server submission time (authoritative)
  lat                double precision,
  lng                double precision,
  accuracy           double precision,
  location_verified  boolean not null default false,
  is_late            boolean not null default false,
  status             public.submission_status not null default 'pending',
  flag_reasons       text[] not null default '{}',
  admin_comment      text,
  points_awarded     integer,
  reviewed_by        uuid references auth.users(id),
  reviewed_at        timestamptz
);
-- duplicate protection: only one live submission per team+clue
create unique index if not exists submissions_one_live
  on public.photo_submissions (team_id, clue_id) where status in ('pending', 'approved', 'flagged');
create index if not exists submissions_status_idx on public.photo_submissions (status, created_at desc);
create index if not exists submissions_hash_idx on public.photo_submissions (sha256);

-- ---------- anti_cheat_events ----------
create table if not exists public.anti_cheat_events (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade,
  type        text not null check (type in (
                'tab_hidden', 'tab_visible', 'window_blur', 'window_focus',
                'fullscreen_exit', 'fullscreen_enter', 'page_unload', 'page_reload', 'suspicious_submission')),
  counted     boolean not null default false,  -- did it increase the warning count?
  ignored     boolean not null default false,  -- ignored per admin config
  client_at   timestamptz,
  user_agent  text,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()   -- server timestamp (authoritative)
);
create index if not exists ace_team_idx on public.anti_cheat_events (team_id, created_at desc);

-- ---------- notifications (admin alerts) ----------
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  team_id      uuid references public.teams(id) on delete cascade,
  team_name    text,
  type         text not null,
  severity     text not null default 'info' check (severity in ('info', 'success', 'warning', 'critical')),
  clue_number  integer,
  message      text not null,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists notif_event_idx on public.notifications (event_id, created_at desc);

-- ---------- scoring_records (ledger: score = sum(points)) ----------
create table if not exists public.scoring_records (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  clue_id     uuid references public.clues(id) on delete set null,
  kind        text not null check (kind in (
                'photo', 'location', 'hint', 'late', 'tab_switch', 'bonus', 'deduction', 'completion', 'adjustment')),
  points      integer not null,
  reason      text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
-- automatic awards can only happen once per team/clue/kind
create unique index if not exists scoring_once
  on public.scoring_records (team_id, clue_id, kind)
  where kind in ('photo', 'location', 'hint', 'late') and clue_id is not null;
create unique index if not exists scoring_completion_once
  on public.scoring_records (team_id) where kind = 'completion';
create index if not exists scoring_team_idx on public.scoring_records (team_id);

-- ---------- announcements (broadcast to participants) ----------
create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  message     text not null check (char_length(message) between 1 and 500),
  severity    text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists ann_event_idx on public.announcements (event_id, created_at desc);

-- =====================================================================
-- Helper functions for RLS
-- =====================================================================
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.my_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.teams where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.my_event_id() returns uuid
language sql stable security definer set search_path = public as $$
  select event_id from public.teams where auth_user_id = auth.uid() limit 1;
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.events                 enable row level security;
alter table public.event_settings         enable row level security;
alter table public.admins                 enable row level security;
alter table public.teams                  enable row level security;
alter table public.profiles               enable row level security;
alter table public.team_members           enable row level security;
alter table public.clues                  enable row level security;
alter table public.team_progress          enable row level security;
alter table public.location_verifications enable row level security;
alter table public.location_pings         enable row level security;
alter table public.photo_submissions      enable row level security;
alter table public.anti_cheat_events      enable row level security;
alter table public.notifications          enable row level security;
alter table public.scoring_records        enable row level security;
alter table public.announcements          enable row level security;

-- events: any signed-in user can read event meta (no secrets here)
create policy events_read on public.events for select to authenticated using (true);

-- event_settings: admins only
create policy settings_admin on public.event_settings for select to authenticated using (public.is_admin());

-- admins: see self; admins see all
create policy admins_read on public.admins for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- profiles: self or admin
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- teams: own team or admin
create policy teams_read on public.teams for select to authenticated
  using (auth_user_id = auth.uid() or public.is_admin());

create policy members_read on public.team_members for select to authenticated
  using (team_id = public.my_team_id() or public.is_admin());

-- clues: ADMIN ONLY. Participants never read this table directly.
create policy clues_admin on public.clues for select to authenticated using (public.is_admin());

create policy progress_read on public.team_progress for select to authenticated
  using (team_id = public.my_team_id() or public.is_admin());

create policy locver_read on public.location_verifications for select to authenticated
  using (team_id = public.my_team_id() or public.is_admin());

create policy pings_read on public.location_pings for select to authenticated
  using (team_id = public.my_team_id() or public.is_admin());

create policy submissions_read on public.photo_submissions for select to authenticated
  using (team_id = public.my_team_id() or public.is_admin());

create policy ace_admin on public.anti_cheat_events for select to authenticated using (public.is_admin());

create policy notif_admin on public.notifications for select to authenticated using (public.is_admin());

create policy scoring_read on public.scoring_records for select to authenticated
  using (team_id = public.my_team_id() or public.is_admin());

create policy ann_read on public.announcements for select to authenticated
  using (event_id = public.my_event_id() or public.is_admin());

-- No INSERT / UPDATE / DELETE policies: browser clients cannot write.
-- Server routes use the service-role key after validating each request.

-- =====================================================================
-- Realtime
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['notifications','announcements','teams','team_progress',
                           'photo_submissions','scoring_records','location_verifications']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- =====================================================================
-- Storage: PRIVATE bucket for photos (access only via signed URLs from the server)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;
-- No storage.objects policies for this bucket => anon/authenticated cannot read or write.

-- =====================================================================
-- Server-only RPCs (atomic operations). Revoked from browser roles.
-- =====================================================================
create or replace function public.increment_team_warning(p_team uuid)
returns integer language sql security definer set search_path = public as $$
  update public.teams set warning_count = warning_count + 1 where id = p_team returning warning_count;
$$;

create or replace function public.reorder_clues(p_event uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare i integer;
begin
  -- constraint is deferrable, so all moves happen inside one transaction
  set constraints clues_order_unique deferred;
  for i in 1 .. array_length(p_ids, 1) loop
    update public.clues set order_index = i where id = p_ids[i] and event_id = p_event;
  end loop;
end $$;

revoke all on function public.increment_team_warning(uuid) from public, anon, authenticated;
revoke all on function public.reorder_clues(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.increment_team_warning(uuid) to service_role;
grant execute on function public.reorder_clues(uuid, uuid[]) to service_role;

-- =====================================================================
-- API role grants (newer Supabase projects don't auto-expose new tables).
-- RLS above still decides which rows each user can see.
-- =====================================================================
grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant select on all tables in schema public to authenticated;
grant execute on function public.is_admin(), public.my_team_id(), public.my_event_id() to authenticated;

-- HuntX 0002: optional image per clue/challenge (private bucket, served via signed URLs)
alter table public.clues add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clue-media', 'clue-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;

-- ===== demo event + 4 sample clues =====
-- Optional demo data. Coordinates are APPROXIMATE points on/near the IIT Patna
-- Bihta campus — walk the campus and replace them with surveyed coordinates
-- (Admin → Clues → "Use my location") before the real event.

with ev as (
  insert into public.events (name, description, start_at, end_at, status, is_current, rules)
  values (
    'HuntX 2026 – Shutter Quest',
    'A photography treasure hunt across the IIT Patna campus. Decode, locate, verify, capture.',
    now() + interval '1 day',
    now() + interval '1 day 3 hours',
    'scheduled',
    true,
    array[
      'Each team gets one 6-letter team code. Share it only with your teammates.',
      'Photos must be captured live through the HuntX camera.',
      'Verify your GPS location at each spot before capturing (if required).',
      'Leaving the hunt screen is recorded and may cost points.',
      'Stay on campus roads and paths. Do not enter restricted buildings or labs.',
      'Organisers have the final say on all photo approvals.'
    ]
  ) returning id
)
insert into public.event_settings (event_id, settings) select id, '{}'::jsonb from ev;

insert into public.clues (event_id, order_index, title, body, body_alt, language, difficulty,
                          target_lat, target_lng, radius_m, time_limit_minutes, points, hint, hint_penalty, unlock_rule)
select e.id, c.*
from public.events e,
(values
  (1, 'The Gate of Beginnings', 'Every journey here starts where the name is written large and the guards keep watch.', 'जहाँ नाम बड़े अक्षरों में लिखा है और पहरेदार पहरा देते हैं, वहीं से हर सफ़र शुरू होता है।', 'bilingual', 'easy', 25.5304, 84.8497, 40, 25, 100, 'Think of the first thing you see when you arrive.', 20, 'on_submission'),
  (2, 'Silent Shelves', 'A thousand voices sleep here, yet none of them may speak above a whisper.', null, 'en', 'medium', 25.5357, 84.8512, 35, 25, 120, 'Books, not people.', 25, 'on_submission'),
  (3, 'Fuel for Thought', 'Where minds refuel between lectures and chai is the real currency.', null, 'en', 'medium', 25.5371, 84.8530, 35, 25, 120, 'Follow the smell of samosas.', 25, 'on_submission'),
  (4, 'Arena of Echoes', 'Cheers rise where sweat falls; find the ground that keeps the score.', null, 'en', 'hard', 25.5389, 84.8478, 50, 30, 150, 'Shoes, whistles and floodlights.', 30, 'on_approval')
) as c(order_index, title, body, body_alt, language, difficulty, target_lat, target_lng, radius_m, time_limit_minutes, points, hint, hint_penalty, unlock_rule)
where e.is_current;
