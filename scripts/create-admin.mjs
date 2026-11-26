#!/usr/bin/env node
/**
 * Bootstrap the first organiser account.
 *   npm run create-admin -- admin@iitp.ac.in 'StrongPassword!23' super_admin
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local / .env.
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
}

const [email, password, role = "super_admin"] = process.argv.slice(2);
if (!email || !password) {
  console.error("Usage: npm run create-admin -- <email> <password> [super_admin|organiser|reviewer]");
  process.exit(1);
}
if (password.length < 10) {
  console.error("Use a password of at least 10 characters.");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

let userId;
const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
if (error) {
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!existing) {
    console.error("Could not create user:", error.message);
    process.exit(1);
  }
  userId = existing.id;
  await db.auth.admin.updateUserById(userId, { password });
  console.log("User existed — password updated.");
} else {
  userId = created.user.id;
}
const { error: aErr } = await db.from("admins").upsert({ user_id: userId, role });
if (aErr) {
  console.error("Could not insert admin row (did you run the migration?):", aErr.message);
  process.exit(1);
}
await db.from("profiles").upsert({ id: userId, role: "admin" });
console.log(`✅ ${email} is now a HuntX ${role}. Sign in at /admin/login`);
