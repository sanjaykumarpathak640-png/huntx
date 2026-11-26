"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Crosshair, Download, Eye, EyeOff, FileUp, ImageIcon, ImagePlus, MapPin, Pencil, Plus, Puzzle, Trash2, X } from "lucide-react";
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Spinner, Switch, Textarea } from "@/components/ui";
import { HuntMap } from "@/components/map";
import { useToast } from "@/components/toast";
import { useAdminData } from "@/components/admin/admin-context";
import { getPosition } from "@/hooks/use-online";
import { IIT_PATNA } from "@/lib/geo";
import { api, cn } from "@/lib/utils";
import type { ClueRow } from "@/lib/types";

type ClueWithStats = ClueRow & { image_url?: string | null; stats: { active: number; completed: number } };

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
  const [forceCount, setForceCount] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
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

  async function remove(force = false) {
    if (!del) return;
    try {
      await api(`/api/admin/clues/${del.id}${force ? "?force=1" : ""}`, { method: "DELETE" });
      toast({ kind: "success", title: "Challenge removed" });
      setDel(null);
      setForceCount(null);
      reload();
    } catch (e) {
      const err = e as Error & { status?: number; data?: { submissions?: number } };
      if (err.status === 409 && err.data?.submissions) setForceCount(err.data.submissions);
      else toast({ kind: "error", title: err.message });
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
          <Button onClick={() => setImporting(true)}>
            <FileUp className="h-4 w-4" /> Upload CSV
          </Button>
          <Button variant="primary" onClick={() => setEditing(empty())}>
            <Plus className="h-4 w-4" /> New challenge
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
              {c.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.image_url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="hidden h-16 w-16 shrink-0 place-items-center rounded-xl border border-dashed border-white/10 text-slate-700 sm:grid">
                  <ImageIcon className="h-5 w-5" />
                </div>
              )}
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
        onClose={() => {
          setDel(null);
          setForceCount(null);
        }}
        title="Remove this challenge?"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setDel(null); setForceCount(null); }}>Cancel</Button>
            {forceCount ? (
              <Button variant="danger" onClick={() => remove(true)}>Delete clue + {forceCount} photo(s)</Button>
            ) : (
              <Button variant="danger" onClick={() => remove(false)}>Delete</Button>
            )}
          </>
        }
      >
        <p className="text-sm text-slate-300">“{del?.title}” will be removed and the remaining clues renumbered.</p>
        {forceCount ? (
          <p className="mt-3 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            Teams already submitted {forceCount} photo(s) for this clue. Deleting it also permanently deletes those photos and the points earned for it. To keep them, use the 👁 button to deactivate instead.
          </p>
        ) : null}
      </Modal>

      {importing && <ImportModal onClose={() => setImporting(false)} onDone={() => { setImporting(false); reload(); }} />}
    </div>
  );
}

function ClueEditor({ initial, onClose, onSaved }: { initial: Partial<ClueRow>; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [c, setC] = useState<Partial<ClueRow>>(initial);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>((initial as ClueWithStats).image_url ?? null);
  const [removeImage, setRemoveImage] = useState(false);
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
      const r = await api<{ clue: ClueRow }>(c.id ? `/api/admin/clues/${c.id}` : "/api/admin/clues", { method: c.id ? "PATCH" : "POST", body: JSON.stringify(body) });
      const id = r.clue.id;
      if (imageFile) {
        const fd = new FormData();
        fd.append("image", imageFile);
        await api(`/api/admin/clues/${id}/image`, { method: "POST", body: fd });
      } else if (removeImage && c.id) {
        await api(`/api/admin/clues/${id}/image`, { method: "DELETE" });
      }
      toast({ kind: "success", title: c.id ? "Challenge updated" : "Challenge created" });
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
          <div>
            <span className="mb-1.5 block text-xs font-medium text-slate-400">Challenge image (optional)</span>
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/15 p-3">
              {imageFile || (imageUrl && !removeImage) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageFile ? URL.createObjectURL(imageFile) : imageUrl!} alt="" className="h-20 w-20 rounded-lg object-cover" />
              ) : (
                <div className="grid h-20 w-20 place-items-center rounded-lg bg-white/[0.03] text-slate-600"><ImageIcon className="h-6 w-6" /></div>
              )}
              <div className="flex flex-col gap-2">
                <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs text-slate-100 hover:bg-white/[0.1]">
                  <ImagePlus className="h-3.5 w-3.5" /> {imageUrl || imageFile ? "Replace image" : "Upload image"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      if (f.size > 5 * 1024 * 1024) return toast({ kind: "error", title: "Image must be under 5 MB" });
                      setImageFile(f);
                      setRemoveImage(false);
                    }}
                  />
                </label>
                {(imageFile || (imageUrl && !removeImage)) && (
                  <Button size="sm" variant="ghost" onClick={() => { setImageFile(null); if (imageUrl) setRemoveImage(true); }}>
                    <X className="h-3.5 w-3.5" /> Remove image
                  </Button>
                )}
              </div>
            </div>
            <p className="mt-1 text-[11px] text-slate-600">Shown to teams only when this clue is unlocked (e.g. a cropped photo of the spot).</p>
          </div>
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

