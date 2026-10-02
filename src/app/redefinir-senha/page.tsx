"use client";

import { FormEvent, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!token) {
      setError("O link de recuperação é inválido ou está incompleto.");
      return;
    }
    if (password.length < 8) {
      setError("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("As senhas não conferem.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível redefinir a senha.");
      setMessage(data.message || "Senha redefinida com sucesso.");
      setPassword("");
      setConfirmation("");
      setTimeout(() => router.replace("/login"), 1600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível redefinir a senha.");
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
        <h1>Redefinir senha</h1>
        <p>Crie uma nova senha para acessar a gestão.</p>
        <form onSubmit={submit}>
          <label>Nova senha
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} autoComplete="new-password" required />
          </label>
          <label>Confirmar nova senha
            <input type="password" value={confirmation} onChange={e => setConfirmation(e.target.value)} minLength={8} autoComplete="new-password" required />
          </label>
          {error && <div className="form-error">{error}</div>}
          {message && <div className="notice">{message}</div>}
          <button className="primary" disabled={busy}>{busy ? "Salvando..." : "Redefinir senha"}</button>
        </form>
        <a className="setup-link" href="/login">Voltar para o login</a>
      </div>
    </main>
  );
}
