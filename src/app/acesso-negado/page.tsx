"use client";

import { useEffect, useState } from "react";

export default function AccessDeniedPage() {
  const [logo, setLogo] = useState<string | null>(null);
  const [tradeName, setTradeName] = useState("MB Óptica");

  useEffect(() => {
    fetch("/api/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.branding) {
          setLogo(d.branding.logoData || null);
          setTradeName(d.branding.tradeName || "MB Óptica");
        }
      })
      .catch(() => {});
  }, []);

  return <main className="auth-page"><div className="auth-card"><div className="brand"><div className="brand-mark">{logo?<img src={logo} alt={`Logo ${tradeName}`}/>: "MB"}</div><div><strong>{tradeName}</strong><small>Controle de acesso</small></div></div><h1>Acesso não autorizado</h1><p>Seu perfil não possui permissão para acessar este módulo.</p><a className="setup-link" href="/">Voltar ao início</a></div></main>;
}
