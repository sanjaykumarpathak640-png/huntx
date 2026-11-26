"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Crosshair, Map as MapIcon, Navigation, ShieldAlert } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { HuntMap, type MapCircle, type MapMarker } from "@/components/map";
import { useToast } from "@/components/toast";
import { getPosition } from "@/hooks/use-online";
import { api, cn } from "@/lib/utils";
import type { TeamState } from "@/lib/types";
import type { CapturePosition } from "./camera-capture";

interface VerifyResult {
  verified: boolean;
  distance_m?: number;
  accuracy_m?: number;
  accuracy_ok?: boolean;
  attempts_used?: number;
  attempts_max?: number;
  retry_after_s?: number;
  message: string;
}

export function VerifyPanel({
  current,
  maxAccuracy,
  disabled,
  suspendAntiCheat,
  onPosition,
  onDone,
}: {
  current: NonNullable<TeamState["current"]>;
  maxAccuracy: number;
  disabled: boolean;
  suspendAntiCheat: (ms?: number) => void;
  onPosition: (p: CapturePosition) => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [pos, setPos] = useState<CapturePosition | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [showMap, setShowMap] = useState(false);
  const verified = current.location_verified;
  const exhausted = current.gps_max_attempts > 0 && current.gps_attempts >= current.gps_max_attempts && !verified;

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  useEffect(() => setResult(null), [current.clue.id]);

  async function verify() {
    setBusy(true);
    suspendAntiCheat(25000); // GPS permission prompt can blur the page
    try {
      const p = await getPosition();
      const position = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
      setPos(position);
      onPosition(position);
      const r = await api<VerifyResult>("/api/team/verify-location", {
        method: "POST",
        body: JSON.stringify({ ...position, timestamp: p.timestamp }),
      });
      setResult(r);
      if (r.verified) toast({ kind: "success", title: "📍 Location verified", body: "Open the camera to capture your shot." });
      else setCooldown(r.retry_after_s ?? 15);
      onDone();
    } catch (e) {
      const err = e as Error & { data?: { retry_after_s?: number } };
      if (err.data?.retry_after_s) setCooldown(err.data.retry_after_s);
      toast({ kind: "error", title: "Verification failed", body: err.message });
    } finally {
      setBusy(false);
    }
  }

  const markers: MapMarker[] = pos ? [{ id: "me", lat: pos.lat, lng: pos.lng, label: "You", color: "#22d3ee", pulse: true }] : [];
  const circles: MapCircle[] = [];
  if (pos) circles.push({ id: "acc", lat: pos.lat, lng: pos.lng, radius: Math.max(pos.accuracy, 3), color: "#22d3ee", dashed: true });
  if (current.zone)
    circles.push({
      id: "zone",
      lat: current.zone.lat,
      lng: current.zone.lng,
      radius: current.zone.radius_m,
      color: current.zone.exact ? "#39ff88" : "#fbbf24",
      dashed: !current.zone.exact,
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {verified ? (
          <Badge tone="neon" dot>
            Verified
          </Badge>
        ) : (
          <Badge tone="amber" dot>
            Not verified
          </Badge>
        )}
        <span className="text-xs text-slate-500">
          Geofence {current.clue.radius_m} m · need accuracy ≤ {maxAccuracy} m
          {current.gps_max_attempts > 0 && ` · attempts ${current.gps_attempts}/${current.gps_max_attempts}`}
        </span>
      </div>

      {!verified && (
        <Button
          variant="cyan"
          size="lg"
          className="w-full"
          onClick={verify}
          loading={busy}
          disabled={disabled || cooldown > 0 || exhausted}
        >
          <Crosshair className="h-5 w-5" />
          {exhausted ? "Attempts exhausted" : cooldown > 0 ? `Retry in ${cooldown}s` : "Verify Location"}
        </Button>
      )}

      {result && !result.verified && (
        <div className="rounded-xl border border-amber/30 bg-amber/5 p-3">
          <div className="flex items-start gap-2 text-sm text-amber">
            <Navigation className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{result.message}</p>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center font-mono text-xs">
            <div className="rounded-lg bg-black/30 p-2">
              <p className="text-slate-500">DIST</p>
              <p className="text-slate-100">{result.distance_m ?? "—"} m</p>
            </div>
            <div className="rounded-lg bg-black/30 p-2">
              <p className="text-slate-500">ACC</p>
              <p className={cn(result.accuracy_ok ? "text-neon" : "text-danger")}>±{result.accuracy_m ?? "—"} m</p>
            </div>
            <div className="rounded-lg bg-black/30 p-2">
              <p className="text-slate-500">TRIES</p>
              <p className="text-slate-100">
                {result.attempts_used}
                {result.attempts_max ? `/${result.attempts_max}` : ""}
              </p>
            </div>
          </div>
        </div>
      )}
      {verified && (
        <div className="flex items-center gap-2 rounded-xl border border-neon/30 bg-neon/5 p-3 text-sm text-neon">
          <CheckCircle2 className="h-4 w-4" /> You&apos;re inside the zone. Capture the photo next.
        </div>
      )}
      {exhausted && (
        <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
          <ShieldAlert className="h-4 w-4" /> GPS attempts used up. Find an organiser to reset them.
        </div>
      )}

      {(pos || current.zone) && (
        <div>
          <button onClick={() => setShowMap((s) => !s)} className="inline-flex items-center gap-1.5 text-xs text-cyan hover:underline">
            <MapIcon className="h-3.5 w-3.5" /> {showMap ? "Hide map" : current.zone && !current.zone.exact ? "Show search zone" : "Show map"}
          </button>
          {showMap && (
            <div className="mt-2">
              <HuntMap markers={markers} circles={circles} height={260} />
              {current.zone && !current.zone.exact && (
                <p className="mt-1.5 text-[11px] text-slate-500">The yellow circle is an approximate search zone — the target is somewhere inside it.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
