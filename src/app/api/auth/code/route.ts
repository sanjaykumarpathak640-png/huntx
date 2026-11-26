import { z } from "zod";
import { HttpError, clientIp, json, parseBody, route } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { teamEmail } from "@/lib/server/codes";
import { normaliseCode, signInAsEmail } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const schema = z.object({ code: z.string().trim().min(4).max(20) });

/**
 * One-step team login: just the 6-character team code.
 * 32^6 ≈ 1 billion possible codes + per-IP rate limiting makes guessing impractical.
 */
export const POST = route(async (req) => {
  const ip = clientIp(req);
  rateLimit(`code:${ip}`, 8, 60_000);
  rateLimit(`code-h:${ip}`, 40, 60 * 60_000);
  const { code: raw } = await parseBody(req, schema);
  const code = normaliseCode(raw);
  if (code.length !== 6) throw new HttpError(400, "Team code has 6 characters.");

  const db = getAdminSupabase();
  const { data: team } = await db.from("teams").select("id,username,status,name,auth_user_id").eq("join_code", code).maybeSingle();
  if (!team || !team.auth_user_id) throw new HttpError(404, "No team found with this code. Check the code and try again.");
  if (team.status === "disabled") throw new HttpError(403, "This team has been disabled by the organisers.");

  await signInAsEmail(teamEmail(team.username));
  return json({ ok: true, team: team.name, redirect: "/hunt" });
});
