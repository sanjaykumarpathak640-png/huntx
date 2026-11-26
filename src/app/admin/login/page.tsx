"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button, Field, Input, Logo } from "@/components/ui";
import { useToast } from "@/components/toast";
import { MapBackdrop } from "@/components/landing/backdrop";
import { api } from "@/lib/utils";

export default function AdminLogin() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
              <h1 className="font-display text-xl font-bold text-white">Mission control</h1>
              <p className="text-xs text-slate-500">Organiser access only</p>
            </div>
          </div>
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
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-slate-600">
          First admin? Run <code className="text-slate-400">npm run create-admin</code> (see README).
        </p>
      </div>
    </main>
  );
}
