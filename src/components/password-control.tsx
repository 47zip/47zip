"use client";
import { useState } from "react";

export default function PasswordControl({ orderId }: { orderId: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function reveal() {
    setBusy(true); setError("");
    const response = await fetch("/api/clave/" + orderId, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) setError(result.error ?? "No se pudo mostrar la clave.");
    else setPassword(result.password);
    setBusy(false);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(password); }
    catch { setError("Selecciona y copia la clave manualmente."); }
  }
  return <div className="password-control">{password ? <><code>{password}</code><button onClick={copy}>Copiar</button></> : <button onClick={reveal} disabled={busy}>{busy ? "Cargando…" : "Ver contraseña"}</button>}{error && <small role="alert">{error}</small>}</div>;
}
