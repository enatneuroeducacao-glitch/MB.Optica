"use client";
import Link from "next/link";
import {usePathname,useRouter} from "next/navigation";
import {ReactNode,useEffect,useState} from "react";

const groups=[{label:"Visão geral",items:[["Dashboard","/"],["Agenda","/agenda"]]},{label:"Óptica",items:[["Clientes","/clientes"],["Atendimento","/atendimento"],["Armações de terceiros","/armacoes-terceiros"]]},{label:"Comunicação",items:[["Mensagens","/mensagens"]]},{label:"Capacitação",items:[["Universidade MB","/universidade-mb"]]},{label:"Operação",items:[["Produtos e estoque","/produtos"],["Fornecedores","/fornecedores"],["Vendas","/vendas"]]},{label:"Gestão",items:[["Financeiro","/financeiro"],["Contabilidade","/contabilidade"],["Relatórios","/relatorios"],["Assinatura do sistema","/assinatura"],["Configurações","/configuracoes"],["Migração","/migracao"]]}] as const;

type User={name:string;email:string;role:string;mustChangePassword?:boolean}|null;
type Entitlement={owner:boolean;plan:string;status:string;trial:boolean;modules:string[];maxUsers:number|null;activeUsers:number|null};
const roleLabel:Record<string,string>={ADMIN:"Administrador",GERENTE:"Gerente",VENDEDOR:"Vendedor",FINANCEIRO:"Financeiro",LABORATORIO:"Laboratório"};

