# HuntX – Smart Campus Treasure Hunt

A real-time photography treasure-hunt platform for **IIT Patna**. Teams decode cryptic clues, reach the spot, verify their GPS position against a server-side geofence, capture the photo through the in-browser camera and unlock the next clue. Organisers run everything live from an admin dashboard.

**Stack:** Next.js 14 (App Router) + TypeScript · Tailwind CSS · Supabase (Postgres, Auth, Realtime, Storage) · Leaflet + OpenStreetMap · Lucide · Vercel

---

## ⚡ Quick start (10 minutes)

1. **Supabase:** create a free project at supabase.com, open SQL Editor, paste `supabase/SETUP_ALL_IN_ONE.sql` and click Run.
2. **Vercel:** use the button below (or import the GitHub repo) and fill in the env values from Supabase → Project Settings → API.

   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsanjaykumarpathak640-png%2Fhuntx&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,NEXT_PUBLIC_SITE_URL,TEAM_EMAIL_DOMAIN&envDescription=Supabase%20keys%20from%20Project%20Settings%20%E2%86%92%20API&project-name=huntx)
3. **First admin:** run `npm install && npm run create-admin -- you@iitp.ac.in 'StrongPass123'`, with the same env values in `.env.local`.
4. Open `https://<your-app>.vercel.app/admin/login` and you're live.

---

## 1. Architecture

```
Browser (participant / admin)
  │  anon key + user JWT (cookie)          ┌───────────── Supabase ─────────────┐
  ├── Realtime subscriptions ─────────────▶│ Realtime (RLS-filtered)            │
  │                                        │                                    │
  └── fetch /api/* ──▶ Next.js API routes ─┤ Postgres + RLS   Storage (private) │
                       • verify session    │ Auth                               │
                       • validate (zod)    └────────────────────────────────────┘
                       • enforce rules
                       • service-role key (server only)
```

**Security model**

| Concern | How it's handled |
|---|---|
| Future clues / coordinates / answers | `clues` table has **no participant read policy**. Participants receive only the current clue from `/api/team/state`, with coordinates stripped. The exact target is shown only *after* successful verification. The optional "reveal zone" is a wider circle offset from the target. |
| Writes | Browser roles have **no insert/update/delete policies**. Every write goes through an API route that validates the session, the role and the input before using the service-role key. |
| Time | `/api/time` is the clock. The client syncs with RTT compensation and counts with `performance.now()` (monotonic), so changing the device clock does nothing. Deadlines are re-checked on the server. |
| GPS | Haversine distance computed **server-side**. Retry cooldown and attempt limits are enforced from DB rows (they hold across serverless instances). Suspicious patterns are flagged for review. |
| Photos | Private `submissions` bucket with no storage policies. Admins view photos via 1-hour signed URLs. Magic-byte checks, size limits, SHA-256 duplicate detection, and a unique index allow one live submission per clue. |
| Admin | Middleware + server layout gate + per-route `requireAdmin(role)` with three roles: `reviewer` < `organiser` < `super_admin`. |
| Secrets | `SUPABASE_SERVICE_ROLE_KEY` has no `NEXT_PUBLIC_` prefix and is imported only in `server-only` modules. |

### Honest limitations
- **GPS can be spoofed** (mock-location apps, browser devtools sensors). HuntX *detects anomalies* (accuracy that is too perfect, impossible speed, repeated identical fixes, stale fixes) and **flags them for review**. It does not claim to prevent spoofing.
- **Tab-switch monitoring** only sees *this page* losing visibility, focus or fullscreen. Notifications, phone calls and OS dialogs also trigger it. That is why warnings add penalties or flags, and **disqualification is always a manual decision**. HuntX does not and cannot watch other tabs or apps.
- **Photo metadata is not proof.** Capture time, source and GPS are shown to the reviewer. Approval is always manual.
- The in-memory rate limiter is per serverless instance (best effort). The critical limits are enforced in the database.

---

## 2. Database (`supabase/migrations/0001_huntx_schema.sql`)

`events` · `event_settings` (jsonb rules engine) · `admins` · `profiles` (mirrors auth.users) · `teams` · `team_members` · `clues` · `team_progress` · `location_verifications` · `location_pings` · `photo_submissions` · `anti_cheat_events` · `notifications` · `scoring_records` (points ledger, score = SUM) · `announcements`

Key constraints:
- At most **one active clue per team**: `unique (team_id) where status='active'`.
- One **live submission** per team+clue.
- Automatic awards (photo, location, hint, late, completion) can't be **double-counted**.
- Atomic RPCs `increment_team_warning` and `reorder_clues` are callable by `service_role` only.

**Clue unlock rules** (per clue): `on_submission` · `on_approval` · `on_verification` · `manual`.

---

## 3. Setup (≈15 minutes)

