"use client";
import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Ban, Copy, Download, Eye, KeyRound, Lock, MinusCircle, PlusCircle, QrCode, RotateCcw, Search, ShieldOff, Unlock, UserPlus, Users } from "lucide-react";
import { Badge, Button, Card, Empty, Field, Input, Modal, Spinner, statusTone } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useAdmin, useAdminData } from "@/components/admin/admin-context";
import { api, cn, fmtTime } from "@/lib/utils";
import { publicEnv } from "@/lib/env";
import type { TeamRow } from "@/lib/types";

type TeamListRow = TeamRow & {
  members: { name: string; email: string | null; is_leader: boolean }[];
  score: number;
  rank: number | null;
  completed: number;
  current_clue: { number: number; title: string; verified: boolean } | null;
};

interface Creds {
  join_code: string;
  name?: string;
}

const joinUrl = (code: string) => `${typeof window !== "undefined" ? window.location.origin : publicEnv.siteUrl}/join?code=${code}`;

export default function TeamsPage() {
  const toast = useToast();
  const { can } = useAdmin();
  const { data, loading, reload } = useAdminData<{ teams: TeamListRow[] }>("/api/admin/teams");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "flagged" | "finished" | "disqualified">("all");
  const [creating, setCreating] = useState(false);
  const [creds, setCreds] = useState<Creds | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [qr, setQr] = useState<TeamListRow | null>(null);

  const teams = useMemo(() => {
    let t = data?.teams ?? [];
    if (q) t = t.filter((x) => `${x.name} ${x.team_uid} ${x.join_code} ${x.leader_name}`.toLowerCase().includes(q.toLowerCase()));
    if (filter === "flagged") t = t.filter((x) => x.flagged);
    else if (filter !== "all") t = t.filter((x) => x.status === filter);
    return t;
  }, [data, q, filter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hud-label">Roster</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-white">Teams</h1>
        </div>
        <div className="flex gap-2">
          {can("organiser") && (
            <a href="/api/admin/export?type=teams" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-sm text-slate-300 hover:bg-white/5">
              <Download className="h-4 w-4" /> CSV
            </a>
          )}
          {can("organiser") && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <UserPlus className="h-4 w-4" /> Create team
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ID, code, leader…" className="pl-9" />
        </div>
        <div className="flex rounded-xl border border-white/10 p-1 text-xs">
          {(["all", "active", "flagged", "finished", "disqualified"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn("rounded-lg px-3 py-1.5 capitalize", filter === f ? "bg-white/10 text-white" : "text-slate-500")}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <div className="grid h-40 place-items-center"><Spinner /></div>
      ) : teams.length === 0 ? (
        <Empty icon={<Users className="h-10 w-10" />} title="No teams" body="Create teams in advance, or open registration in Event Settings." />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="hud-label border-b border-white/5 text-left">
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Current clue</th>
                <th className="px-4 py-3 text-right">Score</th>
                <th className="px-4 py-3 text-right">Warnings</th>
                <th className="px-4 py-3">Last location</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-100">{t.name}</p>
                    <p className="font-mono text-[11px] text-slate-500">
                      {t.team_uid} · code <span className="text-cyan">{t.join_code}</span>
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={statusTone[t.status]}>{t.status}</Badge>
                      {t.flagged && <Badge tone="danger">flagged</Badge>}
                      {t.submissions_locked && <Badge tone="amber">locked</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {t.current_clue ? (
                      <span>
                        #{t.current_clue.number} <span className="text-slate-500">{t.current_clue.title}</span>{" "}
                        {t.current_clue.verified && <Badge tone="neon">GPS ✓</Badge>}
                      </span>
                    ) : (
                      <span className="text-slate-600">{t.completed} done</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-display font-semibold tabular-nums text-neon">{t.score}</td>
                  <td className={cn("px-4 py-3 text-right tabular-nums", t.warning_count ? "text-amber" : "text-slate-600")}>{t.warning_count}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{t.last_location_at ? fmtTime(t.last_location_at) : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setQr(t)} aria-label="QR code">
                        <QrCode className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setDetail(t.id)}>
                        <Eye className="h-4 w-4" /> Manage
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <CreateTeamModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(c) => {
          setCreds(c);
          setCreating(false);
          reload();
        }}
      />
      <CredentialsModal creds={creds} onClose={() => setCreds(null)} />
      <Modal open={Boolean(qr)} onClose={() => setQr(null)} title={qr ? `Join ${qr.name}` : ""}>
        {qr && (
          <div className="text-center">
            <div className="mx-auto inline-block rounded-2xl bg-white p-4">
              <QRCodeSVG value={joinUrl(qr.join_code)} size={220} />
            </div>
            <p className="mt-4 font-mono text-2xl font-bold tracking-[0.3em] text-neon">{qr.join_code}</p>
            <p className="mt-1 break-all text-xs text-slate-500">{joinUrl(qr.join_code)}</p>
            <p className="mt-3 text-xs text-slate-500">Scanning logs the phone straight into this team. Keep the QR private to the team.</p>
          </div>
        )}
      </Modal>
      {detail && (
        <TeamDetail
          id={detail}
          onClose={() => setDetail(null)}
          onChanged={reload}
          onCreds={(c) => setCreds(c)}
          toast={toast}
        />
      )}
    </div>
  );
}

function CreateTeamModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (c: Creds) => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: "", leader_name: "", members: "", contact_email: "" });
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const r = await api<{ credentials: Creds; team: TeamRow }>("/api/admin/teams", {
        method: "POST",
        body: JSON.stringify({ ...f, members: f.members.split(",").map((m) => m.trim()).filter(Boolean) }),
      });
      onCreated({ ...r.credentials, name: r.team.name });
      setF({ name: "", leader_name: "", members: "", contact_email: "" });
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create team account"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={busy} disabled={f.name.length < 2 || f.leader_name.length < 2}>
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Team name"><Input value={f.name} onChange={set("name")} /></Field>
        <Field label="Leader name"><Input value={f.leader_name} onChange={set("leader_name")} /></Field>
        <Field label="Other members" hint="Comma separated"><Input value={f.members} onChange={set("members")} /></Field>
        <Field label="Contact email (optional)"><Input type="email" value={f.contact_email} onChange={set("contact_email")} /></Field>
      </div>
    </Modal>
  );
}

function CredentialsModal({ creds, onClose }: { creds: Creds | null; onClose: () => void }) {
  const toast = useToast();
  if (!creds) return null;
  const text = `HuntX${creds.name ? ` – ${creds.name}` : ""}\nTeam code: ${creds.join_code}\nJoin: ${joinUrl(creds.join_code)}`;
  return (
    <Modal open onClose={onClose} title={creds.name ? `Team code · ${creds.name}` : "Team code"} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="text-center">
        <div className="mx-auto inline-block rounded-2xl bg-white p-3">
          <QRCodeSVG value={joinUrl(creds.join_code)} size={180} />
        </div>
        <p className="mt-4 hud-label">Team code</p>
        <p className="mt-1 font-mono text-4xl font-bold tracking-[0.3em] text-neon">{creds.join_code}</p>
        <p className="mt-2 text-xs text-slate-500">Members type this code on the Join page, or scan the QR. No password needed.</p>
      </div>
      <Button
        className="mt-4 w-full"
        onClick={() => {
          navigator.clipboard?.writeText(text);
          toast({ kind: "success", title: "Copied" });
        }}
      >
        <Copy className="h-4 w-4" /> Copy code & link
      </Button>
    </Modal>
  );
}

interface Detail {
  team: TeamRow;
  members: { id: string; name: string; email: string | null; is_leader: boolean }[];
  progress: { id: string; status: string; unlocked_at: string; completed_at: string | null; location_verified_at: string | null; gps_attempts: number; hint_used: boolean; clues: { order_index: number; title: string } | null }[];
  verifications: { id: string; created_at: string; distance_m: number; accuracy: number; verified: boolean; suspicious: boolean; suspicion_reasons: string[] }[];
  anticheat: { id: string; created_at: string; type: string; counted: boolean; ignored: boolean; user_agent: string | null }[];
  ledger: { id: string; created_at: string; kind: string; points: number; reason: string }[];
}

function TeamDetail({ id, onClose, onChanged, onCreds, toast }: { id: string; onClose: () => void; onChanged: () => void; onCreds: (c: Creds) => void; toast: ReturnType<typeof useToast> }) {
  const { can } = useAdmin();
  const { data, reload } = useAdminData<Detail>(`/api/admin/teams/${id}`);
  const [tab, setTab] = useState<"progress" | "anticheat" | "gps" | "score">("progress");
  const [pts, setPts] = useState({ points: 50, reason: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    try {
      const r = await api<{ credentials?: Creds }>(`/api/admin/teams/${id}`, { method: "PATCH", body: JSON.stringify({ action, ...extra }) });
      toast({ kind: "success", title: `Done: ${action.replace(/_/g, " ")}` });
      if (r.credentials) onCreds({ ...r.credentials, name: data?.team.name });
      setConfirm(null);
      reload();
      onChanged();
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const t = data?.team;
  const org = can("organiser");
  const total = data?.ledger.reduce((s, l) => s + l.points, 0) ?? 0;

  return (
    <Modal open onClose={onClose} wide title={t ? `${t.name} · ${t.team_uid}` : "Loading…"}>
      {!data || !t ? (
        <div className="grid h-40 place-items-center"><Spinner /></div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge tone={statusTone[t.status]}>{t.status}</Badge>
            {t.flagged && <Badge tone="danger">flagged</Badge>}
            {t.submissions_locked && <Badge tone="amber">submissions locked</Badge>}
            <Badge tone="slate">{t.warning_count} warnings</Badge>
            <Badge tone="neon">{total} pts</Badge>
            <span className="text-xs text-slate-500">Members: {data.members.map((m) => m.name + (m.is_leader ? " ★" : "")).join(", ")}</span>
          </div>

          {org && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Button size="sm" onClick={() => act("unlock_next")} loading={busy === "unlock_next"}><Unlock className="h-3.5 w-3.5" /> Unlock next clue</Button>
              <Button size="sm" onClick={() => act("reset_gps_attempts")} loading={busy === "reset_gps_attempts"}><RotateCcw className="h-3.5 w-3.5" /> Reset GPS tries</Button>
              <Button size="sm" onClick={() => act("reset_warnings")} loading={busy === "reset_warnings"}><ShieldOff className="h-3.5 w-3.5" /> Reset warnings</Button>
              {t.submissions_locked ? (
                <Button size="sm" onClick={() => act("unlock_submissions")}><Unlock className="h-3.5 w-3.5" /> Unlock submissions</Button>
              ) : (
                <Button size="sm" onClick={() => act("lock_submissions")}><Lock className="h-3.5 w-3.5" /> Lock submissions</Button>
              )}
              {t.flagged && <Button size="sm" onClick={() => act("unflag")}>Clear flag</Button>}
              <Button size="sm" onClick={() => act("new_code")} loading={busy === "new_code"} title="Old code stops working"><KeyRound className="h-3.5 w-3.5" /> New team code</Button>
              {t.status === "disabled" ? (
                <Button size="sm" onClick={() => act("enable")}>Enable team</Button>
              ) : (
                <Button size="sm" variant="danger" onClick={() => act("disable")}>Disable team</Button>
              )}
              {t.status === "disqualified" ? (
                <Button size="sm" onClick={() => act("reinstate")}>Reinstate</Button>
              ) : (
                <Button size="sm" variant="danger" onClick={() => setConfirm("disqualify")}><Ban className="h-3.5 w-3.5" /> Disqualify</Button>
              )}
              <Button size="sm" variant="danger" onClick={() => setConfirm("reset_progress")}><RotateCcw className="h-3.5 w-3.5" /> Reset progress</Button>
            </div>
          )}

          {org && (
            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-white/10 p-3">
              <Field label="Points (±)" className="w-28"><Input type="number" value={pts.points} onChange={(e) => setPts({ ...pts, points: Number(e.target.value) })} /></Field>
              <Field label="Reason" className="min-w-[180px] flex-1"><Input value={pts.reason} onChange={(e) => setPts({ ...pts, reason: e.target.value })} placeholder="Creative shot bonus" /></Field>
              <Button variant="outline" onClick={() => act("adjust_points", { points: Math.abs(pts.points), reason: pts.reason || "Bonus" })} disabled={!pts.points}><PlusCircle className="h-4 w-4" /> Award</Button>
              <Button variant="danger" onClick={() => act("adjust_points", { points: -Math.abs(pts.points), reason: pts.reason || "Deduction" })} disabled={!pts.points}><MinusCircle className="h-4 w-4" /> Deduct</Button>
            </div>
          )}

          <div className="flex rounded-xl border border-white/10 p-1 text-xs">
            {(["progress", "anticheat", "gps", "score"] as const).map((x) => (
              <button key={x} onClick={() => setTab(x)} className={cn("flex-1 rounded-lg py-1.5 capitalize", tab === x ? "bg-white/10 text-white" : "text-slate-500")}>
                {x === "anticheat" ? `Anti-cheat (${data.anticheat.filter((a) => a.counted).length})` : x === "gps" ? `GPS (${data.verifications.length})` : x}
              </button>
            ))}
          </div>

          <div className="max-h-[320px] overflow-y-auto text-sm">
            {tab === "progress" && (
              <ul className="space-y-2">
                {data.progress.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-lg border border-white/5 px-3 py-2">
                    <span>Clue {p.clues?.order_index} · <span className="text-slate-500">{p.clues?.title}</span></span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {p.location_verified_at && <Badge tone="neon">GPS ✓</Badge>}
                      {p.hint_used && <Badge tone="amber">hint</Badge>}
                      {p.gps_attempts} tries · <Badge tone={p.status === "completed" ? "neon" : p.status === "active" ? "cyan" : "amber"}>{p.status}</Badge>
                    </span>
                  </li>
                ))}
                {data.progress.length === 0 && <p className="text-slate-500">Not started.</p>}
              </ul>
            )}
            {tab === "anticheat" && (
              <ul className="space-y-1 font-mono text-xs">
                {data.anticheat.map((a) => (
                  <li key={a.id} className={cn("flex justify-between gap-3 rounded px-2 py-1", a.counted && "bg-amber/5 text-amber")}>
                    <span>{fmtTime(a.created_at)}</span>
                    <span className="flex-1">{a.type}{a.counted ? " · warning" : ""}{a.ignored ? " · ignored" : ""}</span>
                  </li>
                ))}
                {data.anticheat.length === 0 && <p className="text-slate-500">No events.</p>}
              </ul>
            )}
            {tab === "gps" && (
              <ul className="space-y-1 text-xs">
                {data.verifications.map((v) => (
                  <li key={v.id} className={cn("rounded-lg border border-white/5 px-3 py-2", v.suspicious && "border-danger/30 bg-danger/5")}>
                    <div className="flex justify-between font-mono">
                      <span>{fmtTime(v.created_at)}</span>
                      <span>{Math.round(v.distance_m)} m · ±{Math.round(v.accuracy)} m · {v.verified ? "✅" : "❌"}</span>
                    </div>
                    {v.suspicious && <p className="mt-1 text-danger">{v.suspicion_reasons.join("; ")}</p>}
                  </li>
                ))}
                {data.verifications.length === 0 && <p className="text-slate-500">No GPS reports.</p>}
              </ul>
            )}
            {tab === "score" && (
              <ul className="space-y-1 text-xs">
                {data.ledger.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3 rounded px-2 py-1.5 hover:bg-white/[0.02]">
                    <span className="text-slate-400">{fmtTime(l.created_at)} · {l.reason}</span>
                    <span className={cn("font-mono font-semibold", l.points >= 0 ? "text-neon" : "text-danger")}>{l.points > 0 ? "+" : ""}{l.points}</span>
                  </li>
                ))}
                {data.ledger.length === 0 && <p className="text-slate-500">No points yet.</p>}
              </ul>
            )}
          </div>
        </div>
      )}

      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm === "disqualify" ? "Disqualify team?" : "Reset progress?"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => act(confirm!)} loading={busy === confirm}>Confirm</Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">
          {confirm === "disqualify"
            ? "This is a manual decision. Make sure you have reviewed the alerts and evidence — browser signals alone are not proof."
            : "Deletes this team's clue progress and automatic points, rejects live submissions and clears warnings. Manual bonuses stay."}
        </p>
      </Modal>
    </Modal>
  );
}
