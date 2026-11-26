import { json, route } from "@/lib/server/http";
import { requireAdminEvent } from "@/lib/server/admin-helpers";
import { computeLeaderboard } from "@/lib/server/leaderboard";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const { db, event, settings } = await requireAdminEvent();
  return json({ rows: await computeLeaderboard(db, event, settings), ranking: settings.ranking });
});
