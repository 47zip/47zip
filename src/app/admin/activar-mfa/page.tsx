import { notFound, redirect } from "next/navigation";
import AdminMfa from "@/components/admin-mfa";
import { supabaseServer } from "@/lib/supabase/server";

export default async function AdminMfaPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/ingresar?next=/admin");
  const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
  if (role?.role !== "admin") notFound();
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.currentLevel === "aal2") redirect("/admin");
  return <main className="mfa-page"><a className="logo" href="/">✦ folio<span>.</span></a><AdminMfa /></main>;
}
