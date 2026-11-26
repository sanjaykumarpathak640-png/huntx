"use client";
import { useMemo, useState } from "react";
import { EyeOff, Map as MapIcon } from "lucide-react";
import { Badge, Card, Spinner, Switch, statusTone } from "@/components/ui";
import { HuntMap, type MapCircle, type MapDot, type MapMarker } from "@/components/map";
import { useAdminData } from "@/components/admin/admin-context";
import { cn, timeAgo } from "@/lib/utils";

interface MapData {
  clues: { id: string; order_index: number; title: string; target_lat: number; target_lng: number; radius_m: number; is_active: boolean }[];
  teams: {
    id: string;
    name: string;
    team_uid: string;
    status: string;
    flagged: boolean;
    warning_count: number;
    score: number;
    completed: number;
    current_clue: number | null;
    current_verified: boolean;
    last: { lat: number; lng: number; accuracy: number; at: string } | null;
  }[];
  verifications: { id: string; team_id: string; lat: number | null; lng: number | null; created_at: string; clues: { order_index: number } | null; teams: { name: string } }[];
  submissions: { id: string; team_id: string; lat: number | null; lng: number | null; status: string; created_at: string; clues: { order_index: number } | null; teams: { name: string } }[];
  privacy: { share_last_location: boolean; periodic_updates: boolean; retention_hours: number };
}

export default function LiveMapPage() {
  const { data, loading } = useAdminData<MapData>("/api/admin/map");
  const [layers, setLayers] = useState({ clues: true, teams: true, verifications: false, submissions: false });
  const [focus, setFocus] = useState<string | null>(null);

  const { markers, circles, dots } = useMemo(() => {
    const markers: MapMarker[] = [];
    const circles: MapCircle[] = [];
    const dots: MapDot[] = [];
    if (!data) return { markers, circles, dots };
    if (layers.clues)
      for (const c of data.clues)
        circles.push({
          id: c.id,
          lat: c.target_lat,
          lng: c.target_lng,
          radius: c.radius_m,
          color: c.is_active ? "#22d3ee" : "#475569",
          popup: <span>Clue #{c.order_index} · {c.title}<br />r = {c.radius_m} m</span>,
        });
    if (layers.teams)
      for (const t of data.teams) {
        if (!t.last || (focus && focus !== t.id)) continue;
        const color = t.status === "disqualified" ? "#ff4d6d" : t.flagged || t.warning_count >= 3 ? "#fbbf24" : t.status === "finished" ? "#22d3ee" : "#39ff88";
        markers.push({
          id: t.id,
          lat: t.last.lat,
          lng: t.last.lng,
          label: t.name,
          color,
          pulse: t.status === "active",
          popup: (
            <div className="text-xs">
              <b>{t.name}</b> ({t.team_uid})<br />
              Clue: {t.current_clue ?? "—"} {t.current_verified ? "✅" : ""}<br />
              Score: {t.score} · Warnings: {t.warning_count}<br />
              Last fix: {timeAgo(t.last.at)} (±{Math.round(t.last.accuracy ?? 0)} m)<br />
              Status: {t.status}
            </div>
          ),
        });
      }
    if (layers.verifications)
      for (const v of data.verifications)
        if (v.lat != null && v.lng != null && (!focus || focus === v.team_id))
          dots.push({ id: v.id, lat: v.lat, lng: v.lng, color: "#39ff88", popup: <span>📍 {v.teams.name} · clue {v.clues?.order_index} · {timeAgo(v.created_at)}</span> });
    if (layers.submissions)
      for (const s of data.submissions)
        if (s.lat != null && s.lng != null && (!focus || focus === s.team_id))
          dots.push({ id: `s${s.id}`, lat: s.lat, lng: s.lng, color: "#fbbf24", popup: <span>📸 {s.teams.name} · clue {s.clues?.order_index} · {s.status}</span> });
    return { markers, circles, dots };
  }, [data, layers, focus]);

  if (loading && !data) return <div className="grid h-64 place-items-center"><Spinner /></div>;

  return (
    <div className="space-y-5">
      <div>
        <p className="hud-label">Situational awareness</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-white">Live campus map</h1>
        <p className="mt-1 text-xs text-slate-500">
          Team positions come from GPS verifications{data?.privacy.periodic_updates ? " and opt-in periodic updates" : ""}. No continuous tracking. Location data retention: {data?.privacy.retention_hours} h.
        </p>
      </div>
      {!data?.privacy.share_last_location && (
        <Card className="flex items-center gap-2 border-amber/30 text-sm text-amber">
          <EyeOff className="h-4 w-4" /> Last-location display is disabled in Event Settings (privacy mode).
        </Card>
      )}
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-4 rounded-xl border border-white/10 p-3">
            {(Object.keys(layers) as (keyof typeof layers)[]).map((k) => (
              <Switch key={k} checked={layers[k]} onChange={(v) => setLayers({ ...layers, [k]: v })} label={k[0].toUpperCase() + k.slice(1)} />
            ))}
          </div>
          <HuntMap height="min(70vh, 640px)" markers={markers} circles={circles} dots={dots} />
        </div>
        <Card className="max-h-[75vh] overflow-y-auto p-3">
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="hud-label">Teams ({data?.teams.length ?? 0})</p>
            {focus && <button onClick={() => setFocus(null)} className="text-xs text-cyan">Show all</button>}
          </div>
          <ul className="space-y-1">
            {(data?.teams ?? [])
              .slice()
              .sort((a, b) => b.score - a.score)
              .map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setFocus(focus === t.id ? null : t.id)}
                    className={cn("w-full rounded-xl px-3 py-2 text-left transition hover:bg-white/[0.04]", focus === t.id && "bg-neon/10")}
                  >
                    <div className="flex items-center justify-between">
                      <span className="truncate text-sm font-semibold text-slate-200">{t.name}</span>
                      <span className="font-mono text-xs text-neon">{t.score}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                      <Badge tone={statusTone[t.status]}>{t.status}</Badge>
                      {t.current_clue && <span>clue {t.current_clue}{t.current_verified ? " ✓" : ""}</span>}
                      {t.warning_count > 0 && <span className="text-amber">⚠ {t.warning_count}</span>}
                      {!t.last && <span className="flex items-center gap-1"><MapIcon className="h-3 w-3" /> no fix</span>}
                      {t.last && <span>{timeAgo(t.last.at)}</span>}
                    </div>
                  </button>
                </li>
              ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
