import { z } from "zod";
import { HttpError, clientIp, json, parseBody, route } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { loadCurrentEvent } from "@/lib/server/auth";
import { eventPhase } from "@/lib/event-time";
import { teamEmail, uniqueTeamCodes } from "@/lib/server/codes";
import { notify } from "@/lib/server/notify";

export const dynamic = "force-dynamic";

const schema = z.object({
  teamName: z.string().trim().min(2).max(48),
  leaderName: z.string().trim().min(2).max(80),
  members: z.array(z.object({ name: z.string().trim().min(1).max(80), email: z.string().email().optional().or(z.literal("")) })).max(8),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,24}$/, "3–24 chars: lowercase letters, numbers, underscore"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  contactEmail: z.string().email().optional().or(z.literal("")),
  consent: z.literal(true, { errorMap: () => ({ message: "Consent is required" }) }),
});

export const POST = route(async (req) => {
  rateLimit(`register:${clientIp(req)}`, 5, 10 * 60_000);
  const body = await parseBody(req, schema);
  const db = getAdminSupabase();

  const current = await loadCurrentEvent(db);
  if (!current) throw new HttpError(400, "No event is configured yet.");
  const { event, settings } = current;
  if (!settings.registration_open) throw new HttpError(403, "Team registration is closed. Ask the organisers for an account.");
  if (eventPhase(event) === "ended") throw new HttpError(403, "This event has ended.");

  const [{ data: nameTaken }, { data: userTaken }] = await Promise.all([
    db.from("teams").select("id").eq("event_id", event.id).ilike("name", body.teamName.replace(/[\\%_]/g, "\\$&")).limit(1),
    db.from("teams").select("id").eq("username", body.username).limit(1),
  ]);
  if (nameTaken?.length) throw new HttpError(409, "That team name is already taken.");
  if (userTaken?.length) throw new HttpError(409, "That username is already taken.");

  const email = teamEmail(body.username);
  const { data: created, error: authErr } = await db.auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
    user_metadata: { team_name: body.teamName, kind: "team" },
  });
  if (authErr || !created.user) {
    throw new HttpError(409, authErr?.message?.includes("already") ? "That username is already taken." : "Could not create account.");
  }

  const codes = await uniqueTeamCodes(db);
  const { data: team, error: teamErr } = await db
    .from("teams")
    .insert({
      event_id: event.id,
      auth_user_id: created.user.id,
      name: body.teamName,
      username: body.username,
      leader_name: body.leaderName,
      contact_email: body.contactEmail || null,
      ...codes,
    })
    .select("*")
    .single();
  if (teamErr || !team) {
    await db.auth.admin.deleteUser(created.user.id);
    throw new HttpError(409, "Could not create team (name may be taken).");
  }

  const members = [
    { team_id: team.id, name: body.leaderName, is_leader: true, email: body.contactEmail || null },
    ...body.members
      .filter((m) => m.name.trim() && m.name.trim() !== body.leaderName)
      .map((m) => ({ team_id: team.id, name: m.name, email: m.email || null, is_leader: false })),
  ];
  await db.from("team_members").insert(members);
  await db.from("profiles").upsert({ id: created.user.id, team_id: team.id, role: "participant" });

  await notify(db, {
    event_id: event.id,
    team,
    type: "team_registered",
    severity: "info",
    message: `🆕 Team ${team.name} registered (${members.length} members).`,
  });

  const sb = createServerSupabase();
  await sb.auth.signInWithPassword({ email, password: body.password });

  return json({ ok: true, team: { name: team.name, team_uid: team.team_uid, join_code: team.join_code }, redirect: "/hunt" }, 201);
});
