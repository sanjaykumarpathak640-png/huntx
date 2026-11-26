import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { HttpError, clientIp, json, parseBody, route } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/rate-limit";
import { publicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

const schema = z.object({
  current: z.string().min(1).max(128),
  next: z
    .string()
    .min(10, "New password must be at least 10 characters")
    .max(128)
    .regex(/[A-Za-z]/, "Include at least one letter")
    .regex(/[0-9]/, "Include at least one number"),
});

/** Lets a signed-in organiser change their own password (current password required). */
export const POST = route(async (req) => {
  const { user, db } = await requireAdmin();
  rateLimit(`pw:${user.id}:${clientIp(req)}`, 5, 15 * 60_000);
  const { current, next } = await parseBody(req, schema);
  if (current === next) throw new HttpError(400, "New password must be different.");
  if (!user.email) throw new HttpError(400, "Account has no email.");

  // Verify the current password on a throwaway client (does not touch the session cookie).
  const check = createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: wrong } = await check.auth.signInWithPassword({ email: user.email, password: current });
  if (wrong) throw new HttpError(401, "Current password is incorrect.");
  await check.auth.signOut().catch(() => {});

  const { error } = await db.auth.admin.updateUserById(user.id, { password: next });
  if (error) throw new HttpError(500, "Could not update password.");
  return json({ ok: true });
});
