"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function FirstAccessPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível alterar a senha.");
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível alterar a senha.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page"><div className="auth-card">
    <div className="brand"><div className="brand-mark">MB</div><div><strong>MB Óptica</strong><small>Gestão inteligente</small></div></div>
    <h1>Primeiro acesso</h1>
    <p>Por segurança, defina uma senha pessoal antes de acessar o sistema.</p>
    <form onSubmit={submit}>
      <label>Nova senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="Mínimo de 8 caracteres"/></label>
      <label>Confirmar nova senha<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} required minLength={8} autoComplete="new-password"/></label>
      {error&&<div className="form-error">{error}</div>}
      <button className="primary" disabled={busy}>{busy?"Salvando...":"Definir senha e entrar"}</button>
    </form>
  </div></main>;
}
