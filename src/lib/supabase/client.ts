"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLACEHOLDER_KEY, PLACEHOLDER_URL, isSupabaseConfigured, publicEnv } from "@/lib/env";

let client: SupabaseClient | null = null;

/** Browser client: anon key + user session cookie. Reads are governed by RLS. */
export function getBrowserSupabase(): SupabaseClient {
  if (client) return client;
  const ok = isSupabaseConfigured();
  client = createBrowserClient(
    ok ? publicEnv.supabaseUrl : PLACEHOLDER_URL,
    ok ? publicEnv.supabaseAnonKey : PLACEHOLDER_KEY,
  );
  return client;
}
