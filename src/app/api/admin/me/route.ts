import { json, route } from "@/lib/server/http";
import { requireAdmin, loadCurrentEvent } from "@/lib/server/auth";
import { eventPhase } from "@/lib/event-time";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const { user, role, db } = await requireAdmin();
  const current = await loadCurrentEvent(db);
  return json({
    user: { id: user.id, email: user.email },
    role,
    event: current ? { id: current.event.id, name: current.event.name, phase: eventPhase(current.event) } : null,
    settings: current?.settings ?? null,
  });
});
