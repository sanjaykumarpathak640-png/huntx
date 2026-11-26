import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import { HttpError } from "./http";

/**
 * Starts a session for a team account WITHOUT a password.
 * The server mints a one-time magic-link token (never emailed, never sent
 * to the browser) and immediately redeems it on the cookie-bound client.
 */
export async function signInAsEmail(email: string) {
  const db = getAdminSupabase();
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    console.error("[session] generateLink", error);
    throw new HttpError(500, "Could not start your session. Please retry.");
  }
  const sb = createServerSupabase();
  const { error: vErr } = await sb.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (vErr) {
    console.error("[session] verifyOtp", vErr);
    throw new HttpError(500, "Could not start your session. Please retry.");
  }
}

/** Normalises user-typed codes: "k7p-q2m " -> "K7PQ2M". */
export function normaliseCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
