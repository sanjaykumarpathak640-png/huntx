"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  Camera,
  CheckCircle2,
  Clock,
  Expand,
  Flag,
  Hourglass,
  Languages,
  Lightbulb,
  LogOut,
  Megaphone,
  Pause,
  Radio,
  RotateCcw,
  Shield,
  Trophy,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, Logo, Modal, Spinner, Stat, Switch, statusTone } from "@/components/ui";
import { useToast } from "@/components/toast";
import { ProgressTrack } from "@/components/hunt/progress-track";
import { VerifyPanel } from "@/components/hunt/verify-panel";
import { CameraCapture, type CapturePosition } from "@/components/hunt/camera-capture";
import { useServerNow } from "@/hooks/use-server-clock";
import { useAntiCheat } from "@/hooks/use-anticheat";
import { getPosition, useOnline } from "@/hooks/use-online";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { api, cn, fmtTime, formatDays, formatDuration, timeAgo } from "@/lib/utils";
import type { TeamState } from "@/lib/types";

const DIFF_TONE = { easy: "neon", medium: "cyan", hard: "amber", insane: "danger" } as const;

export function HuntApp() {
  const router = useRouter();
  const toast = useToast();
  const online = useOnline();
  const [state, setState] = useState<TeamState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rt, setRt] = useState<"connecting" | "live" | "off">("connecting");
  const [warning, setWarning] = useState<{ count: number; threshold: number; locked?: boolean } | null>(null);
  const [camera, setCamera] = useState<{ id: string; number: number; title: string; verified: boolean } | null>(null);
  const [position, setPosition] = useState<CapturePosition | null>(null);
  const [showAlt, setShowAlt] = useState(false);
  const [hintConfirm, setHintConfirm] = useState(false);
  const [hintBusy, setHintBusy] = useState(false);
  const [dismissedAnn, setDismissedAnn] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const loadingRef = useRef(false);
  const warnedRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const s = await api<TeamState>("/api/team/state");
      setState(s);
      setLoadError(null);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 401) router.replace("/join");
      else setLoadError(err.message);
    } finally {
      loadingRef.current = false;
    }
  }, [router]);

  // initial + polling fallback
  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  // realtime: own team rows + announcements (RLS-scoped)
  const teamId = state?.team.id;
  const eventId = state?.event.id;
  useEffect(() => {
    if (!teamId || !eventId) return;
    const sb = getBrowserSupabase();
    let t: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (t) clearTimeout(t);
      t = setTimeout(load, 400);
    };
    const ch = sb
      .channel(`team-${teamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "teams", filter: `id=eq.${teamId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "team_progress", filter: `team_id=eq.${teamId}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "photo_submissions", filter: `team_id=eq.${teamId}` }, bump)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "announcements", filter: `event_id=eq.${eventId}` }, (p) => {
        const a = p.new as { message: string; severity: string };
        toast({ kind: a.severity === "critical" ? "error" : a.severity === "warning" ? "warning" : "info", title: "📣 Organisers", body: a.message });
        bump();
      })
      .subscribe((status) => setRt(status === "SUBSCRIBED" ? "live" : status === "CLOSED" || status === "CHANNEL_ERROR" ? "off" : "connecting"));
    return () => {
      if (t) clearTimeout(t);
      sb.removeChannel(ch);
    };
  }, [teamId, eventId, load, toast]);

  const now = useServerNow(1000, state?.serverNow);
  const phase = useMemo(() => {
    if (!state) return null;
    const p = state.event.phase;
    if (p === "upcoming" && now >= Date.parse(state.event.start_at)) return "live";
    if (p === "live" && now >= Date.parse(state.event.end_at)) return "ended";
    return p;
  }, [state, now]);

  // phase boundary → refresh from server (unlock first clue, close submissions)
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (lastPhase.current && phase && lastPhase.current !== phase) load();
    lastPhase.current = phase;
  }, [phase, load]);

  const huntActive = phase === "live" && state?.team.status === "active";
  const { suspend } = useAntiCheat({
    enabled: Boolean(state?.config.anticheat_enabled && huntActive),
    fullscreenMode: Boolean(state?.config.fullscreen_mode),
    onWarning: (r) => {
      setWarning({ count: r.warning_count, threshold: r.threshold, locked: r.locked });
      setState((s) => (s ? { ...s, team: { ...s.team, warning_count: r.warning_count } } : s));
    },
  });

  // fullscreen tracking
  useEffect(() => {
    const f = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);

  // optional periodic location sharing (only with consent + organiser enabled)
  const sharing = Boolean(state?.config.periodic_updates && state?.team.location_sharing && huntActive);
  const interval = state?.config.periodic_interval_seconds ?? 120;
  useEffect(() => {
    if (!sharing) return;
    const ping = async () => {
      try {
        const p = await getPosition(15000);
        await api("/api/team/location", {
          method: "POST",
          body: JSON.stringify({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        });
      } catch {
        /* ignore */
      }
    };
    suspend(15000);
    ping();
    const id = setInterval(ping, interval * 1000);
    return () => clearInterval(id);
  }, [sharing, interval, suspend]);

  // time warnings
  const eventRemaining = state
    ? phase === "live"
      ? Date.parse(state.event.end_at) - now
      : phase === "paused"
        ? state.event.remaining_ms
        : phase === "upcoming"
          ? Date.parse(state.event.start_at) - now
          : 0
    : 0;
  const clueRemaining = state?.current?.deadline_at && phase === "live" ? Date.parse(state.current.deadline_at) - now : null;
  const activeClueId = state?.current?.clue.id;
  useEffect(() => {
    if (phase !== "live") return;
    const marks: [string, boolean, string][] = [
      ["ev10", eventRemaining < 10 * 60_000 && eventRemaining > 9 * 60_000, "10 minutes left in the hunt!"],
      ["ev2", eventRemaining < 2 * 60_000 && eventRemaining > 60_000, "2 minutes left in the hunt!"],
      [`cl5-${activeClueId}`, clueRemaining != null && clueRemaining < 5 * 60_000 && clueRemaining > 4 * 60_000, "5 minutes left for this clue."],
      [`cl1-${activeClueId}`, clueRemaining != null && clueRemaining < 60_000 && clueRemaining > 0, "1 minute left for this clue!"],
    ];
    for (const [k, cond, msg] of marks) {
      if (cond && !warnedRef.current.has(k)) {
        warnedRef.current.add(k);
        toast({ kind: "warning", title: "⏳ Time running low", body: msg });
      }
    }
  }, [eventRemaining, clueRemaining, phase, activeClueId, toast]);

  useEffect(() => {
    if (clueRemaining != null && clueRemaining <= 0 && clueRemaining > -2000) load();
  }, [clueRemaining, load]);

  async function revealHint() {
    setHintBusy(true);
    try {
      await api("/api/team/hint", { method: "POST" });
      setHintConfirm(false);
      await load();
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
    } finally {
      setHintBusy(false);
    }
  }

  async function toggleSharing(v: boolean) {
    try {
      if (v) {
        suspend(20000);
        await getPosition(15000); // ask permission upfront
      }
      await api("/api/team/location", { method: "PATCH", body: JSON.stringify({ location_sharing: v }) });
      load();
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/");
    router.refresh();
  }

  function enterFullscreen() {
    document.documentElement.requestFullscreen?.().catch(() => toast({ kind: "warning", title: "Fullscreen not supported on this browser" }));
  }

  if (!state) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="text-center">
          <Spinner className="mx-auto h-8 w-8" />
          <p className="mt-3 text-sm text-slate-500">{loadError ?? "Loading your mission…"}</p>
          {loadError && (
            <Button className="mt-4" onClick={load}>
              Retry
            </Button>
          )}
        </div>
      </div>
    );
  }

  const { team, current, config, stats } = state;
  const latestAnn = state.announcements[0];
  const showAnn = latestAnn && latestAnn.id !== dismissedAnn && Date.now() - Date.parse(latestAnn.created_at) < 60 * 60_000;
  const lowTime = phase === "live" && eventRemaining < 10 * 60_000;
  const photoBlocked =
    !current ||
    !huntActive ||
    team.submissions_locked ||
    (config.require_gps_before_photo && !current.location_verified) ||
    (current.submission && ["pending", "approved", "flagged"].includes(current.submission.status));

  return (
    <div className="min-h-dvh pb-16">
      {/* top bar */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <Link href="/">
            <Logo className="text-base" />
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-wider",
                !online ? "border-danger/40 text-danger" : rt === "live" ? "border-neon/30 text-neon" : "border-amber/30 text-amber",
              )}
              title="Connection status"
            >
              {!online ? <WifiOff className="h-3 w-3" /> : <Radio className="h-3 w-3" />}
              {!online ? "Offline" : rt === "live" ? "Live" : "Sync"}
            </span>
            {config.fullscreen_mode && !isFullscreen && (
              <Button size="sm" variant="ghost" onClick={enterFullscreen} aria-label="Enter fullscreen">
                <Expand className="h-4 w-4" />
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={logout} aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {!online && (
        <div className="bg-danger/15 px-4 py-2 text-center text-xs text-danger">You are offline. Timers keep running — reconnect to verify or submit.</div>
      )}

      <main className="mx-auto max-w-5xl space-y-4 px-4 pt-4">
        {showAnn && (
          <div
            className={cn(
              "flex items-start gap-3 rounded-2xl border p-4",
              latestAnn.severity === "critical" ? "border-danger/50 bg-danger/15 text-danger" : latestAnn.severity === "warning" ? "border-amber/40 bg-amber/10 text-amber" : "border-cyan/30 bg-cyan/10 text-cyan",
            )}
          >
            <Megaphone className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold">{latestAnn.message}</p>
              <p className="mt-0.5 text-[11px] opacity-70">{timeAgo(latestAnn.created_at, now)}</p>
            </div>
            <button onClick={() => setDismissedAnn(latestAnn.id)} aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {config.fullscreen_mode && !isFullscreen && huntActive && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-cyan/30 bg-cyan/5 p-3 text-sm text-cyan">
            <span>Fullscreen hunt mode is required. Exiting fullscreen is recorded.</span>
            <Button size="sm" variant="cyan" onClick={enterFullscreen}>
              <Expand className="h-4 w-4" /> Enter
            </Button>
          </div>
        )}

        {/* identity + event timer */}
        <section className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <Card className="relative overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="hud-label">Team</p>
                <h1 className="mt-1 truncate font-display text-2xl font-bold text-white">{team.name}</h1>
                <p className="mt-1 font-mono text-xs text-slate-500">
                  {team.team_uid} · code <span className="text-cyan">{team.join_code}</span>
                </p>
              </div>
              <Badge tone={statusTone[team.status]} dot>
                {team.status}
              </Badge>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
              <Users className="h-3.5 w-3.5" /> {team.members.join(", ")}
            </p>
            {team.flagged && <p className="mt-2 text-xs text-amber">⚠️ Your team is under organiser review.</p>}
            {team.submissions_locked && <p className="mt-2 text-xs text-danger">🔒 Submissions are locked. Contact an organiser.</p>}
          </Card>

          <Card className={cn("relative overflow-hidden", lowTime && "border-danger/40")}>
            <div className="flex items-center justify-between">
              <p className="hud-label">{phase === "upcoming" ? "Hunt starts in" : phase === "paused" ? "Paused · time left" : phase === "ended" ? "Hunt over" : "Event time remaining"}</p>
              <Badge tone={statusTone[phase ?? "draft"]} dot className={phase === "live" ? "animate-pulse" : ""}>
                {phase}
              </Badge>
            </div>
            <p className={cn("mt-2 font-mono text-5xl font-bold tabular-nums tracking-tight", lowTime ? "animate-pulse text-danger" : phase === "paused" ? "text-amber" : "text-white")}>
              {phase === "ended" ? "00:00:00" : formatDays(eventRemaining)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {state.event.name} · ends {new Date(state.event.end_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} (server time)
            </p>
          </Card>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Rank" value={stats.rank ? `#${stats.rank}` : "—"} sub={`of ${stats.teams} teams`} icon={<Trophy className="h-4 w-4" />} accent="text-amber" />
          <Stat label="Score" value={stats.score} sub="points" accent="text-neon" />
          <Stat label="Clues" value={`${stats.completed}/${stats.total_clues}`} sub={`${Math.max(0, stats.total_clues - stats.completed)} remaining`} />
          <Stat
            label="Warnings"
            value={`${team.warning_count}/${config.warning_threshold}`}
            sub="tab-switch"
            icon={<Shield className="h-4 w-4" />}
            accent={team.warning_count >= config.warning_threshold ? "text-danger" : team.warning_count > 0 ? "text-amber" : "text-slate-100"}
          />
        </section>

        <ProgressTrack track={state.track} finished={state.finished} />

        {/* MAIN STATE */}
        {state.finished ? (
          <Card className="text-center">
            <Flag className="mx-auto h-10 w-10 text-amber" />
            <h2 className="mt-3 font-display text-2xl font-bold text-white">You crossed the finish line!</h2>
            <Link href="/hunt/finish" className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-neon px-5 font-semibold text-ink-950">
              View results
            </Link>
          </Card>
        ) : team.status === "disqualified" ? (
          <Card className="border-danger/40 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-danger" />
            <h2 className="mt-3 font-display text-xl font-bold text-white">Your team has been disqualified</h2>
            <p className="mt-1 text-sm text-slate-400">Please contact the organisers.</p>
          </Card>
        ) : team.status === "disabled" ? (
          <Card className="text-center">
            <h2 className="font-display text-xl font-bold text-white">Team disabled</h2>
            <p className="mt-1 text-sm text-slate-400">The organisers have disabled this team account.</p>
          </Card>
        ) : phase === "upcoming" || phase === "draft" ? (
          <Card className="text-center">
            <Hourglass className="mx-auto h-10 w-10 text-cyan" />
            <h2 className="mt-3 font-display text-xl font-bold text-white">Standby, explorer</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">Your first clue unlocks automatically when the hunt starts. Charge your phone and enable location services.</p>
          </Card>
        ) : phase === "paused" ? (
          <Card className="border-amber/40 text-center">
            <Pause className="mx-auto h-10 w-10 text-amber" />
            <h2 className="mt-3 font-display text-xl font-bold text-white">Hunt paused</h2>
            <p className="mt-1 text-sm text-slate-400">Timers are frozen. Wait for the organisers to resume.</p>
          </Card>
        ) : phase === "ended" ? (
          <Card className="text-center">
            <Flag className="mx-auto h-10 w-10 text-slate-400" />
            <h2 className="mt-3 font-display text-xl font-bold text-white">The hunt has ended</h2>
            <p className="mt-1 text-sm text-slate-400">Submissions are closed. Check the leaderboard for results.</p>
            <Link href="/leaderboard" className="mt-4 inline-flex text-sm text-cyan hover:underline">
              Open leaderboard →
            </Link>
          </Card>
        ) : current ? (
          <section className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
            {/* clue */}
            <Card className="relative overflow-hidden border-cyan/20">
              <div className="pointer-events-none absolute -right-10 -top-10 font-mono text-[140px] font-bold leading-none text-white/[0.03]">
                {String(current.clue.number).padStart(2, "0")}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="cyan">Clue {current.clue.number}</Badge>
                <Badge tone={DIFF_TONE[current.clue.difficulty as keyof typeof DIFF_TONE] ?? "slate"}>{current.clue.difficulty}</Badge>
                <Badge tone="slate">{current.clue.points} pts</Badge>
              </div>
              <h2 className="mt-3 font-display text-2xl font-bold text-white">{current.clue.title}</h2>
              <blockquote className="mt-4 border-l-2 border-neon/60 pl-4 text-lg leading-relaxed text-slate-200">
                {showAlt && current.clue.body_alt ? current.clue.body_alt : current.clue.body}
              </blockquote>
              {current.clue.image_url && (
                <a href={current.clue.image_url} target="_blank" rel="noreferrer" className="mt-4 block overflow-hidden rounded-xl border border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={current.clue.image_url} alt="Challenge image" className="max-h-72 w-full object-cover" />
                </a>
              )}
              {current.clue.body_alt && (
                <button onClick={() => setShowAlt((s) => !s)} className="mt-3 inline-flex items-center gap-1.5 text-xs text-cyan hover:underline">
                  <Languages className="h-3.5 w-3.5" /> {showAlt ? "Show original" : current.clue.language === "hi" ? "Show English" : "हिंदी में देखें"}
                </button>
              )}

              {clueRemaining != null && (
                <div
                  className={cn(
                    "mt-5 flex items-center justify-between rounded-xl border px-4 py-3",
                    clueRemaining <= 0 ? "border-danger/40 bg-danger/10" : clueRemaining < 5 * 60_000 ? "border-amber/40 bg-amber/10" : "border-white/10 bg-white/[0.03]",
                  )}
                >
                  <span className="flex items-center gap-2 text-xs text-slate-400">
                    <Clock className="h-4 w-4" /> Clue timer
                  </span>
                  <span
                    className={cn(
                      "font-mono text-2xl font-bold tabular-nums",
                      clueRemaining <= 0 ? "text-danger" : clueRemaining < 60_000 ? "animate-pulse text-danger" : clueRemaining < 5 * 60_000 ? "text-amber" : "text-white",
                    )}
                  >
                    {clueRemaining <= 0 ? "LATE" : formatDuration(clueRemaining)}
                  </span>
                </div>
              )}

              <div className="mt-5 border-t border-white/5 pt-4">
                {current.clue.hint ? (
                  <div className="rounded-xl border border-amber/30 bg-amber/5 p-3 text-sm text-amber">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
                      <Lightbulb className="h-3.5 w-3.5" /> Hint
                    </p>
                    <p className="mt-1 text-slate-200">{current.clue.hint}</p>
                  </div>
                ) : current.clue.has_hint ? (
                  <Button variant="ghost" size="sm" onClick={() => setHintConfirm(true)}>
                    <Lightbulb className="h-4 w-4 text-amber" /> Use hint (−{current.clue.hint_penalty} pts)
                  </Button>
                ) : (
                  <p className="text-xs text-slate-600">No hint for this clue.</p>
                )}
              </div>
            </Card>

            {/* mission steps */}
            <div className="space-y-4">
              <Card>
                <CardHeader title="1 · Verify location" subtitle="Reach the spot, then tap verify." icon={<CheckCircle2 className="h-4 w-4" />} />
                <VerifyPanel
                  current={current}
                  maxAccuracy={config.max_accuracy_m}
                  disabled={!huntActive || !online}
                  suspendAntiCheat={suspend}
                  onPosition={setPosition}
                  onDone={load}
                />
              </Card>

              {current.clue.photo_required && (
                <Card>
                  <CardHeader title="2 · Capture photo" subtitle={config.require_gps_before_photo ? "Unlocks after GPS verification." : "Shoot it live with the HuntX camera."} icon={<Camera className="h-4 w-4" />} />
                  {current.submission && (
                    <div className="mb-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
                      <span className="text-slate-400">Last submission · {timeAgo(current.submission.created_at, now)}</span>
                      <Badge tone={statusTone[current.submission.status]}>{current.submission.status.replace("_", " ")}</Badge>
                    </div>
                  )}
                  {current.submission?.comment && <p className="mb-3 text-xs text-slate-400">Organiser: “{current.submission.comment}”</p>}
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    disabled={Boolean(photoBlocked) || !online}
                    onClick={() =>
                      setCamera({ id: current.clue.id, number: current.clue.number, title: current.clue.title, verified: current.location_verified })
                    }
                  >
                    <Camera className="h-5 w-5" />
                    {current.submission?.status === "retake_requested" || current.submission?.status === "rejected" ? "Retake photo" : "Open camera"}
                  </Button>
                  {config.require_gps_before_photo && !current.location_verified && <p className="mt-2 text-center text-xs text-slate-500">Verify your location first.</p>}
                </Card>
              )}

              {current.awaiting === "approval" && (
                <Card className="border-violet-400/30 text-sm text-violet-200">⏳ Waiting for organiser approval to unlock the next clue.</Card>
              )}
              {current.awaiting === "organiser" && (
                <Card className="border-violet-400/30 text-sm text-violet-200">🔐 The organisers will unlock the next clue for you.</Card>
              )}
            </div>
          </section>
        ) : (
          <Card className="text-center">
            <Spinner className="mx-auto" />
            <p className="mt-2 text-sm text-slate-400">Preparing your next clue…</p>
          </Card>
        )}

        {/* retakes */}
        {state.retakes.length > 0 && huntActive && (
          <Card className="border-violet-400/30">
            <CardHeader title="Retakes requested" subtitle="The organisers asked for another photo." icon={<RotateCcw className="h-4 w-4" />} />
            <div className="space-y-2">
              {state.retakes.map((r) => (
                <div key={r.clue_id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 p-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-200">
                      Clue {r.number} · {r.title}
                    </p>
                    {r.comment && <p className="truncate text-xs text-slate-500">“{r.comment}”</p>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setCamera({ id: r.clue_id, number: r.number, title: r.title, verified: true })} disabled={team.submissions_locked}>
                    <Camera className="h-4 w-4" /> Retake
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Submission history" icon={<Camera className="h-4 w-4" />} />
            {state.history.length === 0 ? (
              <p className="text-sm text-slate-500">No submissions yet.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {state.history.map((h, i) => (
                  <li key={i} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="text-slate-300">
                      Clue {h.clue_number} · <span className="text-slate-500">{h.title}</span>
                      {h.is_late && <span className="ml-1 text-xs text-amber">(late)</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="hidden text-xs text-slate-600 sm:inline">{fmtTime(h.created_at)}</span>
                      <Badge tone={statusTone[h.status]}>{h.status.replace("_", " ")}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Rules & privacy" icon={<BookOpen className="h-4 w-4" />} />
            <ul className="space-y-2 text-sm text-slate-400">
              {(state.event.rules.length ? state.event.rules : ["Follow organiser instructions at all times."]).map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-mono text-xs text-neon">{String(i + 1).padStart(2, "0")}</span>
                  {r}
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-slate-500">
              We record when you leave this page (tab switch / focus loss{config.fullscreen_mode ? " / fullscreen exit" : ""}). Location is read only when you tap Verify
              {config.periodic_updates ? " or if your team enables sharing below" : ""}. The camera runs only on the capture screen.
            </div>
            {config.periodic_updates && (
              <div className="mt-4">
                <Switch
                  checked={team.location_sharing}
                  onChange={toggleSharing}
                  label="Share live location with organisers"
                  description={`Sends your position every ${Math.round(interval / 60)} min while the hunt is live. Turn off any time.`}
                />
              </div>
            )}
          </Card>
        </section>
      </main>

      {/* modals */}
      {camera && (
        <CameraCapture
          open
          onClose={() => setCamera(null)}
          clue={camera}
          verified={camera.verified}
          position={position}
          allowGallery={config.allow_gallery_upload}
          maxSizeMb={config.max_size_mb}
          suspendAntiCheat={suspend}
          onSubmitted={load}
        />
      )}

      <Modal
        open={Boolean(warning)}
        onClose={() => setWarning(null)}
        title="⚠️ Fair-play warning"
        footer={
          <Button variant="primary" onClick={() => setWarning(null)}>
            Back to the hunt
          </Button>
        }
      >
        {warning && (
          <div className="space-y-3">
            <p className="text-lg font-semibold text-amber">
              ⚠️ Warning {warning.count}/{warning.threshold}: Leaving the active hunt screen has been recorded.
            </p>
            <p className="text-sm text-slate-400">
              The organisers can see this event. Repeated warnings may cost points and flag your team for review.
              {warning.locked && " Your submissions have been locked — contact an organiser."}
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={hintConfirm}
        onClose={() => setHintConfirm(false)}
        title="Use the hint?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setHintConfirm(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={revealHint} loading={hintBusy}>
              Reveal hint
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">
          Revealing the hint costs <b className="text-amber">{current?.clue.hint_penalty ?? 0} points</b>. This can&apos;t be undone.
        </p>
      </Modal>
    </div>
  );
}
