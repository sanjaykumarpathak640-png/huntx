// Public env values (inlined at build time by Next.js — must be referenced literally).
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
};

export function isSupabaseConfigured(): boolean {
  const { supabaseUrl, supabaseAnonKey } = publicEnv;
  return Boolean(
    supabaseUrl &&
      supabaseAnonKey &&
      !supabaseUrl.includes("YOUR-PROJECT-REF") &&
      !supabaseAnonKey.startsWith("your-"),
  );
}

// Placeholders let the app build & render a "setup required" state without credentials.
export const PLACEHOLDER_URL = "https://placeholder.supabase.co";
export const PLACEHOLDER_KEY = "placeholder-anon-key";
