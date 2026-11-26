import { z } from "zod";
import { HttpError, clientIp, json, parseBody, route } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { teamEmail } from "@/lib/server/codes";

export const dynamic = "force-dynamic";

const schema = z.object({
  identifier: z.string().trim().min(3).max(120),
  password: z.string().min(6).max(128),
  mode: z.enum(["team", "admin"]).default("team"),
});

/**
 * Accepts: email, team username, or 6-char team join code.
 * Sign-in happens server-side so the session cookie is set by @supabase/ssr.
 */
export const POST = route(async (req) => {
  rateLimit(`login:${clientIp(req)}`, 10, 60_000);
  const { identifier, password, mode } = await parseBody(req, schema);
  const db = getAdminSupabase();

  let email = identifier.toLowerCase();
  if (!identifier.includes("@")) {
    const upper = identifier.toUpperCase();
    if (/^[A-Z0-9]{6}$/.test(upper)) {
      const { data: byCode } = await db.from("teams").select("username").eq("join_code", upper).maybeSingle();
      if (byCode) email = teamEmail(byCode.username);
      else email = teamEmail(identifier.toLowerCase());
    } else {
      email = teamEmail(identifier.toLowerCase());
    }
  } else if (mode === "team") {
    // Allow login with the team's contact email too.
    const { data: byContact } = await db
      .from("teams")
      .select("username")
      .ilike("contact_email", identifier.replace(/[\\%_]/g, "\\$&"))
      .maybeSingle();
    if (byContact) email = teamEmail(byContact.username);
  }

  const sb = createServerSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new HttpError(401, "Invalid credentials.");

  const [{ data: admin }, { data: team }] = await Promise.all([
    db.from("admins").select("role").eq("user_id", data.user.id).maybeSingle(),
    db.from("teams").select("id,status").eq("auth_user_id", data.user.id).maybeSingle(),
  ]);

  if (mode === "admin" && !admin) {
    await sb.auth.signOut();
    throw new HttpError(403, "This account does not have organiser access.");
  }
  if (mode === "team" && !team) {
    if (admin) return json({ role: "admin", redirect: "/admin" });
    await sb.auth.signOut();
    throw new HttpError(403, "No team is linked to this account.");
  }
  if (mode === "team" && team?.status === "disabled") {
    await sb.auth.signOut();
    throw new HttpError(403, "Your team has been disabled by the organisers.");
  }
  return json({ role: admin && mode === "admin" ? "admin" : "team", redirect: mode === "admin" ? "/admin" : "/hunt" });
});
