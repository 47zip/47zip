"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function AdminMfa() {
  const [client] = useState(() => supabaseBrowser());
  const [factorId, setFactorId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true); setMessage("");
    const { data: factors, error: listError } = await client.auth.mfa.listFactors();
    if (listError) { setMessage("No se pudo revisar la configuración MFA."); setBusy(false); return; }
    const existing = factors.totp.find((item: { id: string; status: string }) => item.status === "verified");
    let id = existing?.id ?? "";
    if (!id) {
      const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Folio admin" });
      if (error || !data) { setMessage("No se pudo activar MFA. Vuelve a iniciar sesión e intenta de nuevo."); setBusy(false); return; }
      id = data.id;
      setQr(data.totp.qr_code);
    }
    const { data: challenge, error } = await client.auth.mfa.challenge({ factorId: id });
    if (error || !challenge) { setMessage("No se pudo iniciar la verificación MFA."); setBusy(false); return; }
    setFactorId(id); setChallengeId(challenge.id); setBusy(false);
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const { error } = await client.auth.mfa.verify({ factorId, challengeId, code: code.replace(/\s/g, "") });
    if (error) { setMessage("El código no se pudo verificar. Revisa tu app y vuelve a intentar."); setBusy(false); return; }
    window.location.assign("/admin");
  }

  return <section className="mfa-card">
    <span className="mfa-mark">♙</span><small className="label">PROTECCIÓN ADMIN</small><h1>Verifica tu acceso.</h1>
    {!factorId ? <><p>El panel de administración requiere autenticación multifactor con una app de códigos.</p><button className="btn dark" onClick={start} disabled={busy}>{busy ? "Preparando…" : "Configurar o verificar MFA →"}</button></> :
      <form onSubmit={verify}>{qr && <><p>Escanea el código con una app autenticadora y escribe el código de seis dígitos.</p><img className="mfa-qr" src={qr} alt="Código QR de configuración TOTP" /><p className="mfa-small">Si no puedes escanearlo, agrega el factor manualmente desde la configuración de tu cuenta.</p></>}<label>Código de autenticación<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9 ]{6,8}" value={code} onChange={(e)=>setCode(e.target.value)} required /></label><button className="btn dark" disabled={busy}>{busy ? "Verificando…" : "Verificar y abrir admin →"}</button></form>}
    {message && <p className="auth-message error" role="alert">{message}</p>}
    <a className="back-home" href="/cuenta">Volver a mi biblioteca</a>
  </section>;
}
