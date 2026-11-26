"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Crosshair, Eye, EyeOff, MapPin, Pencil, Plus, Puzzle, Trash2 } from "lucide-react";
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Spinner, Switch, Textarea } from "@/components/ui";
import { HuntMap } from "@/components/map";
import { useToast } from "@/components/toast";
import { useAdminData } from "@/components/admin/admin-context";
import { getPosition } from "@/hooks/use-online";
import { IIT_PATNA } from "@/lib/geo";
import { api, cn } from "@/lib/utils";
import type { ClueRow } from "@/lib/types";

type ClueWithStats = ClueRow & { stats: { active: number; completed: number } };

const RULE_LABEL = {
  on_submission: "Next unlocks on photo submission",
  on_approval: "Next unlocks when photo is approved",
  on_verification: "Next unlocks on GPS verification",
  manual: "Organiser unlocks next manually",
};

const empty = (): Partial<ClueRow> => ({
  title: "",
  body: "",
  body_alt: "",
  language: "en",
  difficulty: "medium",
  target_lat: IIT_PATNA.lat,
  target_lng: IIT_PATNA.lng,
  radius_m: 30,
  time_limit_minutes: 20,
  deadline_at: null,
  points: 100,
  photo_required: true,
  is_active: true,
  hint: "",
  hint_penalty: 20,
  unlock_rule: "on_submission",
  reveal_zone: false,
  max_gps_attempts: null,
});

