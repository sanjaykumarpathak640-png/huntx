import "server-only";
import { randomInt } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function randomCode(len = 6): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export function randomPassword(): string {
  return `${randomCode(4)}-${randomCode(4)}-${randomCode(4)}`.toLowerCase();
}

export function teamEmail(username: string): string {
  const domain = process.env.TEAM_EMAIL_DOMAIN || "teams.huntx.app";
  return `${username.toLowerCase()}@${domain}`;
}

export function slugUsername(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 16);
  return (base.length >= 3 ? base : `team_${base}`).slice(0, 18);
}

/** Generates team_uid / join_code values that are not already taken. */
export async function uniqueTeamCodes(db: SupabaseClient) {
  for (let i = 0; i < 10; i++) {
    const team_uid = `HX-${randomInt(1000, 9999)}`;
    const join_code = randomCode(6);
    const { data } = await db
      .from("teams")
      .select("id")
      .or(`team_uid.eq.${team_uid},join_code.eq.${join_code}`)
      .limit(1);
    if (!data?.length) return { team_uid, join_code };
  }
  throw new Error("Could not generate unique team codes");
}

export async function availableUsername(db: SupabaseClient, wanted: string) {
  let candidate = wanted;
  for (let i = 0; i < 20; i++) {
    const { data } = await db.from("teams").select("id").eq("username", candidate).limit(1);
    if (!data?.length) return candidate;
    candidate = `${wanted.slice(0, 19)}_${randomInt(10, 9999)}`;
  }
  throw new Error("Could not find a free username");
}
