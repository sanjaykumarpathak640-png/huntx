import { z } from "zod";
import { HttpError, json, parseBody, route } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128)
    .regex(/[A-Za-z]/, "Include at least one letter")
    .regex(/[0-9]/, "Include at least one number"),
});

/** Sets a new password right after opening a recovery email link (valid for 1 hour). */
export const POST = route(async (req) => {
  const { user, db } = await requireAdmin();
  const sentAt = user.recovery_sent_at ? Date.parse(user.recovery_sent_at) : 0;
  if (!sentAt || Date.now() - sentAt > 60 * 60_000) {
    throw new HttpError(403, "Reset link expired. Request a new one from the login page.");
  }
  const { password } = await parseBody(req, schema);
  const { error } = await db.auth.admin.updateUserById(user.id, { password });
  if (error) throw new HttpError(500, "Could not update password.");
  return json({ ok: true });
});
