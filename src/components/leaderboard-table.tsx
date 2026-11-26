import { Crown, Medal } from "lucide-react";
import { Badge, statusTone } from "@/components/ui";
import { cn, formatDuration } from "@/lib/utils";

export interface LbRow {
  rank: number | null;
  team_id: string;
  name: string;
  team_uid: string;
  score: number;
  penalties: number;
  completed: number;
  completion_ms: number | null;
  status: string;
  flagged?: boolean;
  warning_count?: number;
}

export function LeaderboardTable({ rows, highlight, admin }: { rows: LbRow[]; highlight?: string; admin?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="hud-label text-left">
            <th className="px-3 py-3">Rank</th>
            <th className="px-3 py-3">Team</th>
            <th className="px-3 py-3 text-right">Score</th>
            <th className="px-3 py-3 text-right">Clues</th>
            <th className="px-3 py-3 text-right">Penalties</th>
            <th className="px-3 py-3 text-right">Time</th>
            <th className="px-3 py-3">Status</th>
            {admin && <th className="px-3 py-3 text-right">Warnings</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.team_id}
              className={cn(
                "border-t border-white/5 transition hover:bg-white/[0.02]",
                highlight === r.team_id && "bg-neon/5",
                r.status === "disqualified" && "opacity-50",
              )}
            >
              <td className="px-3 py-3">
                <span
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-lg font-mono text-sm font-bold",
                    r.rank === 1 ? "bg-amber/20 text-amber" : r.rank === 2 ? "bg-slate-300/10 text-slate-200" : r.rank === 3 ? "bg-orange-400/10 text-orange-300" : "text-slate-500",
                  )}
                >
                  {r.rank === 1 ? <Crown className="h-4 w-4" /> : r.rank && r.rank <= 3 ? <Medal className="h-4 w-4" /> : r.rank ?? "—"}
                </span>
              </td>
              <td className="px-3 py-3">
                <p className="font-semibold text-slate-100">{r.name}</p>
                <p className="font-mono text-[11px] text-slate-600">{r.team_uid}</p>
              </td>
              <td className="px-3 py-3 text-right font-display text-lg font-semibold tabular-nums text-neon">{r.score}</td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-300">{r.completed}</td>
              <td className="px-3 py-3 text-right tabular-nums text-danger/80">{r.penalties ? `−${r.penalties}` : "0"}</td>
              <td className="px-3 py-3 text-right font-mono text-xs text-slate-400">{r.completion_ms ? formatDuration(r.completion_ms, { hours: true }) : "—"}</td>
              <td className="px-3 py-3">
                <div className="flex gap-1">
                  <Badge tone={statusTone[r.status]}>{r.status}</Badge>
                  {admin && r.flagged && <Badge tone="danger">flagged</Badge>}
                </div>
              </td>
              {admin && <td className={cn("px-3 py-3 text-right tabular-nums", (r.warning_count ?? 0) > 0 ? "text-amber" : "text-slate-500")}>{r.warning_count}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No teams yet.</p>}
    </div>
  );
}
