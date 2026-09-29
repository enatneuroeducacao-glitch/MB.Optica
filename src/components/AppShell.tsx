"use client";
import Link from "next/link";
import {usePathname,useRouter} from "next/navigation";
import {ReactNode,useEffect,useState} from "react";

const groups=[{label:"Visão geral",items:[["Dashboard","/"],["Agenda","/agenda"]]},{label:"Óptica",items:[["Clientes","/clientes"],["Receitas","/receitas"],["Orçamentos","/orcamentos"],["Pedidos","/pedidos"],["Laboratório","/laboratorio"]]},{label:"Operação",items:[["Produtos","/produtos"],["Estoque","/estoque"],["Fornecedores","/fornecedores"],["Vendas","/vendas"]]},{label:"Gestão",items:[["Financeiro","/financeiro"],["Relatórios","/relatorios"],["Configurações","/configuracoes"],["Migração","/migracao"]]}] as const;

type User={name:string;email:string;role:string;mustChangePassword?:boolean}|null;
const roleLabel:Record<string,string>={ADMIN:"Administrador",GERENTE:"Gerente",VENDEDOR:"Vendedor",FINANCEIRO:"Financeiro",LABORATORIO:"Laboratório"};

export function AppShell({children,user}:{children:ReactNode;user:User}){
  const path=usePathname(); const router=useRouter(); const [busy,setBusy]=useState(false); const [menuOpen,setMenuOpen]=useState(false); const [logo,setLogo]=useState<string|null>(null);
  useEffect(()=>{fetch("/api/branding").then(r=>r.ok?r.json():null).then(d=>setLogo(d?.branding?.logoData||null)).catch(()=>{})},[]);

  useEffect(()=>{
    if(path==="/login"||path==="/setup"||path==="/primeiro-acesso") return;
    const key="mb-optica-version";
    let mounted=true;
    const check=async()=>{
      try{
        const res=await fetch("/api/version",{cache:"no-store"});
        if(!res.ok) return;
        const data=await res.json();
        const current=typeof window!=="undefined" ? sessionStorage.getItem(key) : null;
        if(!current){sessionStorage.setItem(key,data.version);return;}
        if(mounted && data.version && data.version!==current){
          const active=document.activeElement;
          const tag=active?.tagName;
          const editing=tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT"||!!document.querySelector('[contenteditable="true"]');
          if(!editing){
            sessionStorage.setItem(key,data.version);
            window.location.reload();
          }
        }
      }catch{}
    };
    const timer=window.setInterval(check,60000);
    const onFocus=()=>check();
    window.addEventListener("focus",onFocus);
    check();
    return()=>{mounted=false;window.clearInterval(timer);window.removeEventListener("focus",onFocus)};
  },[path]);
  if(path==="/login"||path==="/setup"||path==="/primeiro-acesso") return <>{children}</>;
  if(user?.mustChangePassword){ router.replace("/primeiro-acesso"); return null; }
  async function logout(){setBusy(true);try{await fetch("/api/auth/logout",{method:"POST"});router.replace("/login");router.refresh();}finally{setBusy(false);}}
  return <div className="shell">
    {menuOpen&&<button className="mobile-menu-overlay" aria-label="Fechar menu" onClick={()=>setMenuOpen(false)}/>}
    <aside className={"sidebar"+(menuOpen?" mobile-open":"")}>
      <div className="brand"><div className="brand-mark">{logo?<img src={logo} alt="Logo da óptica"/>:"MB"}</div><div><strong>MB Óptica</strong><small>Gestão inteligente</small></div><button className="mobile-close" aria-label="Fechar menu" onClick={()=>setMenuOpen(false)}>×</button></div>
      <nav>{groups.map(g=><div className="nav-group" key={g.label}><span>{g.label}</span>{g.items.map(([label,href])=><Link className={path===href?"active":""} href={href} key={href} onClick={()=>setMenuOpen(false)}>{label}</Link>)}</div>)}</nav>
      <div className="sidebar-footer">Sistema atualizado automaticamente • ambiente seguro</div>
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