import { z } from "zod";
import { HttpError, json, parseBody, route } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const { db } = await requireAdmin("super_admin");
  const { data } = await db.from("admins").select("*").order("created_at");
  const withEmail = await Promise.all(
    (data ?? []).map(async (a) => {
      const { data: u } = await db.auth.admin.getUserById(a.user_id);
      return { ...a, email: u.user?.email ?? null };
    }),
  );
  return json({ admins: withEmail });
});

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(128).optional(),
  role: z.enum(["super_admin", "organiser", "reviewer"]),
  display_name: z.string().max(80).optional(),
});

/** Add an organiser. Creates the auth user if a password is supplied. */
export const POST = route(async (req) => {
  const { db } = await requireAdmin("super_admin");
  const body = await parseBody(req, schema);
  let userId: string | null = null;
  if (body.password) {
    const { data, error } = await db.auth.admin.createUser({ email: body.email, password: body.password, email_confirm: true });
    if (error || !data.user) throw new HttpError(409, error?.message ?? "Could not create user.");
    userId = data.user.id;
  } else {
    // find existing user by email (paginate first 1000)
    const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = data.users.find((u) => u.email?.toLowerCase() === body.email.toLowerCase())?.id ?? null;
    if (!userId) throw new HttpError(404, "No user with that email. Provide a password to create one.");
  }
  await db.from("admins").upsert({ user_id: userId, role: body.role, display_name: body.display_name ?? null });
  await db.from("profiles").upsert({ id: userId, role: "admin" });
  return json({ ok: true }, 201);
});

const delSchema = z.object({ user_id: z.string().uuid() });

export const DELETE = route(async (req) => {
  const { db, user } = await requireAdmin("super_admin");
  const { user_id } = await parseBody(req, delSchema);
  if (user_id === user.id) throw new HttpError(400, "You cannot remove yourself.");
  await db.from("admins").delete().eq("user_id", user_id);
  return json({ ok: true });
});
