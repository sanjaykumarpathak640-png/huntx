"use client";
import { useMemo, useState } from "react";
import { Bell, CheckCheck, Download, Volume2, VolumeX } from "lucide-react";
import { Badge, Button, Card, Empty, Input, statusTone } from "@/components/ui";
import { useAdmin } from "@/components/admin/admin-context";
import { cn, fmtTime } from "@/lib/utils";

const SEV = ["all", "critical", "warning", "success", "info"] as const;

export default function AlertsPage() {
  const { notifications, markRead, unread, sound, setSound, can } = useAdmin();
  const [sev, setSev] = useState<(typeof SEV)[number]>("all");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [q, setQ] = useState("");

  const list = useMemo(
    () =>
      notifications.filter(
        (n) => (sev === "all" || n.severity === sev) && (!onlyUnread || !n.read) && (!q || `${n.message} ${n.team_name ?? ""} ${n.type}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [notifications, sev, onlyUnread, q],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hud-label">Realtime</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-white">Alerts</h1>
          <p className="mt-1 text-xs text-slate-500">{unread} unread · showing latest 300</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setSound(!sound)}>
            {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} Sound {sound ? "on" : "off"}
          </Button>
          {can("organiser") && (
            <a href="/api/admin/export?type=notifications" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-sm text-slate-300 hover:bg-white/5">
              <Download className="h-4 w-4" /> CSV
            </a>
          )}
          {can("organiser") && (
            <a href="/api/admin/export?type=anticheat" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-sm text-slate-300 hover:bg-white/5">
              <Download className="h-4 w-4" /> Anti-cheat log
            </a>
          )}
          <Button onClick={() => markRead("all")} disabled={!unread}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex max-w-full overflow-x-auto rounded-xl border border-white/10 p-1 text-xs">
          {SEV.map((s) => (
            <button key={s} onClick={() => setSev(s)} className={cn("rounded-lg px-3 py-1.5 capitalize", sev === s ? "bg-white/10 text-white" : "text-slate-500")}>
              {s}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} className="accent-[#39ff88]" /> Unread only
        </label>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by team or text" className="max-w-xs" />
      </div>

      {list.length === 0 ? (
        <Empty icon={<Bell className="h-10 w-10" />} title="Nothing here" />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-white/5">
            {list.map((n) => (
              <li
                key={n.id}
                className={cn("flex items-start gap-4 px-4 py-3", !n.read && "bg-white/[0.02]", n.severity === "critical" && !n.read && "bg-danger/[0.06]")}
              >
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-cyan")} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-200">{n.message}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-600">
                    {fmtTime(n.created_at)} · {n.type}
                    {n.clue_number ? ` · clue ${n.clue_number}` : ""}
                  </p>
                </div>
                <Badge tone={statusTone[n.severity]}>{n.severity}</Badge>
                {!n.read && (
                  <button onClick={() => markRead([n.id])} className="text-xs text-slate-500 hover:text-slate-200">
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
