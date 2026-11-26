"use client";
import { useState } from "react";
import { Camera, Check, Download, Flag, ImageOff, MapPin, RotateCcw, X } from "lucide-react";
import { Badge, Button, Card, Empty, Field, Input, Modal, Spinner, Textarea, statusTone } from "@/components/ui";
import { HuntMap } from "@/components/map";
import { useToast } from "@/components/toast";
import { useAdmin, useAdminData } from "@/components/admin/admin-context";
import { api, cn, fmtTime } from "@/lib/utils";
import type { SubmissionRow } from "@/lib/types";

type Sub = SubmissionRow & {
  url: string | null;
  reviewed_at: string | null;
  teams: { id: string; name: string; team_uid: string };
  clues: { order_index: number; title: string; points: number; radius_m: number } | null;
};

const FILTERS = ["pending", "flagged", "approved", "retake_requested", "rejected", "all"] as const;

export default function SubmissionsPage() {
  const { can } = useAdmin();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("pending");
  const { data, loading, reload } = useAdminData<{ submissions: Sub[] }>(`/api/admin/submissions${filter === "all" ? "" : `?status=${filter}`}`, [filter]);
  const [open, setOpen] = useState<Sub | null>(null);
  const subs = data?.submissions ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hud-label">Manual verification</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-white">Photo submissions</h1>
          <p className="mt-1 text-xs text-slate-500">Metadata helps, but never proves a photo is genuine — always review the image itself.</p>
        </div>
        {can("organiser") && (
          <div className="flex gap-2">
            <a href="/api/admin/photos?status=approved" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-sm text-slate-300 hover:bg-white/5">
              <Download className="h-4 w-4" /> Approved (.zip)
            </a>
            <a href="/api/admin/photos?status=all" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-sm text-slate-300 hover:bg-white/5">
              <Download className="h-4 w-4" /> All (.zip)
            </a>
          </div>
        )}
      </div>

      <div className="flex flex-wrap rounded-xl border border-white/10 p-1 text-xs">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cn("rounded-lg px-3 py-1.5 capitalize", filter === f ? "bg-white/10 text-white" : "text-slate-500")}>
            {f.replace("_", " ")}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="grid h-40 place-items-center"><Spinner /></div>
      ) : subs.length === 0 ? (
        <Empty icon={<Camera className="h-10 w-10" />} title={`No ${filter.replace("_", " ")} submissions`} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {subs.map((s) => (
            <button key={s.id} onClick={() => setOpen(s)} className="glass group overflow-hidden text-left transition hover:border-neon/30">
              <div className="relative aspect-[4/3] bg-ink-900">
                {s.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.url} alt={`Clue ${s.clues?.order_index} by ${s.teams.name}`} className="h-full w-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />
                ) : (
                  <div className="grid h-full place-items-center text-slate-600"><ImageOff className="h-8 w-8" /></div>
                )}
                <div className="absolute left-2 top-2 flex gap-1">
                  <Badge tone={statusTone[s.status]} className="bg-ink-950/80">{s.status.replace("_", " ")}</Badge>
                  {s.is_late && <Badge tone="amber" className="bg-ink-950/80">late</Badge>}
                </div>
                {s.flag_reasons.length > 0 && (
                  <span className="absolute right-2 top-2 rounded-full bg-danger p-1 text-white"><Flag className="h-3 w-3" /></span>
                )}
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-semibold text-slate-100">{s.teams.name}</p>
                <p className="truncate text-xs text-slate-500">Clue {s.clues?.order_index} · {s.clues?.title}</p>
                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                  <span>{fmtTime(s.created_at)}</span>
                  {s.location_verified ? <span className="text-neon">GPS ✓</span> : <span className="text-amber">GPS ✗</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && <ReviewModal sub={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); reload(); }} />}
    </div>
  );
}

