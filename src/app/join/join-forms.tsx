"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, LogIn, MapPin, Plus, QrCode, Trash2, UserPlus } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, cn } from "@/lib/utils";

export function JoinForms({ registrationOpen, eventName, configured }: { registrationOpen: boolean; eventName: string | null; configured: boolean }) {
  const params = useSearchParams();
  const code = params.get("code")?.toUpperCase() ?? "";
  const [tab, setTab] = useState<"login" | "register">(params.get("tab") === "register" && registrationOpen ? "register" : "login");

  return (
    <div className="animate-rise">
      <p className="hud-label">{eventName ?? "HuntX"}</p>
      <h1 className="mt-2 font-display text-3xl font-bold text-white">{tab === "login" ? "Enter the hunt" : "Register your team"}</h1>
      <p className="mt-2 text-sm text-slate-400">
        {tab === "login" ? "Sign in with your team username, team code or email." : "One account per team. Everyone on the team can log in with it."}
      </p>
      {!configured && (
        <p className="mt-4 rounded-xl border border-amber/30 bg-amber/10 p-3 text-xs text-amber">
          Backend not configured yet — sign-in will fail until Supabase keys are set (see README).
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 rounded-xl border border-white/10 bg-ink-900/70 p-1 text-sm">
        <button onClick={() => setTab("login")} className={cn("rounded-lg py-2 transition", tab === "login" ? "bg-white/10 text-white" : "text-slate-500")}>
          Log in
        </button>
        <button
          onClick={() => registrationOpen && setTab("register")}
          disabled={!registrationOpen}
          className={cn("rounded-lg py-2 transition disabled:opacity-40", tab === "register" ? "bg-white/10 text-white" : "text-slate-500")}
          title={registrationOpen ? undefined : "Registration is closed — organisers create team accounts"}
        >
          Register
        </button>
      </div>

      <div className="glass mt-4 p-5">{tab === "login" ? <LoginForm code={code} /> : <RegisterForm />}</div>
    </div>
  );
}

function LoginForm({ code }: { code: string }) {
  const router = useRouter();
  const toast = useToast();
  const [identifier, setIdentifier] = useState(code);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => setIdentifier(code), [code]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api<{ redirect: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password, mode: "team" }),
      });
      router.replace(r.redirect);
      router.refresh();
    } catch (err) {
      toast({ kind: "error", title: "Sign-in failed", body: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {code && (
        <div className="flex items-center gap-2 rounded-xl border border-cyan/30 bg-cyan/10 px-3 py-2 text-xs text-cyan">
          <QrCode className="h-4 w-4" /> Joining with team code <span className="font-mono font-bold">{code}</span>
        </div>
      )}
      <Field label="Username, team code or email">
        <Input autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="pixel_hunters  or  K7PQ2M" required />
      </Field>
      <Field label="Password">
        <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
      </Field>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
        <LogIn className="h-4 w-4" /> Enter hunt
      </Button>
    </form>
  );
}

function RegisterForm() {
  const router = useRouter();
  const toast = useToast();
  const [f, setF] = useState({ teamName: "", leaderName: "", username: "", password: "", contactEmail: "" });
  const [members, setMembers] = useState<string[]>([""]);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) return toast({ kind: "warning", title: "Please accept the consent notice" });
    setLoading(true);
    try {
      const r = await api<{ redirect: string; team: { team_uid: string; join_code: string } }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          ...f,
          username: f.username.toLowerCase(),
          members: members.filter((m) => m.trim()).map((name) => ({ name })),
          consent: true,
        }),
      });
      toast({ kind: "success", title: `Team created · ${r.team.team_uid}`, body: `Team code: ${r.team.join_code}` });
      router.replace(r.redirect);
      router.refresh();
    } catch (err) {
      const d = (err as Error & { data?: { issues?: string[] } }).data;
      toast({ kind: "error", title: (err as Error).message, body: d?.issues?.join(" · ") });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Team name">
        <Input value={f.teamName} onChange={set("teamName")} required minLength={2} maxLength={48} placeholder="Pixel Hunters" />
      </Field>
      <Field label="Team leader">
        <Input value={f.leaderName} onChange={set("leaderName")} required minLength={2} placeholder="Full name" />
      </Field>
      <div>
        <span className="mb-1.5 block text-xs font-medium text-slate-400">Other members</span>
        <div className="space-y-2">
          {members.map((m, i) => (
            <div key={i} className="flex gap-2">
              <Input value={m} onChange={(e) => setMembers(members.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Member ${i + 2}`} />
              <Button type="button" variant="ghost" onClick={() => setMembers(members.filter((_, j) => j !== i))} aria-label="Remove member" disabled={members.length === 1}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        {members.length < 5 && (
          <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setMembers([...members, ""])}>
            <Plus className="h-3.5 w-3.5" /> Add member
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Username" hint="a–z, 0–9, _">
          <Input value={f.username} onChange={set("username")} required pattern="[a-zA-Z0-9_]{3,24}" placeholder="pixel_hunters" />
        </Field>
        <Field label="Password" hint="min 8 characters">
          <Input type="password" autoComplete="new-password" value={f.password} onChange={set("password")} required minLength={8} />
        </Field>
      </div>
      <Field label="Contact email (optional)">
        <Input type="email" value={f.contactEmail} onChange={set("contactEmail")} placeholder="leader@iitp.ac.in" />
      </Field>
      <label className="flex cursor-pointer gap-3 rounded-xl border border-white/10 bg-ink-900/60 p-3 text-xs text-slate-400">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-[#39ff88]" />
        <span>
          I understand HuntX will use <MapPin className="inline h-3 w-3 text-cyan" /> location only when we tap <b>Verify Location</b> (or opt into periodic sharing),{" "}
          <Camera className="inline h-3 w-3 text-cyan" /> the camera only on the capture screen, and will log when we leave the hunt page. Data is visible to organisers and deleted after the event retention period.
        </span>
      </label>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
        <UserPlus className="h-4 w-4" /> Create team
      </Button>
    </form>
  );
}