export function AppShell({children,user}:{children:ReactNode;user:User}){
  const path=usePathname(); const router=useRouter(); const [busy,setBusy]=useState(false); const [notice,setNotice]=useState<{title:string;detail:string;kind:"error"|"success"}|null>(null); const [entitlement,setEntitlement]=useState<Entitlement|null>(null); const [menuOpen,setMenuOpen]=useState(false); const [logo,setLogo]=useState<string|null>(null); const [version,setVersion]=useState<string>(""); const [updateAvailable,setUpdateAvailable]=useState(false); const [cashSession,setCashSession]=useState<any>(undefined); const [unreadMessages,setUnreadMessages]=useState(0); const [agendaPending,setAgendaPending]=useState(0);

  useEffect(()=>{
    const showNotice=(event:Event)=>{
      const detail=(event as CustomEvent<{title?:string;detail?:string;kind?:"error"|"success"}>).detail;
      if(!detail)return;
      setNotice({title:detail.title||"Não foi possível concluir a operação",detail:detail.detail||"Revise os dados e tente novamente.",kind:detail.kind||"error"});
    };
    window.addEventListener("mb:notice",showNotice);
    return()=>window.removeEventListener("mb:notice",showNotice);
  },[]);
  useEffect(()=>{
    const originalFetch=window.fetch.bind(window);
    window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
      const response=await originalFetch(input,init);
      const method=(init?.method||(input instanceof Request?input.method:"GET")).toUpperCase();
      const url=typeof input==="string"?input:input instanceof URL?input.toString():input.url;
      if(method!=="GET" && url.startsWith("/api/") && !response.ok){
        try{
          const payload=await response.clone().json();
          const details=Array.isArray(payload?.details)?payload.details.map((item:{field?:string;message?:string})=>`${item.field||"Campo"}: ${item.message||"preenchimento inválido"}`).join("; "):"";
          const detail=details||payload?.error||payload?.message||`A solicitação falhou (HTTP ${response.status}).`;
          window.dispatchEvent(new CustomEvent("mb:notice",{detail:{title:"Erro ao salvar ou executar operação",detail,kind:"error"}}));
        }catch{
          window.dispatchEvent(new CustomEvent("mb:notice",{detail:{title:"Erro ao salvar ou executar operação",detail:`A solicitação falhou (HTTP ${response.status}).`,kind:"error"}}));
        }
      }
      return response;
    };
    return()=>{window.fetch=originalFetch};
  },[]);
  useEffect(()=>{
    if(!notice)return;
    const timer=window.setTimeout(()=>setNotice(null),10000);
    return()=>window.clearTimeout(timer);
  },[notice]);
  useEffect(()=>{fetch("/api/version",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>{if(d?.version)setVersion(d.version)}).catch(()=>{}); fetch("/api/entitlements",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>{if(d)setEntitlement(d)}).catch(()=>{})},[]);
  useEffect(()=>{
    if(!user||path==="/login"||path==="/setup"||path==="/primeiro-acesso")return;
    let active=true;
    const checkAlerts=async()=>{
      try{
        const [messagesRes,appointmentsRes]=await Promise.all([
          fetch("/api/messages?folder=unread",{cache:"no-store"}),
          fetch("/api/appointments",{cache:"no-store"})
        ]);
        const [messages,appointments]=await Promise.all([
          messagesRes.ok?messagesRes.json():Promise.resolve(null),
          appointmentsRes.ok?appointmentsRes.json():Promise.resolve(null)
        ]);
        if(!active)return;
        if(Array.isArray(messages?.data))setUnreadMessages(messages.data.length);
        if(Array.isArray(appointments)){
          const endOfToday=new Date();endOfToday.setHours(23,59,59,999);
          setAgendaPending(appointments.filter((item:any)=>{
            if(!["AGENDADO","CONFIRMADO"].includes(String(item.status||"").toUpperCase()))return false;
            const date=new Date(item.scheduledAt);
            return !Number.isNaN(date.getTime())&&date<=endOfToday;
          }).length);
        }
      }catch{}
    };
    checkAlerts();
    const timer=window.setInterval(checkAlerts,60000);
    const onFocus=()=>checkAlerts();
    const onMessagesUpdated=()=>checkAlerts();
    window.addEventListener("focus",onFocus);
    window.addEventListener("mb:messages-updated",onMessagesUpdated);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener("focus",onFocus);window.removeEventListener("mb:messages-updated",onMessagesUpdated)};
  },[user?.email,path]);

  useEffect(()=>{let active=true;const checkCash=async()=>{try{const r=await fetch("/api/cash/session",{cache:"no-store"});if(!r.ok)return;const d=await r.json();if(active)setCashSession(d)}catch{}};checkCash();const timer=window.setInterval(checkCash,60000);const onFocus=()=>checkCash();window.addEventListener("focus",onFocus);return()=>{active=false;window.clearInterval(timer);window.removeEventListener("focus",onFocus)}},[path]);
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
        if(data.version) setVersion(data.version);
        if(current && data.version && data.version!==current) setUpdateAvailable(true);
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
  if(path==="/inicio"||path==="/login"||path==="/setup"||path==="/primeiro-acesso") return <>{children}</>;
  if(user?.mustChangePassword){ router.replace("/primeiro-acesso"); return null; }
  async function logout(){setBusy(true);try{await fetch("/api/auth/logout",{method:"POST"});router.replace("/inicio");router.refresh();}finally{setBusy(false);}}
  return <div className="shell">
    {menuOpen&&<button className="mobile-menu-overlay" aria-label="Fechar menu" onClick={()=>setMenuOpen(false)}/>}
    <aside className={"sidebar"+(menuOpen?" mobile-open":"")}>
      <div className="brand"><div className="brand-mark">{logo?<img src={logo} alt="Logo da óptica"/>:"MB"}</div><div><strong>MB Óptica</strong><small>Gestão inteligente</small></div><button className="mobile-close" aria-label="Fechar menu" onClick={()=>setMenuOpen(false)}>×</button></div>
      <nav>{groups.map(g=>{const items=g.items.filter(([label,href])=>{if(label==="Assinatura do sistema"||label==="Contabilidade") return user?.role==="ADMIN"; if(!entitlement) return true; const moduleByLabel:Record<string,string>={"Dashboard":"Dashboard","Agenda":"Agenda","Clientes":"Clientes","Atendimento":"Atendimento","Mensagens":"Mensagens","Produtos e estoque":"Produtos e estoque","Fornecedores":"Fornecedores","Vendas":"Vendas","Financeiro":"Financeiro","Relatórios":"Relatórios","Configurações":"Configurações","Migração":"Migração"}; const module=moduleByLabel[label]; return !module || entitlement.owner || entitlement.modules.includes(module);});return <div className="nav-group" key={g.label}><span>{g.label}</span>{items.map(([label,href])=><Link className={path===href?"active":""} href={href} key={href} onClick={()=>setMenuOpen(false)}><span style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,width:"100%"}}><span>{label}</span>{((href==="/mensagens"&&unreadMessages>0)||(href==="/agenda"&&agendaPending>0)||(href==="/vendas"&&cashSession?.closingPending))&&<span title={href==="/mensagens"?unreadMessages+" mensagem(ns) não lida(s)":href==="/agenda"?agendaPending+" agendamento(s) pendente(s) até hoje":"Fechamento de caixa pendente"} aria-label={href==="/mensagens"?unreadMessages+" mensagens não lidas":href==="/agenda"?agendaPending+" agendamentos pendentes":"Fechamento pendente"} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:20,height:20,padding:"0 6px",borderRadius:999,background:"#b42318",color:"#fff",fontSize:11,fontWeight:800,lineHeight:1,flexShrink:0}}>{href==="/mensagens"?(unreadMessages>99?"99+":unreadMessages):href==="/agenda"?(agendaPending>99?"99+":agendaPending):"!"}</span>}</span></Link>)}</div>})}</nav>
      <div className="sidebar-footer"><div>Sistema atualizado automaticamente</div><div>Versão {version ? version.slice(0,8) : "carregando..."}</div></div>
    </aside>
    <main className="main">
      <header className="topbar">
        <div className="topbar-left"><button className="mobile-menu-button" aria-label="Abrir menu" aria-expanded={menuOpen} onClick={()=>setMenuOpen(true)}>☰</button><div><span className="eyebrow">OPERAÇÃO</span><strong>Centro de controle</strong></div></div>
        <div className="top-actions">{user&&<Link className="version-control" href="/vendas#caixa" title={cashSession===undefined?"Consultar situação do caixa":cashSession===null?"Abrir o caixa e registrar o horário de início":"Conferir o caixa e registrar o fechamento"}>{cashSession===undefined?"Caixa":cashSession===null?"Abrir caixa":"Fechar caixa"}</Link>}{user&&cashSession&&cashSession.closingPending&&<Link className="version-control update-available" href="/vendas#caixa" title="Há um caixa aberto de dia anterior">Fechamento pendente</Link>}<button className={"version-control"+(updateAvailable?" update-available":"")} onClick={()=>window.location.reload()} title="Verificar e aplicar a versão mais recente">{updateAvailable?"↻ Nova versão":"↻ Atualizar sistema"}</button>{entitlement&&!entitlement.owner&&<span className="version-badge" title={entitlement.trial?"Modo degustação":"Recursos conforme assinatura"}>{entitlement.trial?"Degustação":"Plano "+entitlement.plan}</span>}<span className="version-badge">v{version ? version.slice(0,8) : "..."}</span><button className="icon-button">⌕</button><button className="user-chip" onClick={logout} disabled={busy}>{user?.name ?? "Usuário"} <span>{roleLabel[user?.role ?? ""] ?? user?.role ?? ""} · {busy?"Saindo...":"Sair"}</span></button></div>
      </header>
      {children}
    </main>
    {notice&&<div className={"global-notice "+(notice.kind==="success"?"global-notice-success":"global-notice-error")} role="alert" aria-live="assertive">
      <div className="global-notice-icon" aria-hidden="true">{notice.kind==="success"?"✓":"!"}</div>
      <div className="global-notice-content"><strong>{notice.title}</strong><p>{notice.detail}</p></div>
      <button type="button" className="global-notice-close" aria-label="Fechar aviso" onClick={()=>setNotice(null)}>×</button>
    </div>}
  </div>
}