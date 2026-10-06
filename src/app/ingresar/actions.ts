"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

function destination(value: FormDataEntryValue | null) {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : "/cuenta";
}

export async function signIn(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/ingresar?error=No%20se%20pudo%20iniciar%20sesion");
  redirect(destination(form.get("next")));
}

export async function signUp(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = destination(form.get("next"));
  if (password.length < 12) redirect("/ingresar?error=Usa%20una%20contrasena%20de%2012%20caracteres%20o%20mas");
  const supabase = await supabaseServer();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: site + "/auth/callback?next=" + encodeURIComponent(next) } });
  if (error) redirect("/ingresar?error=No%20se%20pudo%20crear%20la%20cuenta");
  redirect("/ingresar?message=Revisa%20tu%20correo%20para%20confirmar%20la%20cuenta");
}

export async function requestPasswordReset(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) redirect("/ingresar/recuperar?error=Escribe%20un%20correo%20valido");
  const supabase = await supabaseServer();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: site + "/auth/callback?next=" + encodeURIComponent("/ingresar/restablecer") });
  redirect("/ingresar/recuperar?message=Si%20la%20cuenta%20existe%2C%20recibiras%20un%20enlace%20para%20restablecer%20tu%20contrasena");
}

export async function updatePassword(form: FormData) {
  const password = String(form.get("password") ?? "");
  const confirmation = String(form.get("confirmation") ?? "");
  if (password.length < 12) redirect("/ingresar/restablecer?error=Usa%20al%20menos%2012%20caracteres");
  if (password !== confirmation) redirect("/ingresar/restablecer?error=Las%20contrasenas%20no%20coinciden");
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/ingresar?error=El%20enlace%20ha%20caducado");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/ingresar/restablecer?error=No%20se%20pudo%20guardar%20la%20contrasena");
  redirect("/cuenta");
}
