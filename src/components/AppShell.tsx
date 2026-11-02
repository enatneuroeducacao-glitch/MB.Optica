"use client";
import Link from "next/link";
import {usePathname,useRouter} from "next/navigation";
import {ReactNode,useEffect,useState} from "react";

const groups=[{label:"Visão geral",items:[["Dashboard","/"],["Agenda","/agenda"]]},{label:"Óptica",items:[["Clientes","/clientes"],["Atendimento","/atendimento"],["Armações de terceiros","/armacoes-terceiros"]]},{label:"Comunicação",items:[["Mensagens","/mensagens"]]},{label:"Operação",items:[["Produtos e estoque","/produtos"],["Fornecedores","/fornecedores"],["Vendas","/vendas"]]},{label:"Gestão",items:[["Financeiro","/financeiro"],["Contabilidade","/contabilidade"],["Relatórios","/relatorios"],["Assinatura do sistema","/assinatura"],["Configurações","/configuracoes"],["Migração","/migracao"]]}] as const;

type User={name:string;email:string;role:string;mustChangePassword?:boolean}|null;
type Entitlement={owner:boolean;plan:string;status:string;trial:boolean;modules:string[];maxUsers:number|null;activeUsers:number|null};
const roleLabel:Record<string,string>={ADMIN:"Administrador",GERENTE:"Gerente",VENDEDOR:"Vendedor",FINANCEIRO:"Financeiro",LABORATORIO:"Laboratório"};