### 3.1 Supabase
1. Create a project at <https://supabase.com> (choose the Mumbai region for low latency).
2. **SQL Editor →** paste and run `supabase/migrations/0001_huntx_schema.sql`.
3. *(Optional demo data)* Run `supabase/seed.sql`. It adds an event starting tomorrow plus 4 sample clues. **The coordinates are approximate.** Walk the campus and re-pin each clue with *Admin → Clues → Use my current location*.
4. **Authentication → Providers → Email:** keep it enabled. You can turn **off** "Confirm email" (team accounts are created server-side and already confirmed).
5. **Database → Replication:** confirm that the `supabase_realtime` publication lists `notifications`, `announcements`, `teams`, `team_progress`, `photo_submissions`, `scoring_records` and `location_verifications` (the migration adds them).
6. **Storage:** check that the `submissions` bucket exists and is **Private**.

### 3.2 Local
```bash
cp .env.example .env.local      # fill in the values from Supabase → Project Settings → API
npm install
npm run create-admin -- you@iitp.ac.in 'A-Strong-Passw0rd' super_admin
npm run dev                     # http://localhost:3000
```

> **Camera & GPS need HTTPS** on phones. `localhost` works on the same machine. To test on a phone, deploy to Vercel or use a tunnel (`npx localtunnel --port 3000`, ngrok, or Cloudflare Tunnel).

### 3.3 Environment variables
| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Safe in the browser (RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | Never commit it, never prefix it with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SITE_URL` | public | Used in QR join links |
| `TEAM_EMAIL_DOMAIN` | server | Internal login domain for username-based team accounts |

Without credentials the app still builds and renders, and shows "Backend not connected". It does not pretend the integration is active.

### 3.4 Deploy to Vercel
1. Push the repo to GitHub, then **Import** it in Vercel.
2. Add the 5 env vars above (Production + Preview).
3. Deploy. Then set `NEXT_PUBLIC_SITE_URL` to the final URL and redeploy.
4. In Supabase **Auth → URL Configuration**, set the Site URL to your Vercel domain.

---

## 4. Running an event (organiser checklist)
1. **Event Settings:** name, start/end, rules, scoring engine, GPS, anti-cheat and photo policy. Use *Save rules engine* to apply.
2. **Clues:** create them, pin each on the map (or stand on the spot and use *Use my current location*), set radius, time limit, points, hint/penalty and unlock rule. Reorder with the arrows.
3. **Teams:** either open self-registration, or create accounts with *Create team*. The credentials and QR code are shown once, so print them.
4. On the day: **Overview → Start now** (or let the scheduled start time trigger it). Watch Alerts and the Live Map, review photos in **Photo Submissions**, broadcast messages, and pause, resume or extend as needed. **Emergency stop** pauses everything and pushes a critical alert.
5. Afterwards: export the CSVs (leaderboard, teams, submissions, anti-cheat, locations, score ledger) and the photo ZIP. Then use **Privacy → Purge** to delete location data and photos.

### Recommended field settings
- Geofence radius **25–40 m** (phone GPS on campus is typically ±5–20 m).
- Max accepted accuracy **40–50 m**, retry cooldown **15 s**.
- Keep *free warnings* at 2 or more. Mobile permission prompts and notifications cause a few false signals. HuntX already suppresses blur events caused by its own GPS and camera prompts.

---

## 5. Project structure
```
src/
  app/
    page.tsx                 landing (live countdown, status, participant count)
    join/                    team login / registration (+ ?code= QR prefill)
    hunt/                    participant dashboard, camera, GPS, anti-cheat
    hunt/finish/             completion screen
    leaderboard/             public live leaderboard
    admin/login/             organiser login
    admin/(dash)/            overview · teams · clues · map · submissions · alerts · leaderboard · settings
    api/
      time, public/event, leaderboard, auth/{login,logout,register}
      team/{state,verify-location,submit-photo,anticheat,hint,location}
      admin/{me,event,settings,clues,teams,submissions,notifications,announcements,map,export,photos,privacy,leaderboard,admins}
  components/                ui kit, map (Leaflet), hunt, admin shell + realtime context
  hooks/                     server clock, anti-cheat, online/geolocation
  lib/
    server/                  auth guards, progress engine, scoring, leaderboard, notify, rate limit
    settings.ts              configurable rules engine (defaults + zod validation)
    geo.ts                   haversine, fuzzed zone
supabase/                    migration + seed
scripts/create-admin.mjs     bootstrap the first organiser
tests/                       node --test geofence maths
```

## 6. Verification done
- `npm run build` ✔ · `npm run lint` ✔ · `tsc --noEmit` ✔ · `npm test` ✔
- Migration and seed applied to PostgreSQL 16 with Supabase schema stubs. RLS was checked: a participant sees **0 clues**, only their own team, no notifications or settings, and cannot call the server RPCs. Admins see everything. The one-active-clue constraint and atomic reorder were confirmed.
- Not yet tested end-to-end against a live Supabase project, or on real phones walking the campus. Do a dry run with 2–3 teams before the event.
