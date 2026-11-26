"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Clock, Flag, SkipForward, Target, Trophy, Users } from "lucide-react";
import { Badge, Logo, Spinner, statusTone } from "@/components/ui";
import { api, formatDuration } from "@/lib/utils";
import type { TeamState } from "@/lib/types";

const COLORS = ["#39ff88", "#22d3ee", "#fbbf24", "#a78bfa", "#ff4d6d"];

export default function FinishPage() {
  const router = useRouter();
  const [s, setS] = useState<TeamState | null>(null);

  useEffect(() => {
    api<TeamState>("/api/team/state")
      .then((st) => {
        if (!st.finished) router.replace("/hunt");
        else setS(st);
      })
      .catch(() => router.replace("/join"));
  }, [router]);

  const confetti = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        left: (i * 37) % 100,
        delay: (i % 12) * 0.25,
        dur: 3 + (i % 5),
        color: COLORS[i % COLORS.length],
        size: 6 + (i % 3) * 3,
      })),
    [],
  );

  if (!s) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const started = s.team.started_at ? Date.parse(s.team.started_at) : Date.parse(s.event.start_at);
  const finished = s.team.finished_at ? Date.parse(s.team.finished_at) : Date.now();
  const elapsed = finished - Math.min(started, Date.parse(s.event.start_at));
  const skipped = s.track.filter((t) => t.status === "skipped").length;
  const approved = s.history.filter((h) => h.status === "approved").length;

  return (
    <main className="relative min-h-dvh overflow-hidden px-4 py-8">
      <div aria-hidden className="pointer-events-none fixed inset-0">
        {confetti.map((c, i) => (
          <span
            key={i}
            className="absolute top-0 rounded-sm"
            style={{
              left: `${c.left}%`,
              width: c.size,
              height: c.size * 0.4,
              background: c.color,
              animation: `confetti ${c.dur}s linear ${c.delay}s infinite`,
            }}
          />
        ))}
      </div>
      <div className="relative mx-auto max-w-2xl">
        <Link href="/">
          <Logo />
        </Link>
        <div className="mt-10 animate-rise text-center">
          <div className="relative mx-auto grid h-28 w-28 place-items-center">
            <span className="absolute inset-0 animate-pulseRing rounded-full border-2 border-amber" />
            <span className="absolute inset-3 animate-pulseRing rounded-full border-2 border-neon [animation-delay:.8s]" />
            <Flag className="h-12 w-12 text-amber" />
          </div>
          <p className="mt-6 hud-label">Mission complete</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-white sm:text-5xl">
            Congratulations, <span className="text-gradient">{s.team.name}</span>!
          </h1>
          <p className="mt-3 text-slate-400">You conquered every clue of {s.event.name}.</p>
        </div>

        <div className="mt-10 grid grid-cols-3 gap-3">
          <div className="glass p-4 text-center">
            <Target className="mx-auto h-5 w-5 text-neon" />
            <p className="mt-2 font-display text-3xl font-bold tabular-nums text-white">{s.stats.score}</p>
            <p className="hud-label mt-1">Final score</p>
          </div>
          <div className="glass p-4 text-center">
            <Clock className="mx-auto h-5 w-5 text-cyan" />
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-white">{formatDuration(elapsed, { hours: true })}</p>
            <p className="hud-label mt-1">Completion</p>
          </div>
          <div className="glass p-4 text-center">
            <Trophy className="mx-auto h-5 w-5 text-amber" />
            <p className="mt-2 font-display text-3xl font-bold tabular-nums text-white">{s.stats.rank ? `#${s.stats.rank}` : "—"}</p>
            <p className="hud-label mt-1">Rank (live)</p>
          </div>
        </div>

        <div className="glass mt-4 p-5">
          <p className="hud-label">Clue summary</p>
          <ul className="mt-3 divide-y divide-white/5">
            {s.track.map((t) => {
              const h = s.history.find((x) => x.clue_number === t.number);
              return (
                <li key={t.number} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="flex items-center gap-2 text-slate-300">
                    {t.status === "completed" ? <Check className="h-4 w-4 text-neon" /> : <SkipForward className="h-4 w-4 text-amber" />}
                    Clue {t.number} {h && <span className="text-slate-500">· {h.title}</span>}
                  </span>
                  {h ? <Badge tone={statusTone[h.status]}>{h.status.replace("_", " ")}</Badge> : <Badge>{t.status}</Badge>}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="glass mt-4 grid grid-cols-3 gap-3 p-5 text-center text-sm">
          <div>
            <p className="font-display text-xl font-semibold text-white">{approved}</p>
            <p className="text-xs text-slate-500">photos approved</p>
          </div>
          <div>
            <p className="font-display text-xl font-semibold text-white">{skipped}</p>
            <p className="text-xs text-slate-500">clues skipped</p>
          </div>
          <div>
            <p className="flex items-center justify-center gap-1 font-display text-xl font-semibold text-white">
              <Users className="h-4 w-4 text-slate-500" />
              {s.stats.teams}
            </p>
            <p className="text-xs text-slate-500">teams competing</p>
          </div>
        </div>

        <div className="mt-6 flex justify-center gap-3">
          <Link href="/leaderboard" className="inline-flex h-11 items-center gap-2 rounded-xl bg-neon px-5 font-semibold text-ink-950 shadow-neon">
            <Trophy className="h-4 w-4" /> Leaderboard
          </Link>
          <Link href="/hunt" className="inline-flex h-11 items-center rounded-xl border border-white/10 px-5 text-slate-300 hover:bg-white/5">
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
