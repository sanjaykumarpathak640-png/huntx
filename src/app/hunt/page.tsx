import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/auth";
import { getAdminSupabase, hasServiceRole } from "@/lib/supabase/admin";
import { HuntApp } from "./hunt-app";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hunt" };

export default async function HuntPage() {
  if (!hasServiceRole()) redirect("/join");
  const user = await getSessionUser();
  if (!user) redirect("/join");
  const db = getAdminSupabase();
  const { data: team } = await db.from("teams").select("id").eq("auth_user_id", user.id).maybeSingle();
  if (!team) {
    const { data: admin } = await db.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
    redirect(admin ? "/admin" : "/join");
  }
  return <HuntApp />;
}
