import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";

let adminClient: SupabaseClient | null = null;

/**
 * Service-role client. BYPASSES RLS — only use inside API routes / server
 * components AFTER the caller has been authenticated and authorised.
 * The key is never exposed to the browser (no NEXT_PUBLIC_ prefix).
 */
export function getAdminSupabase(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isSupabaseConfigured() || !key || key.startsWith("your-")) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }
  if (!adminClient) {
    adminClient = createClient(publicEnv.supabaseUrl, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

export function hasServiceRole(): boolean {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return isSupabaseConfigured() && Boolean(key) && !key!.startsWith("your-");
}
