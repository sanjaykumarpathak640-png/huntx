"use client";
import { useEffect, useState } from "react";
import { MapPin, Puzzle, Users } from "lucide-react";
import { useServerNow } from "@/hooks/use-server-clock";
import { Badge, statusTone } from "@/components/ui";
import type { PublicEvent } from "@/lib/server/public-event";
import { Radar } from "./backdrop";

function split(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

export function LivePanel({ initial }: { initial: PublicEvent }) {
  const [data, setData] = useState(initial);
  const now = useServerNow(1000, initial.serverNow);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch("/api/public/event", { cache: "no-store" });
        setData(await r.json());
      } catch {}
    }, 20000);
    return () => clearInterval(id);
  }, []);

  const ev = data.event;
  if (!ev) {
    return (
      <div className="glass corner-frame p-6">
        <Radar className="mx-auto w-40 opacity-70" />
        <p className="mt-4 text-center font-display text-lg text-slate-200">
          {data.configured ? "No hunt scheduled yet" : "Backend not connected"}
        </p>
        <p className="mt-1 text-center text-xs text-slate-500">
          {data.configured ? "Organisers will announce the next event soon." : "Add Supabase keys to .env.local — see README → Setup."}
        </p>
      </div>
    );
  }

  const start = Date.parse(ev.start_at);
  const end = Date.parse(ev.end_at);
  let phase = ev.phase;
  if (phase === "upcoming" && now >= start) phase = "live";
  if (phase === "live" && now >= end) phase = "ended";
  const target = phase === "upcoming" ? start - now : phase === "live" ? end - now : phase === "paused" ? ev.remaining_ms : 0;
  const t = split(target);
  const label = { upcoming: "Starts in", live: "Ends in", paused: "Paused · remaining", ended: "Hunt completed", draft: "Coming soon" }[phase];

  return (
    <div className="glass corner-frame relative overflow-hidden p-6">
      <div className="flex items-center justify-between">
        <span className="hud-label">Mission status</span>
        <Badge tone={statusTone[phase]} dot className={phase === "live" ? "animate-pulse" : ""}>
          {phase === "upcoming" ? "Upcoming" : phase === "live" ? "Live" : phase === "paused" ? "Paused" : phase === "ended" ? "Completed" : "Draft"}
        </Badge>
      </div>
      <div className="mt-5 grid grid-cols-[1fr_auto] items-center gap-4">
        <div>
          <p className="text-xs text-slate-400">{label}</p>
          {phase !== "ended" && phase !== "draft" ? (
            <div className="mt-2 flex items-end gap-3 font-mono tabular-nums">
              {(t.d > 0 ? [["d", t.d], ["h", t.h], ["m", t.m]] : [["h", t.h], ["m", t.m], ["s", t.s]]).map(([k, v]) => (
                <div key={k as string}>
                  <div className="text-4xl font-bold text-white sm:text-5xl">{String(v).padStart(2, "0")}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-widest text-slate-500">{k}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 font-display text-3xl font-semibold text-white">🏁 That&apos;s a wrap</p>
          )}
        </div>
        <Radar className="w-24 sm:w-28" />
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2 border-t border-white/5 pt-4 text-center">
        <div>
          <Users className="mx-auto h-4 w-4 text-neon" />
          <p className="mt-1 font-display text-xl font-semibold tabular-nums text-white">{ev.teams}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Teams</p>
        </div>
        <div>
          <Puzzle className="mx-auto h-4 w-4 text-cyan" />
          <p className="mt-1 font-display text-xl font-semibold tabular-nums text-white">{ev.clues}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Clues</p>
        </div>
        <div>
          <MapPin className="mx-auto h-4 w-4 text-amber" />
          <p className="mt-1 truncate font-display text-sm font-semibold text-white">IIT Patna</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Bihta</p>
        </div>
      </div>
      <p className="mt-4 text-center text-[11px] text-slate-500">
        {new Date(ev.start_at).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        {" → "}
        {new Date(ev.end_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}
