"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import { Button, Field, Input, Logo } from "@/components/ui";
import { useToast } from "@/components/toast";
import { MapBackdrop } from "@/components/landing/backdrop";
import { api } from "@/lib/utils";

export default function AdminLogin() {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<"login" | "forgot" | "sent">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("reset") === "expired") {
      toast({ kind: "error", title: "Reset link expired or already used", body: "Request a new one below." });
      setMode("forgot");
    }
  }, [toast]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: email, password, mode: "admin" }) });
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      toast({ kind: "error", title: "Access denied", body: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function forgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email }) });
      setMode("sent");
    } catch (err) {
      toast({ kind: "error", title: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative grid min-h-dvh place-items-center px-4">
      <MapBackdrop />
      <div className="relative w-full max-w-sm animate-rise">
        <Link href="/" className="mb-8 inline-block">
          <Logo />
        </Link>
        <div className="glass corner-frame p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-neon/30 bg-neon/10 p-2.5 text-neon">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-white">{mode === "login" ? "Mission control" : "Reset password"}</h1>
              <p className="text-xs text-slate-500">Organiser access only</p>
            </div>
          </div>

          {mode === "login" && (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <Field label="Email">
                <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Field>
              <Field label="Password">
                <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </Field>
              <Button type="submit" variant="primary" className="w-full" size="lg" loading={loading}>
                <KeyRound className="h-4 w-4" /> Sign in
              </Button>
              <button type="button" onClick={() => setMode("forgot")} className="w-full text-center text-xs text-cyan hover:underline">
                Forgot password?
              </button>
            </form>
          )}

          {mode === "forgot" && (
            <form onSubmit={forgot} className="mt-6 space-y-4">
              <p className="text-sm text-slate-400">Enter your organiser email. We&apos;ll send a link to set a new password.</p>
              <Field label="Organiser email">
                <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Field>
              <Button type="submit" variant="primary" className="w-full" size="lg" loading={loading}>
                <Mail className="h-4 w-4" /> Send reset link
              </Button>
              <button type="button" onClick={() => setMode("login")} className="w-full text-center text-xs text-slate-500 hover:text-slate-300">
                ← Back to sign in
              </button>
            </form>
          )}

          {mode === "sent" && (
            <div className="mt-6 space-y-3 text-sm text-slate-300">
              <p>📬 If <b className="text-white">{email}</b> is an organiser account, a reset link is on its way.</p>
              <p className="text-xs text-slate-500">Open it on this device within 1 hour. Check Spam/Promotions if you don&apos;t see it in a minute.</p>
              <button type="button" onClick={() => setMode("login")} className="text-xs text-cyan hover:underline">
                ← Back to sign in
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
