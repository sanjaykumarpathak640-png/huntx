import { json } from "@/lib/server/http";
import { getPublicEvent } from "@/lib/server/public-event";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(await getPublicEvent());
}
