"use client";
import { Download, ExternalLink, Trophy } from "lucide-react";
import { Card, Spinner } from "@/components/ui";
import { useAdmin, useAdminData } from "@/components/admin/admin-context";
import { LeaderboardTable, type LbRow } from "@/components/leaderboard-table";

export default function AdminLeaderboard() {
  const { can } = useAdmin();
  const { data, loading } = useAdminData<{ rows: LbRow[]; ranking: string }>("/api/admin/leaderboard");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hud-label">Ranking · {data?.ranking?.replace(/_/g, " ")}</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-2xl font-bold text-white">
            <Trophy className="h-6 w-6 text-amber" /> Leaderboard
          </h1>
          <p className="mt-1 text-xs text-slate-500">Change ranking rules in Event Settings → Scoring engine. Updates live.</p>
        </div>
        <div className="flex gap-2">
          <a href="/leaderboard" target="_blank" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-sm text-slate-300 hover:bg-white/5">
            <ExternalLink className="h-4 w-4" /> Public view (projector)
          </a>
          {can("organiser") && (
            <>
              <a href="/api/admin/export?type=leaderboard" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-sm text-slate-300 hover:bg-white/5">
                <Download className="h-4 w-4" /> CSV
              </a>
              <a href="/api/admin/export?type=scores" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-sm text-slate-300 hover:bg-white/5">
                <Download className="h-4 w-4" /> Score ledger
              </a>
            </>
          )}
        </div>
      </div>
      <Card className="p-2">{loading && !data ? <div className="grid h-40 place-items-center"><Spinner /></div> : <LeaderboardTable rows={data?.rows ?? []} admin />}</Card>
    </div>
  );
}
