"use client";
import { useEffect, useState } from "react";
import { CalendarClock, Camera, Database, Plus, Save, Shield, ShieldCheck, Target, Trash2, UserCog } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Modal, Select, Spinner, Switch, Textarea } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useAdmin, useAdminData } from "@/components/admin/admin-context";
import { api } from "@/lib/utils";
import type { EventSettings } from "@/lib/settings";
import type { EventRow } from "@/lib/types";

const toLocal = (iso: string) => new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const fromLocal = (v: string) => new Date(v).toISOString();

export default function SettingsPage() {
  const toast = useToast();
  const { can, refreshMeta } = useAdmin();
  const ev = useAdminData<{ event: EventRow | null }>("/api/admin/event");
  const st = useAdminData<{ settings: EventSettings }>(ev.data?.event ? "/api/admin/settings" : null, [ev.data?.event?.id]);
  const [details, setDetails] = useState<{ name: string; description: string; venue: string; rules: string; start_at: string; end_at: string } | null>(null);
  const [s, setS] = useState<EventSettings | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const e = ev.data?.event;
    if (e && !details)
      setDetails({ name: e.name, description: e.description ?? "", venue: e.venue, rules: (e.rules ?? []).join("\n"), start_at: toLocal(e.start_at), end_at: toLocal(e.end_at) });
  }, [ev.data, details]);
  useEffect(() => {
    if (st.data?.settings && !s) setS(st.data.settings);
  }, [st.data, s]);

  async function saveDetails() {
    if (!details) return;
    setBusy("details");
    try {
      await api("/api/admin/event", {
        method: "PATCH",
        body: JSON.stringify({
          action: "update",
          name: details.name,
          description: details.description,
          venue: details.venue,
          rules: details.rules.split("\n").map((r) => r.trim()).filter(Boolean),
          start_at: fromLocal(details.start_at),
          end_at: fromLocal(details.end_at),
        }),
      });
      toast({ kind: "success", title: "Event details saved" });
      refreshMeta();
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function saveSettings() {
    if (!s) return;
    setBusy("settings");
    try {
      const r = await api<{ settings: EventSettings }>("/api/admin/settings", { method: "PATCH", body: JSON.stringify(s) });
      setS(r.settings);
      toast({ kind: "success", title: "Rules engine updated", body: "Applies immediately to all teams." });
      refreshMeta();
    } catch (e) {
      const d = (e as Error & { data?: { issues?: string[] } }).data;
      toast({ kind: "error", title: (e as Error).message, body: d?.issues?.join(" · ") });
    } finally {
      setBusy(null);
    }
  }

  async function purge(action: "purge_locations" | "purge_photos") {
    const phrase = action === "purge_photos" ? "DELETE PHOTOS" : null;
    if (phrase && prompt(`Type ${phrase} to permanently delete all photo files for this event`) !== phrase) return;
    if (!phrase && !confirm("Delete periodic pings and anonymise GPS coordinates older than the retention period?")) return;
    setBusy(action);
    try {
      const r = await api<Record<string, unknown>>("/api/admin/privacy", {
        method: "POST",
        body: JSON.stringify(phrase ? { action, confirm: phrase } : { action }),
      });
      toast({ kind: "success", title: "Done", body: JSON.stringify(r) });
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const up = <K extends keyof EventSettings>(k: K, v: EventSettings[K]) => setS((x) => (x ? { ...x, [k]: v } : x));
  const sub = <K extends "scoring" | "gps" | "anticheat" | "photo">(k: K, patch: Partial<EventSettings[K]>) =>
    setS((x) => (x ? { ...x, [k]: { ...x[k], ...patch } } : x));
  const num = (v: string) => (v === "" ? 0 : Number(v));

  if (ev.loading && !ev.data) return <div className="grid h-64 place-items-center"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hud-label">Configuration</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-white">Event settings</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New event
        </Button>
      </div>

      {!ev.data?.event && (
        <Card className="border-cyan/30 text-sm text-cyan">No event yet — create one to begin.</Card>
      )}

      {details && (
        <Card>
          <CardHeader title="Event details & schedule" subtitle="Times are in your local timezone; the server is the source of truth." icon={<CalendarClock className="h-4 w-4" />} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Event name"><Input value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} /></Field>
            <Field label="Venue"><Input value={details.venue} onChange={(e) => setDetails({ ...details, venue: e.target.value })} /></Field>
            <Field label="Start"><Input type="datetime-local" value={details.start_at} onChange={(e) => setDetails({ ...details, start_at: e.target.value })} /></Field>
            <Field label="End"><Input type="datetime-local" value={details.end_at} onChange={(e) => setDetails({ ...details, end_at: e.target.value })} /></Field>
            <Field label="Description" className="md:col-span-2"><Textarea value={details.description} onChange={(e) => setDetails({ ...details, description: e.target.value })} /></Field>
            <Field label="Rules (one per line)" className="md:col-span-2"><Textarea rows={6} value={details.rules} onChange={(e) => setDetails({ ...details, rules: e.target.value })} /></Field>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="primary" onClick={saveDetails} loading={busy === "details"}><Save className="h-4 w-4" /> Save details</Button>
          </div>
        </Card>
      )}

      {ev.data?.event && !s && <div className="grid h-24 place-items-center"><Spinner /></div>}

      {s && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Scoring engine" subtitle="Clue points are set per clue." icon={<Target className="h-4 w-4" />} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Location verified (+)"><Input type="number" value={s.scoring.location_verified} onChange={(e) => sub("scoring", { location_verified: num(e.target.value) })} /></Field>
                <Field label="Completion bonus (+)"><Input type="number" value={s.scoring.completion_bonus} onChange={(e) => sub("scoring", { completion_bonus: num(e.target.value) })} /></Field>
                <Field label="Late penalty (−)"><Input type="number" value={s.scoring.late_penalty} onChange={(e) => sub("scoring", { late_penalty: num(e.target.value) })} /></Field>
                <Field label="Tab-switch penalty (−)"><Input type="number" value={s.scoring.tab_switch_penalty} onChange={(e) => sub("scoring", { tab_switch_penalty: num(e.target.value) })} /></Field>
                <Field label="Free warnings" hint="No penalty for the first N"><Input type="number" value={s.scoring.free_warnings} onChange={(e) => sub("scoring", { free_warnings: num(e.target.value) })} /></Field>
                <Field label="Ranking">
                  <Select value={s.ranking} onChange={(e) => up("ranking", e.target.value as EventSettings["ranking"])}>
                    <option value="score_then_time">Score → clues → time</option>
                    <option value="clues_then_time">Clues → time → score</option>
                    <option value="score_only">Score only</option>
                  </Select>
                </Field>
              </div>
              <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
                <Switch checked={s.registration_open} onChange={(v) => up("registration_open", v)} label="Open team self-registration" description="Off = only admin-created team accounts." />
                <Switch checked={s.public_leaderboard} onChange={(v) => up("public_leaderboard", v)} label="Public leaderboard" />
                <Switch checked={s.sound_alerts} onChange={(v) => up("sound_alerts", v)} label="Sound alerts on admin dashboard" />
              </div>
            </Card>

            <Card>
              <CardHeader title="GPS verification" subtitle="GPS can be spoofed — anomalies are flagged, not auto-punished." icon={<ShieldCheck className="h-4 w-4" />} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Max accepted accuracy (m)"><Input type="number" value={s.gps.max_accuracy_m} onChange={(e) => sub("gps", { max_accuracy_m: num(e.target.value) })} /></Field>
                <Field label="Retry cooldown (s)"><Input type="number" value={s.gps.min_retry_seconds} onChange={(e) => sub("gps", { min_retry_seconds: num(e.target.value) })} /></Field>
                <Field label="Max attempts / clue" hint="0 = unlimited"><Input type="number" value={s.gps.max_attempts_per_clue} onChange={(e) => sub("gps", { max_attempts_per_clue: num(e.target.value) })} /></Field>
                <Field label="Flag speed above (m/s)"><Input type="number" value={s.gps.max_speed_mps} onChange={(e) => sub("gps", { max_speed_mps: num(e.target.value) })} /></Field>
                <Field label="Flag accuracy below (m)" hint="Mock-GPS apps often report ≤1 m"><Input type="number" value={s.gps.suspicious_accuracy_below_m} onChange={(e) => sub("gps", { suspicious_accuracy_below_m: num(e.target.value) })} /></Field>
                <Field label="Location retention (h)"><Input type="number" value={s.gps.retention_hours} onChange={(e) => sub("gps", { retention_hours: num(e.target.value) })} /></Field>
              </div>
              <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
                <Switch checked={s.gps.require_before_photo} onChange={(v) => sub("gps", { require_before_photo: v })} label="Require GPS verification before photo" />
                <Switch checked={s.gps.share_last_location} onChange={(v) => sub("gps", { share_last_location: v })} label="Show last verified location on live map" description="Turn off for privacy mode." />
                <Switch checked={s.gps.periodic_updates} onChange={(v) => sub("gps", { periodic_updates: v })} label="Allow opt-in periodic location updates" description="Teams must switch it on themselves." />
                {s.gps.periodic_updates && (
                  <Field label="Update interval (s)"><Input type="number" min={30} value={s.gps.periodic_interval_seconds} onChange={(e) => sub("gps", { periodic_interval_seconds: num(e.target.value) })} /></Field>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Anti-cheat monitoring" subtitle="Only this page's focus/visibility is observed. Never auto-disqualifies." icon={<Shield className="h-4 w-4" />} />
              <div className="space-y-3">
                <Switch checked={s.anticheat.enabled} onChange={(v) => sub("anticheat", { enabled: v })} label="Enable tab-switch monitoring" />
                <Switch checked={s.anticheat.fullscreen_mode} onChange={(v) => sub("anticheat", { fullscreen_mode: v })} label="Fullscreen hunt mode" description="Ask teams to stay fullscreen; exits count as warnings." />
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Warning threshold"><Input type="number" value={s.anticheat.warning_threshold} onChange={(e) => sub("anticheat", { warning_threshold: num(e.target.value) })} /></Field>
                  <Field label="Flag at"><Input type="number" value={s.anticheat.flag_threshold} onChange={(e) => sub("anticheat", { flag_threshold: num(e.target.value) })} /></Field>
                  <Field label="Lock at"><Input type="number" value={s.anticheat.lock_threshold} onChange={(e) => sub("anticheat", { lock_threshold: num(e.target.value) })} /></Field>
                </div>
                <Switch checked={s.anticheat.auto_lock_submissions} onChange={(v) => sub("anticheat", { auto_lock_submissions: v })} label="Auto-lock submissions at lock threshold" description="Organisers can unlock from the team panel." />
                <div>
                  <p className="mb-2 text-xs text-slate-400">Ignore these signals</p>
                  <div className="flex flex-wrap gap-2">
                    {(["tab_hidden", "window_blur", "fullscreen_exit", "page_unload"] as const).map((t) => {
                      const on = s.anticheat.ignored_events.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => sub("anticheat", { ignored_events: on ? s.anticheat.ignored_events.filter((x) => x !== t) : [...s.anticheat.ignored_events, t] })}
                          className={on ? "rounded-full border border-amber/40 bg-amber/10 px-3 py-1 text-xs text-amber" : "rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400"}
                        >
                          {t.replace("_", " ")}
                          {on ? " · ignored" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Photo submissions" icon={<Camera className="h-4 w-4" />} />
              <div className="space-y-3">
                <Switch checked={s.photo.allow_gallery_upload} onChange={(v) => sub("photo", { allow_gallery_upload: v })} label="Allow upload from device gallery" description="For accessibility / devices without browser camera support. Uploads are labelled for reviewers." />
                <Switch checked={s.photo.allow_late_submissions} onChange={(v) => sub("photo", { allow_late_submissions: v })} label="Accept late submissions (with penalty)" description="Off = clue closes and auto-skips at its deadline." />
                <Field label="Max photo size (MB)" className="w-40"><Input type="number" min={1} max={10} value={s.photo.max_size_mb} onChange={(e) => sub("photo", { max_size_mb: num(e.target.value) })} /></Field>
              </div>
            </Card>
          </div>
          <div className="sticky bottom-4 z-20 flex justify-end">
            <Button variant="primary" size="lg" onClick={saveSettings} loading={busy === "settings"} className="shadow-2xl">
              <Save className="h-4 w-4" /> Save rules engine
            </Button>
          </div>
        </>
      )}

      {can("super_admin") && ev.data?.event && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Privacy & data retention" icon={<Database className="h-4 w-4" />} />
            <div className="space-y-3 text-sm">
              <p className="text-slate-400">Remove location data older than the retention period ({s?.gps.retention_hours ?? "—"} h). Verification results stay; coordinates are erased.</p>
              <Button onClick={() => purge("purge_locations")} loading={busy === "purge_locations"}>Purge old location data</Button>
              <p className="pt-2 text-slate-400">Permanently delete every photo file of this event from storage (export first!).</p>
              <Button variant="danger" onClick={() => purge("purge_photos")} loading={busy === "purge_photos"}><Trash2 className="h-4 w-4" /> Delete all photos</Button>
            </div>
          </Card>
          <AdminsCard />
        </div>
      )}

      <CreateEventModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); setDetails(null); setS(null); ev.reload(); refreshMeta(); }} />
    </div>
  );
}

function CreateEventModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const start = new Date(Date.now() + 86400000);
  start.setMinutes(0, 0, 0);
  const [f, setF] = useState({ name: "", start_at: toLocal(start.toISOString()), end_at: toLocal(new Date(start.getTime() + 3 * 3600000).toISOString()) });
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      await api("/api/admin/event", { method: "PATCH", body: JSON.stringify({ action: "create", name: f.name, start_at: fromLocal(f.start_at), end_at: fromLocal(f.end_at) }) });
      toast({ kind: "success", title: "Event created and set as current" });
      onCreated();
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create new event"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={create} loading={busy} disabled={f.name.length < 2}>Create</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-500">The new event becomes the current event. Previous events (and their teams) remain in the database.</p>
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="HuntX 2026 – Shutter Quest" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start"><Input type="datetime-local" value={f.start_at} onChange={(e) => setF({ ...f, start_at: e.target.value })} /></Field>
          <Field label="End"><Input type="datetime-local" value={f.end_at} onChange={(e) => setF({ ...f, end_at: e.target.value })} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function AdminsCard() {
  const toast = useToast();
  const { data, reload } = useAdminData<{ admins: { user_id: string; email: string | null; role: string }[] }>("/api/admin/admins");
  const [f, setF] = useState({ email: "", password: "", role: "organiser" });
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    try {
      await api("/api/admin/admins", { method: "POST", body: JSON.stringify({ ...f, password: f.password || undefined }) });
      toast({ kind: "success", title: "Organiser added" });
      setF({ email: "", password: "", role: "organiser" });
      reload();
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  async function remove(user_id: string) {
    try {
      await api("/api/admin/admins", { method: "DELETE", body: JSON.stringify({ user_id }) });
      reload();
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
    }
  }
  return (
    <Card>
      <CardHeader title="Organisers & roles" subtitle="reviewer: review photos · organiser: run the event · super admin: everything" icon={<UserCog className="h-4 w-4" />} />
      <ul className="mb-4 space-y-2">
        {(data?.admins ?? []).map((a) => (
          <li key={a.user_id} className="flex items-center justify-between rounded-lg border border-white/5 px-3 py-2 text-sm">
            <span className="truncate text-slate-200">{a.email}</span>
            <span className="flex items-center gap-2">
              <Badge tone={a.role === "super_admin" ? "neon" : a.role === "organiser" ? "cyan" : "slate"}>{a.role.replace("_", " ")}</Badge>
              <button onClick={() => remove(a.user_id)} className="text-slate-600 hover:text-danger" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
            </span>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_130px_auto]">
        <Input placeholder="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Input placeholder="password (new user)" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          <option value="reviewer">Reviewer</option>
          <option value="organiser">Organiser</option>
          <option value="super_admin">Super admin</option>
        </Select>
        <Button onClick={add} loading={busy} disabled={!f.email}>Add</Button>
      </div>
    </Card>
  );
}
