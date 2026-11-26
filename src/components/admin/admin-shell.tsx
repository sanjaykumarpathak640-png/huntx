"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Camera, LayoutDashboard, LogOut, Map, Menu, Puzzle, Radio, Settings, Trophy, Users, Volume2, VolumeX, X } from "lucide-react";
import { Badge, Logo, statusTone } from "@/components/ui";
import { cn, api } from "@/lib/utils";
import type { AdminRole } from "@/lib/types";
import { AdminProvider, useAdmin } from "./admin-context";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/teams", label: "Teams", icon: Users },
  { href: "/admin/clues", label: "Clues", icon: Puzzle, min: "organiser" as AdminRole },
  { href: "/admin/map", label: "Live Map", icon: Map },
  { href: "/admin/submissions", label: "Photo Submissions", icon: Camera },
  { href: "/admin/alerts", label: "Alerts", icon: Bell },
  { href: "/admin/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/admin/settings", label: "Event Settings", icon: Settings, min: "organiser" as AdminRole },
];

export function AdminShell({ email, role, children }: { email: string; role: AdminRole; children: React.ReactNode }) {
  return (
    <AdminProvider email={email} role={role}>
      <Shell>{children}</Shell>
    </AdminProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { event, unread, realtime, sound, setSound, email, role, can } = useAdmin();
  const [open, setOpen] = useState(false);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/admin/login");
    router.refresh();
  }

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Link href="/admin">
          <Logo />
        </Link>
        <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="h-5 w-5 text-slate-400" />
        </button>
      </div>
      {event && (
        <div className="mx-4 mb-4 rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <p className="hud-label">Current event</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-200">{event.name}</p>
          <Badge tone={statusTone[event.phase]} dot className="mt-2">
            {event.phase}
          </Badge>
        </div>
      )}
      <ul className="flex-1 space-y-1 px-3">
        {NAV.filter((n) => !n.min || can(n.min)).map((n) => {
          const active = n.href === "/admin" ? path === "/admin" : path.startsWith(n.href);
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                  active ? "bg-neon/10 text-neon" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200",
                )}
              >
                <n.icon className="h-4 w-4" />
                <span className="flex-1">{n.label}</span>
                {n.href === "/admin/alerts" && unread > 0 && (
                  <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-white/5 p-4">
        <p className="truncate text-xs text-slate-400">{email}</p>
        <p className="font-mono text-[10px] uppercase tracking-wider text-slate-600">{role.replace("_", " ")}</p>
        <button onClick={logout} className="mt-3 inline-flex items-center gap-2 text-xs text-slate-500 hover:text-slate-200">
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-white/5 bg-ink-900/80 backdrop-blur-xl lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="h-full w-72 border-r border-white/5 bg-ink-900" onClick={(e) => e.stopPropagation()}>
            {nav}
          </aside>
        </div>
      )}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-white/5 bg-ink-950/80 px-4 backdrop-blur-xl sm:px-6">
        <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="h-5 w-5 text-slate-300" />
        </button>
        <div className="hidden lg:block" />
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
              realtime === "live" ? "border-neon/30 text-neon" : realtime === "off" ? "border-danger/40 text-danger" : "border-amber/30 text-amber",
            )}
          >
            <Radio className="h-3 w-3" /> {realtime === "live" ? "Realtime" : realtime === "off" ? "Disconnected" : "Connecting"}
          </span>
          <button onClick={() => setSound(!sound)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5" aria-label="Toggle sound alerts" title="Sound alerts">
            {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <Link href="/admin/alerts" className="relative rounded-lg p-2 text-slate-400 hover:bg-white/5" aria-label="Alerts">
            <Bell className="h-4 w-4" />
            {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" />}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
