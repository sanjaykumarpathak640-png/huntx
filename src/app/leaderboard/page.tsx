"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio, Trophy } from "lucide-react";
import { Badge, Logo, Spinner, statusTone } from "@/components/ui";
import { LeaderboardTable, type LbRow } from "@/components/leaderboard-table";
import { api } from "@/lib/utils";

interface Resp {
  event: { name: string; phase: string; ranking: string } | null;
  rows: LbRow[];
}

const RANKING_LABEL: Record<string, string> = {
  score_then_time: "Score, then clues, then fastest finish",
  clues_then_time: "Clues completed, then fastest finish",
  score_only: "Score only",
};

export default function LeaderboardPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<Resp>("/api/leaderboard")
        .then((d) => {
          if (!alive) return;
          setData(d);
          setUpdated(new Date());
          setErr(null);
        })
        .catch((e) => alive && setErr((e as Error).message));
    load();
    const id = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <Link href="/">
          <Logo />
        </Link>
        <Link href="/hunt" className="text-sm text-slate-400 hover:text-white">
          My dashboard →
        </Link>
      </div>
      <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="hud-label">{data?.event?.name ?? "HuntX"}</p>
          <h1 className="mt-1 flex items-center gap-3 font-display text-3xl font-bold text-white sm:text-4xl">
            <Trophy className="h-8 w-8 text-amber" /> Leaderboard
          </h1>
          {data?.event && <p className="mt-1 text-xs text-slate-500">Ranking: {RANKING_LABEL[data.event.ranking]}</p>}
        </div>
        <div className="flex items-center gap-2">
          {data?.event && (
            <Badge tone={statusTone[data.event.phase]} dot>
              {data.event.phase}
            </Badge>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Radio className="h-3 w-3 text-neon" /> {updated ? `updated ${updated.toLocaleTimeString()}` : "connecting"}
          </span>
        </div>
      </div>
      <div className="glass mt-6 p-2">
        {err ? <p className="p-8 text-center text-sm text-slate-400">{err}</p> : data ? <LeaderboardTable rows={data.rows} /> : <div className="grid place-items-center p-10"><Spinner /></div>}
      </div>
    </main>
  );
}
