import { signIn, signUp } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; message?: string }> }) {
  const params = await searchParams;
  return <main className="auth-page">
    <a className="logo" href="/">✦ folio<span>.</span></a>
    <section className="auth-card">
      <small className="label">TU ESPACIO PERSONAL</small>
      <h1>Entra a tu biblioteca.</h1>
      <p>Usa tu cuenta para ver tus compras y descargas.</p>
      {params.error && <div className="auth-message error" role="alert">{params.error}</div>}
      {params.message && <div className="auth-message" role="status">{params.message}</div>}
      <form action={signIn}>
        <input type="hidden" name="next" value={params.next ?? "/cuenta"} />
        <label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label>
        <label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="btn dark" type="submit">Iniciar sesión →</button>
      </form>
      <a className="back-home" href="/ingresar/recuperar">¿Olvidaste tu contraseña?</a>
      <div className="auth-divider"><span>¿Primera vez aquí?</span></div>
      <form action={signUp}>
        <input type="hidden" name="next" value={params.next ?? "/cuenta"} />
        <label>Correo electrónico<input name="email" type="email" autoComplete="email" required /></label>
        <label>Crea una contraseña<input name="password" type="password" autoComplete="new-password" minLength={12} required /><small>12 caracteres como mínimo</small></label>
        <button className="btn outline" type="submit">Crear cuenta</button>
      </form>
      <a className="back-home" href="/">← Volver a la tienda</a>
    </section>
  </main>;
}