export default function CluesPage() {
  const toast = useToast();
  const { data, loading, reload, setData } = useAdminData<{ clues: ClueWithStats[] }>("/api/admin/clues");
  const [editing, setEditing] = useState<Partial<ClueRow> | null>(null);
  const [del, setDel] = useState<ClueRow | null>(null);
  const [showMap, setShowMap] = useState(true);
  const clues = data?.clues ?? [];

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= clues.length) return;
    const next = [...clues];
    [next[i], next[j]] = [next[j], next[i]];
    setData({ clues: next.map((c, k) => ({ ...c, order_index: k + 1 })) });
    try {
      await api("/api/admin/clues/reorder", { method: "POST", body: JSON.stringify({ ids: next.map((c) => c.id) }) });
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
      reload();
    }
  }

  async function toggle(c: ClueRow) {
    try {
      await api(`/api/admin/clues/${c.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !c.is_active }) });
      reload();
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
    }
  }

  async function remove() {
    if (!del) return;
    try {
      await api(`/api/admin/clues/${del.id}`, { method: "DELETE" });
      toast({ kind: "success", title: "Clue deleted" });
      setDel(null);
      reload();
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hud-label">Confidential · admin only</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-white">Clues</h1>
          <p className="mt-1 text-xs text-slate-500">Participants only ever receive their current clue — never coordinates, answers or future clues.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setShowMap((s) => !s)}>
            <MapPin className="h-4 w-4" /> {showMap ? "Hide map" : "Show map"}
          </Button>
          <Button variant="primary" onClick={() => setEditing(empty())}>
            <Plus className="h-4 w-4" /> New clue
          </Button>
        </div>
      </div>

      {showMap && clues.length > 0 && (
        <HuntMap
          height={320}
          circles={clues.map((c) => ({ id: c.id, lat: c.target_lat, lng: c.target_lng, radius: c.radius_m, color: c.is_active ? "#39ff88" : "#64748b" }))}
          markers={clues.map((c) => ({ id: `m${c.id}`, lat: c.target_lat, lng: c.target_lng, label: `#${c.order_index} ${c.title}`, color: c.is_active ? "#39ff88" : "#64748b" }))}
        />
      )}

      {loading && !data ? (
        <div className="grid h-40 place-items-center"><Spinner /></div>
      ) : clues.length === 0 ? (
        <Empty icon={<Puzzle className="h-10 w-10" />} title="No clues yet" body="Create your first cryptic clue and drop its pin on the campus map." />
      ) : (
        <div className="space-y-3">
          {clues.map((c, i) => (
            <Card key={c.id} className={cn("flex flex-col gap-4 p-4 sm:flex-row sm:items-center", !c.is_active && "opacity-50")}>
              <div className="flex items-center gap-2 sm:flex-col">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-slate-500 hover:bg-white/5 disabled:opacity-20" aria-label="Move up">
                  <ArrowUp className="h-4 w-4" />
                </button>
                <span className="font-mono text-lg font-bold text-neon">{String(c.order_index).padStart(2, "0")}</span>
                <button onClick={() => move(i, 1)} disabled={i === clues.length - 1} className="rounded p-1 text-slate-500 hover:bg-white/5 disabled:opacity-20" aria-label="Move down">
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display font-semibold text-white">{c.title}</h3>
                  <Badge tone="cyan">{c.difficulty}</Badge>
                  <Badge>{c.points} pts</Badge>
                  <Badge>{c.language}</Badge>
                  {c.time_limit_minutes && <Badge>{c.time_limit_minutes} min</Badge>}
                  {c.reveal_zone && <Badge tone="amber">zone revealed</Badge>}
                  {!c.photo_required && <Badge tone="violet">no photo</Badge>}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-400">{c.body}</p>
                <p className="mt-1 font-mono text-[11px] text-slate-600">
                  {c.target_lat.toFixed(5)}, {c.target_lng.toFixed(5)} · r={c.radius_m} m · {RULE_LABEL[c.unlock_rule]} · {c.stats.active} active · {c.stats.completed} done
                </p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => toggle(c)} title={c.is_active ? "Deactivate" : "Activate"}>
                  {c.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setEditing(c)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDel(c)} aria-label="Delete">
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && <ClueEditor initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}

      <Modal
        open={Boolean(del)}
        onClose={() => setDel(null)}
        title="Delete clue?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDel(null)}>Cancel</Button>
            <Button variant="danger" onClick={remove}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">“{del?.title}” will be removed and the remaining clues renumbered. Clues with submissions can only be deactivated.</p>
      </Modal>
    </div>
  );
}

function ClueEditor({ initial, onClose, onSaved }: { initial: Partial<ClueRow>; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [c, setC] = useState<Partial<ClueRow>>(initial);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const set = <K extends keyof ClueRow>(k: K, v: ClueRow[K] | null) => setC((x) => ({ ...x, [k]: v }));
  const numOrNull = (v: string) => (v === "" ? null : Number(v));

  async function pinMyLocation() {
    setLocating(true);
    try {
      const p = await getPosition();
      setC((x) => ({ ...x, target_lat: +p.coords.latitude.toFixed(6), target_lng: +p.coords.longitude.toFixed(6) }));
      toast({ kind: "success", title: `Pinned (±${Math.round(p.coords.accuracy)} m)` });
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    setBusy(true);
    const body = {
      title: c.title,
      body: c.body,
      body_alt: c.body_alt || null,
      language: c.language,
      difficulty: c.difficulty,
      target_lat: Number(c.target_lat),
      target_lng: Number(c.target_lng),
      radius_m: Number(c.radius_m),
      time_limit_minutes: c.time_limit_minutes ? Number(c.time_limit_minutes) : null,
      deadline_at: c.deadline_at ? new Date(c.deadline_at).toISOString() : null,
      points: Number(c.points),
      photo_required: c.photo_required,
      is_active: c.is_active,
      hint: c.hint || null,
      hint_penalty: Number(c.hint_penalty),
      unlock_rule: c.unlock_rule,
      reveal_zone: c.reveal_zone,
      max_gps_attempts: c.max_gps_attempts === null || c.max_gps_attempts === undefined ? null : Number(c.max_gps_attempts),
    };
    try {
      await api(c.id ? `/api/admin/clues/${c.id}` : "/api/admin/clues", { method: c.id ? "PATCH" : "POST", body: JSON.stringify(body) });
      toast({ kind: "success", title: c.id ? "Clue updated" : "Clue created" });
      onSaved();
    } catch (e) {
      const d = (e as Error & { data?: { issues?: string[] } }).data;
      toast({ kind: "error", title: (e as Error).message, body: d?.issues?.join(" · ") });
    } finally {
      setBusy(false);
    }
  }

  const toLocal = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={c.id ? `Edit clue #${c.order_index}` : "New clue"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={!c.title || !c.body}>Save clue</Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Title"><Input value={c.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Silent Shelves" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Language">
              <Select value={c.language} onChange={(e) => set("language", e.target.value as ClueRow["language"])}>
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="bilingual">Bilingual</option>
              </Select>
            </Field>
            <Field label="Difficulty">
              <Select value={c.difficulty} onChange={(e) => set("difficulty", e.target.value as ClueRow["difficulty"])}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
                <option value="insane">Insane</option>
              </Select>
            </Field>
          </div>
          <Field label="Cryptic clue"><Textarea value={c.body ?? ""} onChange={(e) => set("body", e.target.value)} rows={4} /></Field>
          <Field label="Alternate language version (optional)" hint="Participants can toggle between the two.">
            <Textarea value={c.body_alt ?? ""} onChange={(e) => set("body_alt", e.target.value)} rows={3} placeholder="हिंदी अनुवाद…" />
          </Field>
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Field label="Hint (optional)"><Input value={c.hint ?? ""} onChange={(e) => set("hint", e.target.value)} /></Field>
            <Field label="Hint penalty"><Input type="number" min={0} value={c.hint_penalty ?? 0} onChange={(e) => set("hint_penalty", Number(e.target.value))} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Points"><Input type="number" min={0} value={c.points ?? 0} onChange={(e) => set("points", Number(e.target.value))} /></Field>
            <Field label="Time limit (min)" hint="Blank = none"><Input type="number" min={1} value={c.time_limit_minutes ?? ""} onChange={(e) => set("time_limit_minutes", numOrNull(e.target.value))} /></Field>
            <Field label="GPS attempts" hint="Blank = event default"><Input type="number" min={0} value={c.max_gps_attempts ?? ""} onChange={(e) => set("max_gps_attempts", numOrNull(e.target.value))} /></Field>
          </div>
          <Field label="Absolute deadline (optional)">
            <Input type="datetime-local" value={toLocal(c.deadline_at)} onChange={(e) => set("deadline_at", e.target.value ? new Date(e.target.value).toISOString() : null)} />
          </Field>
          <Field label="Next clue unlock rule">
            <Select value={c.unlock_rule} onChange={(e) => set("unlock_rule", e.target.value as ClueRow["unlock_rule"])}>
              {Object.entries(RULE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          <div className="space-y-3 rounded-xl border border-white/10 p-3">
            <Switch checked={Boolean(c.photo_required)} onChange={(v) => set("photo_required", v)} label="Photo submission required" />
            <Switch checked={Boolean(c.is_active)} onChange={(v) => set("is_active", v)} label="Active" description="Inactive clues are skipped by every team." />
            <Switch checked={Boolean(c.reveal_zone)} onChange={(v) => set("reveal_zone", v)} label="Reveal approximate zone" description="Shows participants a wide circle that contains (but isn't centred on) the target." />
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_1fr_100px] gap-3">
            <Field label="Latitude"><Input type="number" step="0.000001" value={c.target_lat ?? ""} onChange={(e) => set("target_lat", Number(e.target.value))} /></Field>
            <Field label="Longitude"><Input type="number" step="0.000001" value={c.target_lng ?? ""} onChange={(e) => set("target_lng", Number(e.target.value))} /></Field>
            <Field label="Radius (m)"><Input type="number" min={5} max={2000} value={c.radius_m ?? 30} onChange={(e) => set("radius_m", Number(e.target.value))} /></Field>
          </div>
          <Button size="sm" variant="cyan" onClick={pinMyLocation} loading={locating}>
            <Crosshair className="h-4 w-4" /> Use my current location
          </Button>
          <p className="text-xs text-slate-500">Or click on the map to drop the target pin.</p>
          <HuntMap
            height={380}
            fit={false}
            center={{ lat: Number(c.target_lat) || IIT_PATNA.lat, lng: Number(c.target_lng) || IIT_PATNA.lng }}
            zoom={17}
            markers={[{ id: "t", lat: Number(c.target_lat), lng: Number(c.target_lng), label: "Target", color: "#39ff88", pulse: true }]}
            circles={[{ id: "r", lat: Number(c.target_lat), lng: Number(c.target_lng), radius: Number(c.radius_m) || 30, color: "#39ff88" }]}
            onClick={(lat, lng) => setC((x) => ({ ...x, target_lat: +lat.toFixed(6), target_lng: +lng.toFixed(6) }))}
          />
        </div>
      </div>
    </Modal>
  );
}
