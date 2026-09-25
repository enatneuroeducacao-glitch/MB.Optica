"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ token:"", name:"", email:"", password:"", confirm:"" });
  const [error, setError] = useState(""); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (form.password !== form.confirm) { setError("As senhas não coincidem."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/bootstrap", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ token:form.token,name:form.name,email:form.email,password:form.password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível inicializar.");
      setDone(true); setTimeout(()=>router.replace("/login"), 900);
    } catch(error) { setError(error instanceof Error ? error.message : "Não foi possível inicializar."); }
    finally { setBusy(false); }
  }

  if (done) return <main className="auth-page"><div className="auth-card"><h1>Sistema inicializado</h1><p>Administrador criado com segurança. Redirecionando para o login.</p></div></main>;

  return <main className="auth-page"><div className="auth-card"><div className="brand"><div className="brand-mark">MB</div><div><strong>MB Óptica</strong><small>Configuração inicial</small></div></div><h1>Criar administrador</h1><p>Esta etapa só pode ser concluída uma vez e exige o token configurado no ambiente.</p><form onSubmit={submit}><label>Token de inicialização<input type="password" value={form.token} onChange={e=>setForm({...form,token:e.target.value})} required autoComplete="off"/></label><label>Nome<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/></label><label>E-mail<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required autoComplete="username"/></label><label>Senha<input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required minLength={10} autoComplete="new-password"/></label><label>Confirmar senha<input type="password" value={form.confirm} onChange={e=>setForm({...form,confirm:e.target.value})} required minLength={10} autoComplete="new-password"/></label>{error&&<div className="form-error">{error}</div>}<button className="primary" disabled={busy}>{busy?"Criando...":"Criar administrador"}</button></form><a className="setup-link" href="/login">Voltar ao login</a></div></main>;
}
