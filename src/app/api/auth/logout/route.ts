import { json, route } from "@/lib/server/http";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const POST = route(async () => {
  await createServerSupabase().auth.signOut();
  return json({ ok: true });
});