/* ---------------- CSV bulk upload ---------------- */

const CSV_HEADERS = ["title", "clue", "clue_hindi", "latitude", "longitude", "radius_m", "points", "time_limit_min", "hint", "hint_penalty", "difficulty", "photo_required"];
const TEMPLATE =
  CSV_HEADERS.join(",") +
  "\n" +
  '"Silent Shelves","A thousand voices sleep here, yet none may speak.","",25.5357,84.8512,35,120,25,"Books, not people.",25,medium,yes\n' +
  '"Fuel for Thought","Where minds refuel between lectures.","जहाँ लेक्चर के बीच दिमाग़ रिचार्ज होता है।",25.5371,84.853,35,120,25,"Follow the chai.",25,easy,yes\n';

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

function rowsToClues(text: string) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("CSV has no data rows.");
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (r: string[], name: string) => {
    const i = head.indexOf(name);
    return i >= 0 ? (r[i] ?? "").trim() : "";
  };
  const errors: string[] = [];
  const clues = rows.slice(1).map((r, idx) => {
    const line = idx + 2;
    const lat = Number(col(r, "latitude"));
    const lng = Number(col(r, "longitude"));
    const title = col(r, "title");
    const body = col(r, "clue");
    if (!title || !body) errors.push(`Row ${line}: title and clue are required`);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !col(r, "latitude")) errors.push(`Row ${line}: latitude/longitude missing`);
    const num = (n: string, d: number) => (n === "" || !Number.isFinite(Number(n)) ? d : Math.round(Number(n)));
    const diff = col(r, "difficulty").toLowerCase();
    const alt = col(r, "clue_hindi");
    return {
      title,
      body,
      body_alt: alt || null,
      language: alt ? "bilingual" : "en",
      difficulty: ["easy", "medium", "hard", "insane"].includes(diff) ? diff : "medium",
      target_lat: lat,
      target_lng: lng,
      radius_m: Math.min(2000, Math.max(5, num(col(r, "radius_m"), 30))),
      points: num(col(r, "points"), 100),
      time_limit_minutes: col(r, "time_limit_min") ? num(col(r, "time_limit_min"), 20) : null,
      hint: col(r, "hint") || null,
      hint_penalty: num(col(r, "hint_penalty"), 20),
      photo_required: !/^(no|false|0|n)$/i.test(col(r, "photo_required")),
      is_active: true,
      unlock_rule: "on_submission",
      reveal_zone: false,
    };
  });
  return { clues, errors };
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [parsed, setParsed] = useState<{ clues: ReturnType<typeof rowsToClues>["clues"]; errors: string[] } | null>(null);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);

  function download() {
    const blob = new Blob(["\uFEFF" + TEMPLATE], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "huntx-challenges-template.csv";
    a.click();
  }

  async function onFile(f: File) {
    try {
      setParsed(rowsToClues(await f.text()));
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
    }
  }

  async function doImport() {
    if (!parsed) return;
    setBusy(true);
    try {
      const r = await api<{ imported: number }>("/api/admin/clues/import", { method: "POST", body: JSON.stringify({ clues: parsed.clues, replace }) });
      toast({ kind: "success", title: `${r.imported} challenges added` });
      onDone();
    } catch (e) {
      const d = (e as Error & { data?: { issues?: string[] } }).data;
      toast({ kind: "error", title: (e as Error).message, body: d?.issues?.slice(0, 3).join(" · ") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Upload challenges (CSV)"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={doImport} loading={busy} disabled={!parsed || parsed.errors.length > 0 || parsed.clues.length === 0}>
            Add {parsed?.clues.length ?? 0} challenges
          </Button>
        </>
      }
    >
      <ol className="space-y-4 text-sm text-slate-300">
        <li>
          <p className="font-semibold text-slate-100">1. Download the template</p>
          <p className="text-xs text-slate-500">Open it in Excel / Google Sheets, one row per challenge.</p>
          <Button size="sm" className="mt-2" onClick={download}><Download className="h-3.5 w-3.5" /> Template CSV</Button>
        </li>
        <li>
          <p className="font-semibold text-slate-100">2. Upload the filled file</p>
          <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 p-5 text-slate-400 hover:border-neon/40 hover:text-neon">
            <FileUp className="h-5 w-5" /> Choose .csv file
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        </li>
      </ol>
      {parsed && (
        <div className="mt-4 space-y-2">
          {parsed.errors.length ? (
            <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
              {parsed.errors.slice(0, 6).map((e) => <p key={e}>{e}</p>)}
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-white/10">
              {parsed.clues.map((c, i) => (
                <p key={i} className="border-b border-white/5 px-3 py-2 text-xs text-slate-300 last:border-0">
                  <span className="font-mono text-neon">{i + 1}.</span> {c.title} <span className="text-slate-600">· {c.points} pts · r={c.radius_m} m</span>
                </p>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="accent-[#ff4d6d]" />
            Replace all existing challenges (only possible before any photo is submitted)
          </label>
        </div>
      )}
    </Modal>
  );
}
