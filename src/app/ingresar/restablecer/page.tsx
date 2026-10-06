import { redirect } from "next/navigation";
import { updatePassword } from "../actions";
import { supabaseServer } from "@/lib/supabase/server";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/ingresar?error=Abre%20el%20enlace%20vigente%20de%20tu%20correo");
  const params = await searchParams;
  return <main className="auth-page"><a className="logo" href="/">✦ folio<span>.</span></a><section className="auth-card"><small className="label">SEGURIDAD DE LA CUENTA</small><h1>Elige una contraseña nueva.</h1><p>Usa al menos 12 caracteres para proteger tu biblioteca.</p>{params.error && <div className="auth-message error" role="alert">{params.error}</div>}<form action={updatePassword}><label>Nueva contraseña<input name="password" type="password" autoComplete="new-password" minLength={12} required /></label><label>Confirma la contraseña<input name="confirmation" type="password" autoComplete="new-password" minLength={12} required /></label><button className="btn dark" type="submit">Guardar contraseña →</button></form><a className="back-home" href="/cuenta">← Volver a mi biblioteca</a></section></main>;
}
