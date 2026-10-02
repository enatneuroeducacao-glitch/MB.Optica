"use client";

import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível iniciar a recuperação.");
      setMessage(data.message || "Se o e-mail estiver cadastrado, você receberá as instruções.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível iniciar a recuperação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="brand">
          <div className="brand-mark">MB</div>
          <div><strong>MB Óptica</strong><small>Gestão inteligente</small></div>
        </div>
        <h1>Esqueci minha senha</h1>
        <p>Informe seu e-mail de acesso. Enviaremos um link seguro para criar uma nova senha.</p>
        <form onSubmit={submit}>
          <label>E-mail
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          {error && <div className="form-error">{error}</div>}
          {message && <div className="notice">{message}</div>}
          <button className="primary" disabled={busy}>{busy ? "Enviando..." : "Enviar link de recuperação"}</button>
        </form>
        <a className="setup-link" href="/login">Voltar para o login</a>
      </div>
    </main>
  );
}