function ReviewModal({ sub, onClose, onDone }: { sub: Sub; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [comment, setComment] = useState(sub.admin_comment ?? "");
  const [points, setPoints] = useState<number>(sub.points_awarded ?? sub.clues?.points ?? 100);
  const [busy, setBusy] = useState<string | null>(null);

  async function review(status: string) {
    setBusy(status);
    try {
      await api(`/api/admin/submissions/${sub.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, comment: comment || undefined, ...(status === "approved" ? { points } : {}) }),
      });
      toast({ kind: "success", title: `Marked ${status.replace("_", " ")}` });
      onDone();
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const rows: [string, React.ReactNode][] = [
    ["Team", `${sub.teams.name} (${sub.teams.team_uid})`],
    ["Clue", `#${sub.clues?.order_index} · ${sub.clues?.title}`],
    ["Captured (device)", fmtTime(sub.captured_at)],
    ["Submitted (server)", fmtTime(sub.created_at)],
    ["Source", sub.source === "camera" ? "Live camera" : <span className="text-amber">Device upload</span>],
    ["Location verified", sub.location_verified ? <span className="text-neon">Yes</span> : <span className="text-amber">No</span>],
    ["GPS", sub.lat != null ? `${sub.lat.toFixed(5)}, ${sub.lng?.toFixed(5)} (±${Math.round(sub.accuracy ?? 0)} m)` : "—"],
    ["Late", sub.is_late ? <span className="text-amber">Yes</span> : "No"],
    ["Status", <Badge key="s" tone={statusTone[sub.status]}>{sub.status.replace("_", " ")}</Badge>],
  ];

  return (
    <Modal open onClose={onClose} wide title="Review photo">
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          {sub.url ? (
            <a href={sub.url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sub.url} alt="Submission" className="max-h-[60vh] w-full rounded-xl bg-black object-contain" />
            </a>
          ) : (
            <div className="grid h-64 place-items-center rounded-xl bg-ink-900 text-slate-600"><ImageOff /></div>
          )}
          {sub.lat != null && sub.lng != null && (
            <div className="mt-3">
              <HuntMap height={180} markers={[{ id: "s", lat: sub.lat, lng: sub.lng, label: "Shot", color: "#fbbf24" }]} />
            </div>
          )}
        </div>
        <div className="space-y-4">
          <dl className="space-y-1.5 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-white/5 pb-1.5">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right text-slate-200">{v}</dd>
              </div>
            ))}
          </dl>
          {sub.flag_reasons.length > 0 && (
            <div className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
              <p className="mb-1 flex items-center gap-1 font-semibold"><Flag className="h-3.5 w-3.5" /> Flags</p>
              <ul className="list-inside list-disc">{sub.flag_reasons.map((f) => <li key={f}>{f}</li>)}</ul>
            </div>
          )}
          <Field label="Comment to team (optional)"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} /></Field>
          <div className="flex items-end gap-2">
            <Field label="Points on approval" className="w-32"><Input type="number" value={points} onChange={(e) => setPoints(Number(e.target.value))} /></Field>
            <Button variant="primary" className="flex-1" onClick={() => review("approved")} loading={busy === "approved"}>
              <Check className="h-4 w-4" /> Approve
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" onClick={() => review("retake_requested")} loading={busy === "retake_requested"} title="Ask the team for another photo">
              <RotateCcw className="h-4 w-4" /> Retake
            </Button>
            <Button variant="secondary" onClick={() => review("flagged")} loading={busy === "flagged"}>
              <Flag className="h-4 w-4" /> Flag
            </Button>
            <Button variant="danger" onClick={() => review("rejected")} loading={busy === "rejected"}>
              <X className="h-4 w-4" /> Reject
            </Button>
          </div>
          <p className="flex items-start gap-1.5 text-[11px] text-slate-600">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> Use Teams → Manage to award extra bonus points or deductions.
          </p>
        </div>
      </div>
    </Modal>
  );
}
