import { json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Authoritative server clock for countdown synchronisation. */
export async function GET() {
  return json({ now: Date.now() });
}
