import "server-only";
import type { AdminRole } from "@/lib/types";
import { HttpError } from "./http";
import { loadCurrentEvent, requireAdmin } from "./auth";

export async function requireAdminEvent(min: AdminRole = "reviewer") {
  const ctx = await requireAdmin(min);
  const current = await loadCurrentEvent(ctx.db);
  if (!current) throw new HttpError(404, "No event exists yet. Create one in Event Settings.");
  return { ...ctx, ...current };
}

export function csv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return (columns ?? []).join(",") + "\n";
  const cols = columns ?? Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v == null) return "";
    let s = Array.isArray(v) ? v.join("; ") : typeof v === "object" ? JSON.stringify(v) : String(v);
    // Neutralise spreadsheet formula injection
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
