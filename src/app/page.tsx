import Link from "next/link";
import { ArrowRight, Camera, Crosshair, Eye, KeyRound, Lock, MapPinned, Puzzle, ShieldCheck, Trophy, Unlock } from "lucide-react";
import { getPublicEvent } from "@/lib/server/public-event";
import { MapBackdrop } from "@/components/landing/backdrop";
import { LivePanel } from "@/components/landing/live-panel";
import { Logo } from "@/components/ui";

export const dynamic = "force-dynamic";

const STEPS = [
  { icon: Puzzle, title: "Decode", body: "Each clue is a riddle — sometimes in English, sometimes in Hindi. Crack it as a team." },
  { icon: MapPinned, title: "Locate", body: "Figure out which corner of the IIT Patna campus the clue points to." },
  { icon: Crosshair, title: "Verify", body: "Reach the spot and tap Verify Location. The server checks you're inside the geofence." },
  { icon: Camera, title: "Capture", body: "Shoot the photo live through the HuntX camera. No gallery uploads." },
  { icon: Unlock, title: "Unlock", body: "Submit before the clue timer runs out to unlock the next clue." },
  { icon: Trophy, title: "Finish", body: "Points for photos, verified locations and speed. Climb the live leaderboard." },
];

const DEFAULT_RULES = [
  "Each team gets one 6-letter team code. Share it only with your teammates.",
  "Photos must be captured live through the HuntX camera.",
  "Verify your GPS location at each spot before capturing.",
  "Hints are available but cost points.",
  "Leaving the hunt screen is recorded and may cost points.",
  "Respect campus rules. Do not enter restricted labs, hostels or rooftops.",
];

export default async function Home() {
  const pub = await getPublicEvent();
  const ev = pub.event;
  const rules = ev?.rules?.length ? ev.rules : DEFAULT_RULES;

  return (
    <main className="relative min-h-dvh overflow-x-hidden">
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="HuntX home">
            <Logo />
          </Link>
          <div className="hidden items-center gap-7 text-sm text-slate-400 md:flex">
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#rules" className="hover:text-white">Rules</a>
            <Link href="/leaderboard" className="hover:text-white">Leaderboard</Link>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/login" className="hidden h-9 items-center gap-1.5 rounded-xl px-3 text-sm text-slate-400 hover:bg-white/5 hover:text-white sm:inline-flex">
              <KeyRound className="h-4 w-4" /> Admin Login
            </Link>
            <Link href="/join" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-neon px-4 text-sm font-semibold text-ink-950 shadow-neon hover:bg-neon-glow">
              Join Hunt <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </nav>
      </header>

      {/* HERO */}
      <section className="relative">
        <MapBackdrop />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.15fr_.85fr] lg:pb-24 lg:pt-20">
          <div className="animate-rise">
            <p className="inline-flex items-center gap-2 rounded-full border border-neon/20 bg-neon/5 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-neon">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon" />
              IIT Patna · Photography Hunt
            </p>
            <h1 className="mt-6 font-display text-[2.6rem] font-bold leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-[4.4rem]">
              Decode the clue.
              <br />
              Find the place.
              <br />
              <span className="text-gradient">Take the shot.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
              {ev?.description ||
                "HuntX turns the Bihta campus into a live game board. Cryptic clues, GPS-verified checkpoints and camera-only submissions — tracked in real time by the organisers."}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/join" className="inline-flex h-12 items-center gap-2 rounded-xl bg-neon px-6 font-semibold text-ink-950 shadow-neon transition hover:bg-neon-glow">
                Join Hunt <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/leaderboard" className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-6 text-slate-200 hover:bg-white/[0.08]">
                <Trophy className="h-4 w-4 text-amber" /> Live leaderboard
              </Link>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 font-mono text-xs">
              <div>
                <dt className="text-slate-600">LAT</dt>
                <dd className="text-cyan">25.5357° N</dd>
              </div>
              <div>
                <dt className="text-slate-600">LNG</dt>
                <dd className="text-cyan">84.8512° E</dd>
              </div>
              <div>
                <dt className="text-slate-600">VENUE</dt>
                <dd className="truncate text-cyan">{ev?.venue ?? "Bihta Campus"}</dd>
              </div>
            </dl>
          </div>
          <div className="animate-rise [animation-delay:120ms]">
            <LivePanel initial={pub} />
          </div>
        </div>
        {/* ticker */}
        <div className="relative overflow-hidden border-y border-white/5 bg-ink-900/60 py-3">
          <div className="flex w-max animate-ticker gap-10 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.25em] text-slate-500">
            {Array.from({ length: 2 }).map((_, k) => (
              <div key={k} className="flex gap-10">
                {["Clue 01 · Locked", "Geofence · 30 m", "GPS lock · ±8 m", "Shutter · ready", "Clue 02 · Locked", "Server time · synced", "Fair play · on", "Finish line · ahead"].map((t) => (
                  <span key={t}>
                    <span className="text-neon">◆</span> {t}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <p className="hud-label">Route briefing</p>
        <h2 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">How the hunt works</h2>
        <ol className="relative mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="glass group relative overflow-hidden p-6 transition hover:border-neon/30">
              <span className="absolute right-4 top-3 font-mono text-5xl font-bold text-white/[0.04] transition group-hover:text-neon/10">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-neon/30 bg-neon/10 text-neon">
                <s.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* RULES */}
      <section id="rules" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <div className="glass p-7">
            <p className="hud-label">Field manual</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-white">Rules of the hunt</h2>
            <ul className="mt-6 space-y-3">
              {rules.map((r, i) => (
                <li key={i} className="flex gap-3 text-sm text-slate-300">
                  <span className="mt-0.5 font-mono text-xs text-neon">{String(i + 1).padStart(2, "0")}</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
          <div className="glass p-7">
            <p className="hud-label">Fair play, transparently</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-white">What HuntX records</h2>
            <div className="mt-6 space-y-4 text-sm">
              <div className="flex gap-3">
                <Eye className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
                <p className="text-slate-300">
                  When you leave <em>this</em> hunt page (tab switch, focus loss, fullscreen exit). We can&apos;t see other tabs or apps — and don&apos;t try to.
                </p>
              </div>
              <div className="flex gap-3">
                <Crosshair className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
                <p className="text-slate-300">Your GPS position only when you tap Verify Location (plus optional periodic updates if your team opts in).</p>
              </div>
              <div className="flex gap-3">
                <Camera className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
                <p className="text-slate-300">The camera only while the capture screen is open and only when you press the shutter.</p>
              </div>
              <div className="flex gap-3">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
                <p className="text-slate-300">Photos are stored privately and visible only to organisers. Location data is deleted after the retention period.</p>
              </div>
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-neon" />
                <p className="text-slate-300">Browser signals are imperfect, so warnings never auto-disqualify anyone. Humans review every flag.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 bg-ink-950">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-xs text-slate-500 sm:flex-row sm:px-6">
          <Logo className="text-base" />
          <p>Built for the photography treasure hunt at IIT Patna · Map data © OpenStreetMap contributors</p>
          <div className="flex gap-4">
            <Link href="/join" className="hover:text-slate-300">Join</Link>
            <Link href="/leaderboard" className="hover:text-slate-300">Leaderboard</Link>
            <Link href="/admin/login" className="hover:text-slate-300">Organisers</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
