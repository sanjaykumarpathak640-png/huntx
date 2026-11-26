import { Check, Flag, Lock, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TeamState } from "@/lib/types";

/** Clue 1 → Clue 2 → … → Finish */
export function ProgressTrack({ track, finished }: { track: TeamState["track"]; finished: boolean }) {
  return (
    <div className="glass overflow-x-auto p-4">
      <div className="flex min-w-max items-center">
        {track.map((t, i) => (
          <div key={t.number} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "relative grid h-10 w-10 place-items-center rounded-full border-2 font-mono text-sm font-bold transition",
                  t.status === "completed" && "border-neon bg-neon text-ink-950 shadow-neon",
                  t.status === "skipped" && "border-amber/60 bg-amber/10 text-amber",
                  t.status === "active" && "border-cyan bg-cyan/10 text-cyan shadow-cyan",
                  t.status === "locked" && "border-white/10 bg-white/[0.02] text-slate-600",
                )}
              >
                {t.status === "completed" ? (
                  <Check className="h-4 w-4" />
                ) : t.status === "skipped" ? (
                  <SkipForward className="h-4 w-4" />
                ) : t.status === "locked" ? (
                  <Lock className="h-3.5 w-3.5" />
                ) : (
                  t.number
                )}
                {t.status === "active" && <span className="absolute inset-0 animate-pulseRing rounded-full border-2 border-cyan" />}
              </div>
              <span className={cn("text-[10px] uppercase tracking-wider", t.status === "active" ? "text-cyan" : "text-slate-500")}>Clue {t.number}</span>
            </div>
            <div
              className={cn(
                "mx-1 mb-5 h-0.5 w-8 sm:w-12",
                t.status === "completed" || t.status === "skipped" ? "bg-gradient-to-r from-neon to-neon/40" : "border-t-2 border-dashed border-white/10 bg-transparent",
              )}
            />
            {i === track.length - 1 && (
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-full border-2",
                    finished ? "border-amber bg-amber text-ink-950" : "border-white/10 text-slate-600",
                  )}
                >
                  <Flag className="h-4 w-4" />
                </div>
                <span className={cn("text-[10px] uppercase tracking-wider", finished ? "text-amber" : "text-slate-500")}>Finish</span>
              </div>
            )}
          </div>
        ))}
        {track.length === 0 && <p className="text-sm text-slate-500">Clues appear here once the hunt starts.</p>}
      </div>
    </div>
  );
}
