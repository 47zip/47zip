import { requestPasswordReset } from "../actions";

export default async function RecoverAccountPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams;
  return <main className="auth-page"><a className="logo" href="/">✦ folio<span>.</span></a><section className="auth-card"><small className="label">RECUPERAR ACCESO</small><h1>Revisa tu correo.</h1><p>Te enviaremos un enlace si existe una cuenta con esa dirección.</p>{params.error && <div className="auth-message error" role="alert">{params.error}</div>}{params.message && <div className="auth-message" role="status">{params.message}</div>}<form action={requestPasswordReset}><label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label><button className="btn dark" type="submit">Enviar enlace →</button></form><a className="back-home" href="/ingresar">← Volver a iniciar sesión</a></section></main>;
}
