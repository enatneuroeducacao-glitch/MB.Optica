"use client";
import Link from "next/link";
import {usePathname,useRouter} from "next/navigation";
import {ReactNode,useState} from "react";

const groups=[{label:"Visão geral",items:[["Dashboard","/"],["Agenda","/agenda"]]},{label:"Óptica",items:[["Clientes","/clientes"],["Receitas","/receitas"],["Orçamentos","/orcamentos"],["Pedidos","/pedidos"],["Laboratório","/laboratorio"]]},{label:"Operação",items:[["Produtos","/produtos"],["Estoque","/estoque"],["Fornecedores","/fornecedores"],["Vendas","/vendas"]]},{label:"Gestão",items:[["Financeiro","/financeiro"],["Relatórios","/relatorios"],["Configurações","/configuracoes"],["Migração","/migracao"]]}] as const;

type User={name:string;email:string;role:string}|null;
const roleLabel:Record<string,string>={ADMIN:"Administrador",GERENTE:"Gerente",VENDEDOR:"Vendedor",FINANCEIRO:"Financeiro",LABORATORIO:"Laboratório"};

export function AppShell({children,user}:{children:ReactNode;user:User}){
  const path=usePathname(); const router=useRouter(); const [busy,setBusy]=useState(false); const [menuOpen,setMenuOpen]=useState(false);
  if(path==="/login"||path==="/setup") return <>{children}</>;
  async function logout(){setBusy(true);try{await fetch("/api/auth/logout",{method:"POST"});router.replace("/login");router.refresh();}finally{setBusy(false);}}
  return <div className="shell">
    {menuOpen&&<button className="mobile-menu-overlay" aria-label="Fechar menu" onClick={()=>setMenuOpen(false)}/>}
    <aside className={"sidebar"+(menuOpen?" mobile-open":"")}>
      <div className="brand"><div className="brand-mark">MB</div><div><strong>MB Óptica</strong><small>Gestão inteligente</small></div><button className="mobile-close" aria-label="Fechar menu" onClick={()=>setMenuOpen(false)}>×</button></div>
      <nav>{groups.map(g=><div className="nav-group" key={g.label}><span>{g.label}</span>{g.items.map(([label,href])=><Link className={path===href?"active":""} href={href} key={href} onClick={()=>setMenuOpen(false)}>{label}</Link>)}</div>)}</nav>
      <div className="sidebar-footer">Sistema v0.2 • ambiente seguro</div>
    </aside>
    <main className="main">
      <header className="topbar">
        <div className="topbar-left"><button className="mobile-menu-button" aria-label="Abrir menu" aria-expanded={menuOpen} onClick={()=>setMenuOpen(true)}>☰</button><div><span className="eyebrow">OPERAÇÃO</span><strong>Centro de controle</strong></div></div>
        <div className="top-actions"><button className="icon-button">⌕</button><button className="user-chip" onClick={logout} disabled={busy}>{user?.name ?? "Usuário"} <span>{roleLabel[user?.role ?? ""] ?? user?.role ?? ""} · {busy?"Saindo...":"Sair"}</span></button></div>
      </header>
      {children}
    </main>
  </div>
}