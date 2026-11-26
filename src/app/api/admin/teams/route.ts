import { z } from "zod";
import { HttpError, json, parseBody, route } from "@/lib/server/http";
import { requireAdminEvent } from "@/lib/server/admin-helpers";
import { computeLeaderboard } from "@/lib/server/leaderboard";
import { availableUsername, randomPassword, slugUsername, teamEmail, uniqueTeamCodes } from "@/lib/server/codes";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const { db, event, settings } = await requireAdminEvent();
  const [{ data: teams }, { data: members }, { data: active }, board] = await Promise.all([
    db.from("teams").select("*").eq("event_id", event.id).order("created_at"),
    db.from("team_members").select("team_id,name,email,is_leader,teams!inner(event_id)").eq("teams.event_id", event.id),
    db
      .from("team_progress")
      .select("team_id,location_verified_at,clues(order_index,title),teams!inner(event_id)")
      .eq("teams.event_id", event.id)
      .eq("status", "active"),
    computeLeaderboard(db, event, settings),
  ]);
  const byTeam = new Map(board.map((r) => [r.team_id, r]));
  const rows = (teams ?? []).map((t) => {
    const lb = byTeam.get(t.id);
    const cur = (active ?? []).find((a) => a.team_id === t.id) as
      | { location_verified_at: string | null; clues: { order_index: number; title: string } | null }
      | undefined;
    return {
      ...t,
      members: (members ?? []).filter((m) => m.team_id === t.id).map(({ teams: _t, team_id: _i, ...m }) => m),
      score: lb?.score ?? 0,
      rank: lb?.rank ?? null,
      completed: lb?.completed ?? 0,
      current_clue: cur?.clues ? { number: cur.clues.order_index, title: cur.clues.title, verified: Boolean(cur.location_verified_at) } : null,
    };
  });
  return json({ teams: rows });
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(48),
  leader_name: z.string().trim().min(2).max(80),
  members: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/).optional().or(z.literal("")),
  password: z.string().min(8).max(128).optional().or(z.literal("")),
  contact_email: z.string().email().optional().or(z.literal("")),
});

/** Admin-created team accounts. Credentials are returned ONCE. */
export const POST = route(async (req) => {
  const { db, event, user } = await requireAdminEvent("organiser");
  const body = await parseBody(req, createSchema);

  const { data: dupName } = await db.from("teams").select("id").eq("event_id", event.id).ilike("name", body.name.replace(/[\\%_]/g, "\\$&")).limit(1);
  if (dupName?.length) throw new HttpError(409, "Team name already exists.");

  const username = body.username || (await availableUsername(db, slugUsername(body.name)));
  if (body.username) {
    const { data: taken } = await db.from("teams").select("id").eq("username", username).limit(1);
    if (taken?.length) throw new HttpError(409, "Username taken.");
  }
  const password = body.password || randomPassword();

  const { data: created, error: authErr } = await db.auth.admin.createUser({
    email: teamEmail(username),
    password,
    email_confirm: true,
    user_metadata: { team_name: body.name, kind: "team", created_by: user.id },
  });
  if (authErr || !created.user) throw new HttpError(409, authErr?.message ?? "Could not create auth user.");

  const codes = await uniqueTeamCodes(db);
  const { data: team, error } = await db
    .from("teams")
    .insert({
      event_id: event.id,
      auth_user_id: created.user.id,
      name: body.name,
      username,
      leader_name: body.leader_name,
      contact_email: body.contact_email || null,
      created_by_admin: true,
      ...codes,
    })
    .select("*")
    .single();
  if (error || !team) {
    await db.auth.admin.deleteUser(created.user.id);
    throw new HttpError(500, "Could not create team.");
  }
  await db.from("team_members").insert([
    { team_id: team.id, name: body.leader_name, is_leader: true },
    ...(body.members ?? []).filter((m) => m !== body.leader_name).map((name) => ({ team_id: team.id, name })),
  ]);
  await db.from("profiles").upsert({ id: created.user.id, team_id: team.id, role: "participant" });

  return json({ team, credentials: { username, password, join_code: team.join_code } }, 201);
});
