import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/auth";
import { getAdminSupabase, hasServiceRole } from "@/lib/supabase/admin";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

/** Server-side gate: only users present in `admins` can render any admin page. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!hasServiceRole()) redirect("/admin/login");
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  const { data: admin } = await getAdminSupabase().from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!admin) redirect("/admin/login");
  return (
    <AdminShell email={user.email ?? ""} role={admin.role}>
      {children}
    </AdminShell>
  );
}
