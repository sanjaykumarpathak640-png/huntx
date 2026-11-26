import { z } from "zod";
import { HttpError, clientIp, json, parseBody, route } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { loadCurrentEvent } from "@/lib/server/auth";
import { eventPhase } from "@/lib/event-time";
import { availableUsername, randomPassword, slugUsername, teamEmail, uniqueTeamCodes } from "@/lib/server/codes";
import { notify } from "@/lib/server/notify";
import { signInAsEmail } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const schema = z.object({
  teamName: z.string().trim().min(2, "Team name is too short").max(48),
  leaderName: z.string().trim().min(2, "Leader name is too short").max(80),
  members: z.array(z.string().trim().max(80)).max(8).default([]),
  contactEmail: z.string().email().optional().or(z.literal("")),
  consent: z.literal(true, { errorMap: () => ({ message: "Please accept the notice" }) }),
});

/**
 * Simple registration: team name + names only. No username or password.
 * The team gets a 6-character code that every member uses to log in.
 */
export const POST = route(async (req) => {
  rateLimit(`register:${clientIp(req)}`, 5, 10 * 60_000);
  const body = await parseBody(req, schema);
  const db = getAdminSupabase();

  const current = await loadCurrentEvent(db);
  if (!current) throw new HttpError(400, "No event is configured yet.");
  const { event, settings } = current;
  if (!settings.registration_open) throw new HttpError(403, "Registration is closed. Ask the organisers for your team code.");
  if (eventPhase(event) === "ended") throw new HttpError(403, "This event has ended.");

  const { data: nameTaken } = await db
    .from("teams")
    .select("id")
    .eq("event_id", event.id)
    .ilike("name", body.teamName.replace(/[\\%_]/g, "\\$&"))
    .limit(1);
  if (nameTaken?.length) throw new HttpError(409, "That team name is already taken.");

  const username = await availableUsername(db, slugUsername(body.teamName));
  const email = teamEmail(username);
  // Random internal password — never shown; teams log in with their code.
  const { data: created, error: authErr } = await db.auth.admin.createUser({
    email,
    password: randomPassword() + randomPassword(),
    email_confirm: true,
    user_metadata: { team_name: body.teamName, kind: "team" },
  });
  if (authErr || !created.user) throw new HttpError(500, "Could not create team. Please retry.");

  const codes = await uniqueTeamCodes(db);
  const { data: team, error: teamErr } = await db
    .from("teams")
    .insert({
      event_id: event.id,
      auth_user_id: created.user.id,
      name: body.teamName,
      username,
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

  const others = (body.members ?? []).filter((m) => m && m !== body.leaderName);
  await db.from("team_members").insert([
    { team_id: team.id, name: body.leaderName, is_leader: true, email: body.contactEmail || null },
    ...others.map((name) => ({ team_id: team.id, name, is_leader: false })),
  ]);
  await db.from("profiles").upsert({ id: created.user.id, team_id: team.id, role: "participant" });
  await notify(db, {
    event_id: event.id,
    team,
    type: "team_registered",
    severity: "info",
    message: `🆕 Team ${team.name} registered (${others.length + 1} members).`,
  });

  await signInAsEmail(email);
  return json({ ok: true, team: { name: team.name, team_uid: team.team_uid, join_code: team.join_code }, redirect: "/hunt" }, 201);
});
