"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertOctagon, Bell, Camera, Download, Flag, Megaphone, Pause, Play, Plus, Square, Timer, Trophy, Users } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, Select, Spinner, Stat, Textarea, statusTone } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useAdmin, useAdminData } from "@/components/admin/admin-context";
import { LeaderboardTable, type LbRow } from "@/components/leaderboard-table";
import { useServerNow } from "@/hooks/use-server-clock";
import { api, cn, formatDays, timeAgo } from "@/lib/utils";
import type { EventRow, Phase } from "@/lib/types";

interface Overview {
  serverNow: number;
  event: (EventRow & { phase: Phase; remaining_ms: number }) | null;
  stats: { teams: number; active_teams: number; flagged_teams: number; disqualified: number; finished: number; clues: number; pending_reviews: number; unread_alerts: number };
}

export default function OverviewPage() {
  const toast = useToast();
  const { notifications, can, refreshMeta } = useAdmin();
  const { data, reload, loading } = useAdminData<Overview>("/api/admin/event");
  const lb = useAdminData<{ rows: LbRow[] }>("/api/admin/leaderboard");
  const now = useServerNow(1000, data?.serverNow);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "end" | "emergency_stop">(null);
  const [emMsg, setEmMsg] = useState("");
  const [extend, setExtend] = useState(15);
  const [broadcast, setBroadcast] = useState({ message: "", severity: "info" });

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    try {
      await api("/api/admin/event", { method: "PATCH", body: JSON.stringify({ action, ...extra }) });
      toast({ kind: "success", title: `Event ${action.replace("_", " ")}` });
      await reload();
      await refreshMeta();
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  async function send() {
    if (!broadcast.message.trim()) return;
    setBusy("broadcast");
    try {
      await api("/api/admin/announcements", { method: "POST", body: JSON.stringify(broadcast) });
      toast({ kind: "success", title: "Broadcast sent to all teams" });
      setBroadcast({ message: "", severity: "info" });
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) return <div className="grid h-64 place-items-center"><Spinner /></div>;
  if (!data?.event) {
    return (
      <Empty
        icon={<Flag className="h-10 w-10" />}
        title="No event yet"
        body="Create your first event to start adding clues and teams."
        action={
          <Link href="/admin/settings" className="inline-flex h-10 items-center gap-2 rounded-xl bg-neon px-4 text-sm font-semibold text-ink-950">
            <Plus className="h-4 w-4" /> Create event
          </Link>
        }
      />
    );
  }

  const ev = data.event;
  let phase = ev.phase;
  if (phase === "upcoming" && now >= Date.parse(ev.start_at)) phase = "live";
  if (phase === "live" && now >= Date.parse(ev.end_at)) phase = "ended";
  const remaining = phase === "live" ? Date.parse(ev.end_at) - now : phase === "paused" ? ev.remaining_ms : phase === "upcoming" ? Date.parse(ev.start_at) - now : 0;
  const s = data.stats;
  const organiser = can("organiser");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hud-label">Mission control</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">{ev.name}</h1>
        </div>
        {organiser && (
          <div className="flex flex-wrap gap-2">
            <a href="/api/admin/export?type=leaderboard" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs text-slate-300 hover:bg-white/5">
              <Download className="h-3.5 w-3.5" /> Leaderboard CSV
            </a>
            <a href="/api/admin/export?type=submissions" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs text-slate-300 hover:bg-white/5">
              <Download className="h-3.5 w-3.5" /> Submissions CSV
            </a>
          </div>
        )}
      </div>

      {/* event control */}
      <Card className={cn("relative overflow-hidden", phase === "live" && "border-neon/30")}>
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex items-center gap-2">
              <Badge tone={statusTone[phase]} dot className={phase === "live" ? "animate-pulse" : ""}>
                {phase}
              </Badge>
              <span className="text-xs text-slate-500">
                {new Date(ev.start_at).toLocaleString("en-IN")} → {new Date(ev.end_at).toLocaleTimeString("en-IN")}
              </span>
            </div>
            <p className="mt-3 hud-label">{phase === "upcoming" ? "Starts in" : phase === "paused" ? "Remaining (frozen)" : phase === "ended" ? "Ended" : "Time remaining"}</p>
            <p className={cn("mt-1 font-mono text-5xl font-bold tabular-nums", phase === "paused" ? "text-amber" : "text-white")}>{formatDays(remaining)}</p>
            {ev.total_paused_seconds > 0 && <p className="mt-1 text-xs text-slate-500">Total paused: {Math.round(ev.total_paused_seconds / 60)} min</p>}
          </div>
          {organiser && (
            <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
              {(phase === "upcoming" || phase === "draft") && (
                <Button variant="primary" onClick={() => act("start")} loading={busy === "start"}>
                  <Play className="h-4 w-4" /> Start now
                </Button>
              )}
              {phase === "live" && (
                <Button variant="secondary" onClick={() => act("pause")} loading={busy === "pause"}>
                  <Pause className="h-4 w-4" /> Pause
                </Button>
              )}
              {phase === "paused" && (
                <Button variant="primary" onClick={() => act("resume")} loading={busy === "resume"}>
                  <Play className="h-4 w-4" /> Resume
                </Button>
              )}
              <div className="flex items-center gap-1 rounded-xl border border-white/10 p-1">
                <Input type="number" min={1} max={600} value={extend} onChange={(e) => setExtend(Number(e.target.value))} className="h-8 w-16 text-center" aria-label="Minutes" />
                <Button size="sm" variant="ghost" onClick={() => act("extend", { minutes: extend })} loading={busy === "extend"}>
                  <Timer className="h-4 w-4" /> Extend
                </Button>
              </div>
              {phase !== "ended" && (
                <Button variant="danger" onClick={() => setConfirm("end")}>
                  <Square className="h-4 w-4" /> End
                </Button>
              )}
              {phase !== "ended" && (
                <Button variant="danger" onClick={() => setConfirm("emergency_stop")} className="border-danger bg-danger text-white hover:bg-danger/90">
                  <AlertOctagon className="h-4 w-4" /> Emergency stop
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="Teams" value={s.teams} sub={`${s.active_teams} active`} icon={<Users className="h-4 w-4" />} />
        <Stat label="Finished" value={s.finished} icon={<Flag className="h-4 w-4" />} accent="text-cyan" />
        <Stat label="Clues" value={s.clues} />
        <Link href="/admin/submissions">
          <Stat label="To review" value={s.pending_reviews} icon={<Camera className="h-4 w-4" />} accent={s.pending_reviews ? "text-amber" : "text-slate-100"} className="hover:border-amber/30" />
        </Link>
        <Stat label="Flagged" value={s.flagged_teams} accent={s.flagged_teams ? "text-danger" : "text-slate-100"} />
        <Link href="/admin/alerts">
          <Stat label="Unread alerts" value={s.unread_alerts} icon={<Bell className="h-4 w-4" />} className="hover:border-cyan/30" />
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader
            title="Live leaderboard"
            icon={<Trophy className="h-4 w-4" />}
            action={
              <Link href="/admin/leaderboard" className="text-xs text-cyan hover:underline">
                Full table →
              </Link>
            }
          />
          <LeaderboardTable rows={(lb.data?.rows ?? []).slice(0, 8)} admin />
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Live alerts"
              subtitle="Realtime feed"
              icon={<Bell className="h-4 w-4" />}
              action={
                <Link href="/admin/alerts" className="text-xs text-cyan hover:underline">
                  All →
                </Link>
              }
            />
            <ul className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {notifications.slice(0, 25).map((n) => (
                <li key={n.id} className={cn("rounded-xl border px-3 py-2", n.read ? "border-white/5" : "border-white/10 bg-white/[0.03]")}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-slate-200">{n.message}</p>
                    <Badge tone={statusTone[n.severity]}>{n.severity}</Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-600">{timeAgo(n.created_at, now)}</p>
                </li>
              ))}
              {notifications.length === 0 && <p className="text-sm text-slate-500">No alerts yet.</p>}
            </ul>
          </Card>

          {organiser && (
            <Card>
              <CardHeader title="Broadcast message" subtitle="Appears instantly on every team's screen" icon={<Megaphone className="h-4 w-4" />} />
              <div className="space-y-3">
                <Textarea value={broadcast.message} onChange={(e) => setBroadcast({ ...broadcast, message: e.target.value })} maxLength={500} placeholder="e.g. Clue 3 location updated — check your screen." />
                <div className="flex gap-2">
                  <Select value={broadcast.severity} onChange={(e) => setBroadcast({ ...broadcast, severity: e.target.value })} className="w-36">
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </Select>
                  <Button variant="primary" className="flex-1" onClick={send} loading={busy === "broadcast"}>
                    <Megaphone className="h-4 w-4" /> Send
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={confirm === "end"}
        onClose={() => setConfirm(null)}
        title="End the hunt?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => act("end")} loading={busy === "end"}>End event</Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">All submissions close immediately. You can still extend the event afterwards to reopen it.</p>
      </Modal>
      <Modal
        open={confirm === "emergency_stop"}
        onClose={() => setConfirm(null)}
        title="🛑 Emergency stop"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => act("emergency_stop", { message: emMsg })} loading={busy === "emergency_stop"}>Stop everything</Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">Pauses the hunt and pushes a critical alert to every participant.</p>
        <Field label="Message to participants" className="mt-4">
          <Input value={emMsg} onChange={(e) => setEmMsg(e.target.value)} placeholder="Stop where you are and return to the main gate." />
        </Field>
      </Modal>
    </div>
  );
}
