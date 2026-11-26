"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button, Field, Input, Logo } from "@/components/ui";
import { useToast } from "@/components/toast";
import { MapBackdrop } from "@/components/landing/backdrop";
import { api } from "@/lib/utils";

export default function ResetPassword() {
  const router = useRouter();
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) return toast({ kind: "error", title: "Passwords don't match" });
    setBusy(true);
    try {
      await api("/api/auth/reset", { method: "POST", body: JSON.stringify({ password: pw }) });
      toast({ kind: "success", title: "Password set", body: "You're signed in. Use this password next time." });
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      const d = (err as Error & { data?: { issues?: string[] } }).data;
      toast({ kind: "error", title: (err as Error).message, body: d?.issues?.join(" · ") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative grid min-h-dvh place-items-center px-4">
      <MapBackdrop />
      <div className="relative w-full max-w-sm animate-rise">
        <Logo className="mb-8" />
        <div className="glass corner-frame p-6">
          <h1 className="font-display text-xl font-bold text-white">Set a new admin password</h1>
          <p className="mt-1 text-xs text-slate-500">At least 10 characters with letters and numbers. Only you will know it.</p>
          <form onSubmit={save} className="mt-6 space-y-4">
            <Field label="New password"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={10} /></Field>
            <Field label="Confirm new password"><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></Field>
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
              <KeyRound className="h-4 w-4" /> Save password
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
