import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Completes email links (password recovery) and sets the session cookie. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = url.searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
  const sb = createServerSupabase();

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  let ok = false;
  if (code) ok = !(await sb.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await sb.auth.verifyOtp({ token_hash: tokenHash, type })).error;

  return NextResponse.redirect(new URL(ok ? safeNext : "/admin/login?reset=expired", url.origin));
}
