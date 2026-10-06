import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export async function requireAdmin() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/ingresar?next=/admin");
  const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
  if (role?.role !== "admin") notFound();
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.currentLevel !== "aal2") redirect("/admin/activar-mfa");
  return { supabase, user };
}

export async function requireCustomer() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/ingresar?next=/cuenta");
  return { supabase, user };
}

export async function authorizeAdminApi() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { allowed: false as const, reason: "auth" as const };
  const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
  if (role?.role !== "admin") return { allowed: false as const, reason: "role" as const };
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.currentLevel !== "aal2") return { allowed: false as const, reason: "mfa" as const };
  return { allowed: true as const, user, supabase };
}
