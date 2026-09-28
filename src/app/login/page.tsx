"use client";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);\n  const [logo, setLogo] = useState<string | null>(null);\n  const [tradeName, setTradeName] = useState("MB Óptica");\n\n  useEffect(() => {\n    fetch("/api/branding")\n      .then((r) => (r.ok ? r.json() : null))\n      .then((d) => {\n        if (d?.branding) {\n          setLogo(d.branding.logoData || null);\n          setTradeName(d.branding.tradeName || "MB Óptica");\n        }\n      })\n      .catch(() => {});\n  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível entrar.");
      router.replace("/");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível entrar.");
    } finally { setBusy(false); }
  }

  return <main className="auth-page"><div className="auth-card"><div className="brand"><div className="brand-mark">{logo?<img src={logo} alt={`Logo ${tradeName}`}/>: "MB"}</div><div><strong>{tradeName}</strong><small>Gestão inteligente</small></div></div><h1>Acessar sistema</h1><p>Entre com seu usuário e senha.</p><form onSubmit={submit}><label>Usuário ou e-mail<input type="text" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username"/></label><label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/></label>{error&&<div className="form-error">{error}</div>}<button className="primary" disabled={busy}>{busy?"Entrando...":"Entrar"}</button></form><a className="setup-link" href="/setup">Inicialização administrativa</a></div></main>;
}