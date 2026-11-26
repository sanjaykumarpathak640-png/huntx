import { z } from "zod";
import { clientIp, json, parseBody, route } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().trim().email().max(200) });

/**
 * Organiser password recovery. Sends Supabase's reset email ONLY if the
 * address belongs to an organiser, but always answers the same way so the
 * endpoint can't be used to discover admin emails.
 */
export const POST = route(async (req) => {
  rateLimit(`forgot:${clientIp(req)}`, 3, 15 * 60_000);
  const { email } = await parseBody(req, schema);
  const db = getAdminSupabase();
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = data?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (user) {
    const { data: admin } = await db.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (admin) {
      const origin = new URL(req.url).origin;
      const { error } = await createServerSupabase().auth.resetPasswordForEmail(user.email!, {
        redirectTo: `${origin}/auth/callback?next=/admin/reset`,
      });
      if (error) console.error("[forgot]", error.message);
    }
  }
  return json({ ok: true, message: "If this email belongs to an organiser, a reset link has been sent." });
});
