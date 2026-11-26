"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Camera, Check, Copy, MapPin, Plus, Trash2, UserPlus } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, cn } from "@/lib/utils";

const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

export function JoinForms({ registrationOpen, eventName, configured }: { registrationOpen: boolean; eventName: string | null; configured: boolean }) {
  const params = useSearchParams();
  const qrCode = clean(params.get("code") ?? "");
  const [tab, setTab] = useState<"code" | "register">(params.get("tab") === "register" && registrationOpen ? "register" : "code");

  return (
    <div className="animate-rise">
      <p className="hud-label">{eventName ?? "HuntX"}</p>
      <h1 className="mt-2 font-display text-3xl font-bold text-white">{tab === "code" ? "Enter your team code" : "Create your team"}</h1>
      <p className="mt-2 text-sm text-slate-400">
        {tab === "code" ? "One 6-letter code per team. Every member uses the same code." : "Takes 20 seconds. You'll get a team code to share with your teammates."}
      </p>
      {!configured && (
        <p className="mt-4 rounded-xl border border-amber/30 bg-amber/10 p-3 text-xs text-amber">Backend not configured yet.</p>
      )}

      <div className="mt-6 grid grid-cols-2 rounded-xl border border-white/10 bg-ink-900/70 p-1 text-sm">
        <button onClick={() => setTab("code")} className={cn("rounded-lg py-2.5 transition", tab === "code" ? "bg-white/10 text-white" : "text-slate-500")}>
          I have a code
        </button>
        <button
          onClick={() => registrationOpen && setTab("register")}
          disabled={!registrationOpen}
          className={cn("rounded-lg py-2.5 transition disabled:opacity-40", tab === "register" ? "bg-white/10 text-white" : "text-slate-500")}
          title={registrationOpen ? undefined : "Registration is closed — organisers will give you a code"}
        >
          New team
        </button>
      </div>

      <div className="glass mt-4 p-5">{tab === "code" ? <CodeForm initial={qrCode} /> : <RegisterForm />}</div>
    </div>
  );
}

function CodeForm({ initial }: { initial: string }) {
  const router = useRouter();
  const toast = useToast();
  const [code, setCode] = useState(initial);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoTried = useRef(false);

  async function go(c = code) {
    if (c.length !== 6) return toast({ kind: "warning", title: "Team code has 6 characters" });
    setLoading(true);
    try {
      const r = await api<{ redirect: string; team: string }>("/api/auth/code", { method: "POST", body: JSON.stringify({ code: c }) });
      toast({ kind: "success", title: `Welcome, ${r.team}!` });
      router.replace(r.redirect);
      router.refresh();
    } catch (err) {
      toast({ kind: "error", title: (err as Error).message });
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  // Scanned a QR code → log straight in.
  useEffect(() => {
    if (initial.length === 6 && !autoTried.current) {
      autoTried.current = true;
      go(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      className="space-y-5"
    >
      <div className="relative" onClick={() => inputRef.current?.focus()}>
        <input
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(clean(e.target.value))}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          autoFocus
          aria-label="Team code"
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
        />
        <div className="grid grid-cols-6 gap-2" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "grid h-14 place-items-center rounded-xl border bg-ink-900 font-mono text-2xl font-bold text-white transition sm:h-16",
                i === code.length ? "border-neon shadow-neon" : code[i] ? "border-cyan/40" : "border-white/10",
              )}
            >
              {code[i] ?? ""}
            </div>
          ))}
        </div>
      </div>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading} disabled={code.length !== 6}>
        Enter hunt <ArrowRight className="h-4 w-4" />
      </Button>
      <p className="text-center text-xs text-slate-500">Don&apos;t have a code? Ask your team leader, scan the team QR, or create a new team.</p>
    </form>
  );
}

function RegisterForm() {
  const router = useRouter();
  const toast = useToast();
  const [teamName, setTeamName] = useState("");
  const [leaderName, setLeaderName] = useState("");
  const [members, setMembers] = useState<string[]>([""]);
  const [consent, setConsent] = useState(true);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ name: string; join_code: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) return toast({ kind: "warning", title: "Please accept the notice" });
    setLoading(true);
    try {
      const r = await api<{ team: { name: string; join_code: string } }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ teamName, leaderName, members: members.filter((m) => m.trim()), consent: true }),
      });
      setDone(r.team);
    } catch (err) {
      const d = (err as Error & { data?: { issues?: string[] } }).data;
      toast({ kind: "error", title: (err as Error).message, body: d?.issues?.join(" · ") });
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-neon/15 text-neon">
          <Check className="h-6 w-6" />
        </div>
        <p className="mt-3 font-display text-lg font-semibold text-white">Team {done.name} is ready!</p>
        <p className="mt-4 hud-label">Your team code</p>
        <p className="mt-1 font-mono text-4xl font-bold tracking-[0.3em] text-neon">{done.join_code}</p>
        <p className="mt-2 text-xs text-slate-400">Share this code with your teammates. They just type it on the Join page.</p>
        <div className="mt-5 grid gap-2">
          <Button
            onClick={() => {
              navigator.clipboard?.writeText(done.join_code);
              toast({ kind: "success", title: "Code copied" });
            }}
          >
            <Copy className="h-4 w-4" /> Copy code
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              router.replace("/hunt");
              router.refresh();
            }}
          >
            Go to hunt <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Team name">
        <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} required minLength={2} maxLength={48} placeholder="Pixel Hunters" />
      </Field>
      <Field label="Your name (team leader)">
        <Input value={leaderName} onChange={(e) => setLeaderName(e.target.value)} required minLength={2} placeholder="Full name" />
      </Field>
      <div>
        <span className="mb-1.5 block text-xs font-medium text-slate-400">Teammates (optional)</span>
        <div className="space-y-2">
          {members.map((m, i) => (
            <div key={i} className="flex gap-2">
              <Input value={m} onChange={(e) => setMembers(members.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Member ${i + 2}`} />
              {members.length > 1 && (
                <Button type="button" variant="ghost" onClick={() => setMembers(members.filter((_, j) => j !== i))} aria-label="Remove">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
        {members.length < 5 && (
          <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setMembers([...members, ""])}>
            <Plus className="h-3.5 w-3.5" /> Add teammate
          </Button>
        )}
      </div>
      <label className="flex cursor-pointer gap-3 rounded-xl border border-white/10 bg-ink-900/60 p-3 text-xs text-slate-400">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[#39ff88]" />
        <span>
          OK to use <MapPin className="inline h-3 w-3 text-cyan" /> location when we tap Verify, <Camera className="inline h-3 w-3 text-cyan" /> the camera on the capture screen, and to log when we leave the hunt page.
        </span>
      </label>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
        <UserPlus className="h-4 w-4" /> Create team
      </Button>
    </form>
  );
}
