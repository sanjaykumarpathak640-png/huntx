import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";
import { resolveSettings, type EventSettings } from "@/lib/settings";
import type { AdminRole, EventRow, TeamRow } from "@/lib/types";
import { HttpError } from "./http";

const ROLE_RANK: Record<AdminRole, number> = { reviewer: 1, organiser: 2, super_admin: 3 };

export async function getSessionUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = createServerSupabase();
  const { data } = await sb.auth.getUser(); // validates the JWT with Supabase Auth
  return data.user ?? null;
}

export interface TeamContext {
  user: User;
  team: TeamRow;
  event: EventRow;
  settings: EventSettings;
  db: SupabaseClient;
}

export async function requireTeam(opts: { allowDisabled?: boolean } = {}): Promise<TeamContext> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Please sign in with your team account.");
  const db = getAdminSupabase();
  const { data: team } = await db.from("teams").select("*").eq("auth_user_id", user.id).maybeSingle();
  if (!team) throw new HttpError(403, "This account is not linked to a team.");
  if (team.status === "disabled" && !opts.allowDisabled) {
    throw new HttpError(403, "Your team has been disabled by the organisers.");
  }
  const { event, settings } = await loadEvent(db, team.event_id);
  return { user, team: team as TeamRow, event, settings, db };
}

export interface AdminContext {
  user: User;
  role: AdminRole;
  db: SupabaseClient;
}

export async function requireAdmin(min: AdminRole = "reviewer"): Promise<AdminContext> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Admin sign-in required.");
  const db = getAdminSupabase();
  const { data: admin } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) throw new HttpError(403, "Not an organiser account.");
  const role = admin.role as AdminRole;
  if (ROLE_RANK[role] < ROLE_RANK[min]) {
    throw new HttpError(403, `This action needs the "${min}" role or higher.`);
  }
  return { user, role, db };
}

export async function loadEvent(db: SupabaseClient, eventId: string) {
  const [{ data: event }, { data: s }] = await Promise.all([
    db.from("events").select("*").eq("id", eventId).single(),
    db.from("event_settings").select("settings").eq("event_id", eventId).maybeSingle(),
  ]);
  if (!event) throw new HttpError(404, "Event not found.");
  return { event: event as EventRow, settings: resolveSettings(s?.settings) };
}

export async function loadCurrentEvent(db: SupabaseClient) {
  const { data } = await db
    .from("events")
    .select("*")
    .order("is_current", { ascending: false })
    .order("start_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return loadEvent(db, data.id);
}
