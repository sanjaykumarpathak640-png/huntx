import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { PLACEHOLDER_KEY, PLACEHOLDER_URL, isSupabaseConfigured, publicEnv } from "@/lib/env";

/** Cookie-bound server client (acts as the signed-in user, RLS applies). */
export function createServerSupabase() {
  const cookieStore = cookies();
  const ok = isSupabaseConfigured();
  return createServerClient(
    ok ? publicEnv.supabaseUrl : PLACEHOLDER_URL,
    ok ? publicEnv.supabaseAnonKey : PLACEHOLDER_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(list) {
          try {
            list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component — middleware refreshes the session instead.
          }
        },
      },
    },
  );
}