export function AppShell({children,user}:{children:ReactNode;user:User}){
  const path=usePathname(); const router=useRouter(); const [busy,setBusy]=useState(false); const [notice,setNotice]=useState<{title:string;detail:string;kind:"error"|"success"|"warning"|"info";actionLabel?:string;actionHref?:string;code?:string}|null>(null); const [entitlement,setEntitlement]=useState<Entitlement|null>(null); const [menuOpen,setMenuOpen]=useState(false); const [logo,setLogo]=useState<string|null>(null); const [version,setVersion]=useState<string>(""); const [updateAvailable,setUpdateAvailable]=useState(false); const [cashSession,setCashSession]=useState<any>(undefined); const [unreadMessages,setUnreadMessages]=useState(0); const [agendaPending,setAgendaPending]=useState(0);

  useEffect(()=>{
    const showNotice=(event:Event)=>{
      const detail=(event as CustomEvent<{title?:string;detail?:string;kind?:"error"|"success"|"warning"|"info";actionLabel?:string;actionHref?:string;code?:string}>).detail;
      if(!detail)return;
      setNotice({title:detail.title||"Não foi possível concluir a operação",detail:detail.detail||"Revise os dados e tente novamente.",kind:detail.kind||"error",actionLabel:detail.actionLabel,actionHref:detail.actionHref,code:detail.code});
    };
    window.addEventListener("mb:notice",showNotice);
    return()=>window.removeEventListener("mb:notice",showNotice);
  },[]);
  useEffect(()=>{
    const originalFetch=window.fetch.bind(window);
    const routeForRequest=(url:string)=>{
      const value=url.toLowerCase();
      if(/auth|session|login|permission|entitlement/.test(value))return {href:"/configuracoes",label:"Abrir acesso e configurações"};
      if(/pedido|order|laboratory|laboratorio/.test(value))return {href:"/pedidos",label:"Abrir pedidos"};
      if(/product|stock|inventory|estoque/.test(value))return {href:"/produtos",label:"Abrir produtos e estoque"};
      if(/client|customer|cliente/.test(value))return {href:"/clientes",label:"Abrir clientes"};
      if(/supplier|fornecedor/.test(value))return {href:"/fornecedores",label:"Abrir fornecedores"};
      if(/sale|cash|venda|caixa|payment|settlement/.test(value))return {href:"/vendas",label:"Abrir vendas e caixa"};
      if(/finance|accounting|financial|financeiro|contabilidade/.test(value))return {href:"/financeiro",label:"Abrir financeiro"};
      if(/appointment|agenda/.test(value))return {href:"/agenda",label:"Abrir agenda"};
      if(/report|relatorio/.test(value))return {href:"/relatorios",label:"Abrir relatórios"};
      if(/config|setting|branding/.test(value))return {href:"/configuracoes",label:"Abrir configurações"};
      return {href:window.location.pathname+window.location.search,label:"Abrir esta tela em nova aba"};
    };
    window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
      const method=(init?.method||(input instanceof Request?input.method:"GET")).toUpperCase();
      const url=typeof input==="string"?input:input instanceof URL?input.toString():input.url;
      try{
        const response=await originalFetch(input,init);
        if(method!=="GET" && url.startsWith("/api/") && !response.ok){
          const destination=routeForRequest(url);
          try{
            const payload=await response.clone().json();
            const details=Array.isArray(payload?.details)?payload.details.map((item:{field?:string;message?:string})=>`${item.field||"Campo"}: ${item.message||"preenchimento inválido"}`).join("; "):"";
            const detail=details||payload?.error||payload?.message||`A solicitação falhou (HTTP ${response.status}).`;
            const code=payload?.code||payload?.errorCode||`HTTP ${response.status}`;
            window.dispatchEvent(new CustomEvent("mb:notice",{detail:{title:"A operação não foi concluída",detail,kind:"error",actionHref:destination.href,actionLabel:destination.label,code}}));
          }catch{
            window.dispatchEvent(new CustomEvent("mb:notice",{detail:{title:"A operação não foi concluída",detail:`A solicitação falhou (HTTP ${response.status}). Verifique os dados e tente novamente.`,kind:"error",actionHref:destination.href,actionLabel:destination.label,code:`HTTP ${response.status}`}}));
          }
        }
        return response;
      }catch(error){
        if(method!=="GET" && url.startsWith("/api/")){
          const destination=routeForRequest(url);
          window.dispatchEvent(new CustomEvent("mb:notice",{detail:{title:"Falha de comunicação com o sistema",detail:error instanceof Error?error.message:"Não foi possível conectar ao servidor. Confira a conexão antes de repetir a operação.",kind:"error",actionHref:destination.href,actionLabel:destination.label,code:"NETWORK_ERROR"}}));
        }
        throw error;
      }
    };
    return()=>{window.fetch=originalFetch};
  },[]);
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
  async function downloadLocalBackup(){
    try{
      setBusy(true);
      const response=await fetch("/api/relatorios",{cache:"no-store"});
      if(!response.ok)throw new Error("Não foi possível gerar o backup (HTTP "+response.status+").");
      const reports=await response.json();
      if(reports?.error)throw new Error(reports.error);
      const payload={schema:"mb-optica-backup-operacional.v1",generatedAt:new Date().toISOString(),notice:"Backup operacional em JSON com os dados disponibilizados pelo módulo de relatórios. Não substitui um backup integral do banco de dados.",reports};
      const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      const stamp=new Date().toISOString().replace(/[:.]/g,"-");
      link.href=url;link.download="mb-optica-backup-"+stamp+".json";
      document.body.appendChild(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
      setNotice({title:"Backup preparado para salvar no PC",detail:"O arquivo JSON foi enviado para download pelo navegador. Confira a pasta Downloads ou escolha outro local na janela de salvamento, se disponível.",kind:"success"});
    }catch(error){
      setNotice({title:"Não foi possível gerar o backup",detail:error instanceof Error?error.message:"Ocorreu um erro inesperado ao gerar o arquivo.",kind:"error"});
    }finally{setBusy(false)}
  }
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
        <div className="top-actions">{user&&<a className="version-control university-top-link" href="https://universidade.mboptica.com.br/" target="_blank" rel="noopener noreferrer" title="Abrir a Universidade MB em uma nova aba">🎓 Universidade MB ↗</a>}{user&&<button className="version-control backup-top-button" type="button" onClick={downloadLocalBackup} disabled={busy} title="Gerar um backup operacional JSON para salvar no computador">⇩ Backup</button>}{user&&<Link className="version-control" href="/vendas#caixa" title={cashSession===undefined?"Consultar situação do caixa":cashSession===null?"Abrir o caixa e registrar o horário de início":"Conferir o caixa e registrar o fechamento"}>{cashSession===undefined?"Caixa":cashSession===null?"Abrir caixa":"Fechar caixa"}</Link>}{user&&cashSession&&cashSession.closingPending&&<Link className="version-control update-available" href="/vendas#caixa" title="Há um caixa aberto de dia anterior">Fechamento pendente</Link>}<button className={"version-control"+(updateAvailable?" update-available":"")} onClick={()=>window.location.reload()} title="Verificar e aplicar a versão mais recente">{updateAvailable?"↻ Nova versão":"↻ Atualizar sistema"}</button>{entitlement&&!entitlement.owner&&<span className="version-badge" title={entitlement.trial?"Modo degustação":"Recursos conforme assinatura"}>{entitlement.trial?"Degustação":"Plano "+entitlement.plan}</span>}<span className="version-badge">v{version ? version.slice(0,8) : "..."}</span><button className="icon-button">⌕</button><button className="user-chip" onClick={logout} disabled={busy}>{user?.name ?? "Usuário"} <span>{roleLabel[user?.role ?? ""] ?? user?.role ?? ""} · {busy?"Saindo...":"Sair"}</span></button></div>
      </header>
      {children}
    </main>
    {notice&&<div className={"global-notice global-notice-"+notice.kind} role={notice.kind==="error"?"alert":"status"} aria-live={notice.kind==="error"?"assertive":"polite"} aria-atomic="true">
      <div className="global-notice-icon" aria-hidden="true">{notice.kind==="success"?"✓":notice.kind==="warning"?"⚠":notice.kind==="info"?"i":"!"}</div>
      <div className="global-notice-content">
        <strong>{notice.title}</strong>
        <p>{notice.detail}</p>
        {notice.code&&<details className="global-notice-technical"><summary>Detalhes técnicos ({notice.code})</summary><code>{notice.code}</code></details>}
        {notice.kind==="error"&&notice.actionHref&&<div className="global-notice-actions"><button type="button" className="global-notice-action" onClick={()=>{const target=new URL(notice.actionHref!,window.location.origin);if(target.origin===window.location.origin)window.open(target.toString(),"_blank","noopener,noreferrer");}}>{notice.actionLabel||"Abrir local para correção"} ↗</button><span>Abre em nova aba para preservar esta edição.</span></div>}
      </div>
      <button type="button" className="global-notice-close" aria-label="Fechar aviso" onClick={()=>setNotice(null)}>×</button>
    </div>}
  </div>
}