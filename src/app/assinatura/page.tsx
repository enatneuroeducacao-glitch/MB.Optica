"use client";

import {useEffect,useMemo,useState} from "react";

type PlanCode="BASICO"|"PROFISSIONAL"|"PREMIUM"|"ENTERPRISE"|"PROPRIETARIO";
type Status="AVALIACAO"|"ATIVA"|"PENDENTE"|"SUSPENSA"|"CANCELADA"|"EXPIRADA";

type Subscription={
  id:string;
  plan:PlanCode;
  status:Status;
  billingCycle:"MENSAL"|"ANUAL";
  price:number;
  maxUsers:number;
  activeUsers:number;
  maxUnits:number|null;
  maxClients:number|null;
  maxProducts:number|null;
  maxSales:number|null;
  maxOrders:number|null;
  trialDays:number;
  graceDays:number;
  licenseType:"SUBSCRIPTION"|"PROPRIETARY";
  modules:string[];
  trialEndsAt:string|null;
  currentPeriodStart:string|null;
  currentPeriodEnd:string|null;
};

type Entitlement={
  owner:boolean;
  plan:string;
  status:string;
  trial:boolean;
  modules:string[];
  maxUsers:number|null;
  activeUsers:number|null;
  maxUnits:number|null;
  maxClients:number|null;
  maxProducts:number|null;
  maxSales:number|null;
  maxOrders:number|null;
  trialEndsAt:string|null;
  currentPeriodEnd:string|null;
  licenseType:string;
};

const PLAN_CATALOG:Array<{
  code:PlanCode;
  name:string;
  price:number;
  description:string;
  highlight?:string;
  users:number|null;
  units:number|null;
  clients:number|null;
  products:number|null;
  sales:number|null;
  orders:number|null;
  features:string[];
}>=[
  {code:"BASICO",name:"Básico",price:75,description:"Para pequenas ópticas.",users:2,units:1,clients:500,products:500,sales:null,orders:null,features:["Dashboard","Agenda","Clientes","Atendimento","Receitas","Orçamentos","Pedidos","Produtos e estoque","Vendas"]},
  {code:"PROFISSIONAL",name:"Profissional",price:100,description:"Para ópticas em crescimento.",highlight:"Mais escolhido",users:5,units:1,clients:2000,products:2000,sales:null,orders:null,features:["Tudo do Básico","Mensagens","Fornecedores","Financeiro","Relatórios","Laboratório","Indicadores e gestão"]},
  {code:"PREMIUM",name:"Premium",price:150,description:"Para operações maiores.",users:10,units:2,clients:5000,products:5000,sales:null,orders:null,features:["Tudo do Profissional","Multiunidade","Transferência de estoque","Gestão avançada","Relatórios avançados","Integrações"]},
  {code:"ENTERPRISE",name:"Enterprise",price:200,description:"Para redes e operações completas.",users:20,units:5,clients:null,products:null,sales:null,orders:null,features:["Tudo do Premium","Até 5 unidades","Clientes e produtos ilimitados","Auditoria","Migração","API e integrações avançadas","Suporte prioritário"]},
  {code:"PROPRIETARIO",name:"MB Gestão Inteligente — Proprietário",price:2000,description:"Licença proprietária da instalação do MB Gestão Inteligente.",users:null,units:null,clients:null,products:null,sales:null,orders:null,features:["Pagamento único","Todos os módulos","Usuários ilimitados","Unidades ilimitadas","Clientes e produtos ilimitados","Sem expiração comercial","Acesso integral"]},
];

const statusLabels:Record<Status,string>={AVALIACAO:"Degustação",ATIVA:"Ativa",PENDENTE:"Pagamento pendente",SUSPENSA:"Suspensa",CANCELADA:"Cancelada",EXPIRADA:"Expirada"};

function date(value:string|null){if(!value)return "—";return new Intl.DateTimeFormat("pt-BR",{dateStyle:"medium"}).format(new Date(value));}
function money(value:number){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value||0);}
function limit(value:number|null){return value===null?"Ilimitado":value.toLocaleString("pt-BR");}

export default function Page(){
  const [subscription,setSubscription]=useState<Subscription|null>(null);
  const [entitlement,setEntitlement]=useState<Entitlement|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function load(){
    setLoading(true);
    try{
      const [sr,er]=await Promise.all([
        fetch("/api/assinatura",{cache:"no-store"}),
        fetch("/api/entitlements",{cache:"no-store"})
      ]);
      const sd=await sr.json(); const ed=await er.json();
      if(sr.ok)setSubscription(sd.subscription||null);
      if(er.ok)setEntitlement(ed||null);
      if(!sr.ok)throw new Error(sd.error||"Não foi possível carregar a assinatura.");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao carregar assinatura.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load()},[]);

  async function startTrial(){
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/assinatura",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        plan:"BASICO",status:"AVALIACAO",billingCycle:"MENSAL",price:0,maxUsers:1,maxUnits:1,maxClients:100,maxProducts:100,maxSales:20,maxOrders:20,trialDays:15,graceDays:5,
        modules:["Dashboard","Agenda","Clientes","Atendimento","Produtos e estoque","Vendas","Receitas","Orçamentos","Pedidos"]
      })});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Não foi possível iniciar a degustação.");
      setSubscription(d.subscription);setMessage("Degustação de 15 dias iniciada.");
      await load();
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao iniciar degustação.");}
    finally{setBusy(false);}
  }

  const currentCode=(entitlement?.owner?"PROPRIETARIO":subscription?.plan) as PlanCode|undefined;
  const currentCatalog=PLAN_CATALOG.find(p=>p.code===currentCode);
  const usage=useMemo(()=>{
    if(!subscription)return null;
    return {
      users:subscription.maxUsers?Math.min(100,Math.round(subscription.activeUsers/Math.max(1,subscription.maxUsers)*100)):0,
    };
  },[subscription]);

  if(loading)return <section className="page"><div className="panel" style={{padding:20}}>Carregando assinatura...</div></section>;

  if(entitlement?.owner)return <section className="page settings-page">
    <div className="page-heading settings-heading">
      <div><span className="eyebrow">GESTÃO</span><h1>Assinatura do sistema</h1><p>Controle comercial e regras de utilização do MB Gestão Inteligente.</p></div>
      <div className="settings-status"><b>● Instalação proprietária</b><span>MB Gestão Inteligente · acesso integral</span></div>
    </div>
    {message&&<div className="panel settings-message">{message}</div>}
    <div className="panel" style={{padding:24,border:"1px solid var(--line)"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:20,flexWrap:"wrap"}}>
        <div><span className="eyebrow">LICENÇA</span><h2 style={{marginTop:6}}>MB Gestão Inteligente — Proprietário</h2><p style={{color:"var(--muted)",marginTop:8}}>Instalação proprietária com pagamento único de R$ 2.000,00 e sem limitações comerciais.</p></div>
        <div style={{fontSize:28,fontWeight:800}}>{money(2000)} <small style={{fontSize:13,fontWeight:500,color:"var(--muted)"}}>pagamento único</small></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginTop:22}}>
        {["Usuários ilimitados","Unidades ilimitadas","Clientes ilimitados","Produtos ilimitados","Todos os módulos","Sem expiração comercial"].map(x=><div key={x} className="panel" style={{padding:14,background:"var(--surface,#fff)"}}>✓ {x}</div>)}
      </div>
    </div>
    <PlanCatalog currentCode="PROPRIETARIO"/>
  </section>;

  if(!subscription)return <section className="page settings-page">
    <div className="page-heading settings-heading"><div><span className="eyebrow">GESTÃO</span><h1>Assinatura do sistema</h1><p>Escolha como sua óptica deseja utilizar o MB Gestão Inteligente.</p></div></div>
    {message&&<div className="panel settings-message">{message}</div>}
    <div className="panel" style={{padding:24}}>
      <span className="eyebrow">PRIMEIRO PASSO</span>
      <h2 style={{marginTop:6}}>Experimente gratuitamente por 15 dias</h2>
      <p style={{color:"var(--muted)",marginTop:8}}>A degustação permite conhecer a operação do sistema antes de contratar um plano. Os dados não são apagados ao final do período.</p>
      <button className="primary" style={{marginTop:18}} disabled={busy} onClick={startTrial}>{busy?"Iniciando...":"Iniciar degustação de 15 dias"}</button>
    </div>
    <PlanCatalog/>
  </section>;

  const activePlan=currentCatalog||PLAN_CATALOG[0];
  return <section className="page settings-page">
    <div className="page-heading settings-heading">
      <div><span className="eyebrow">GESTÃO</span><h1>Assinatura do sistema</h1><p>Plano, vencimento, limites e recursos disponíveis para esta óptica.</p></div>
      <div className="settings-status"><b>● {statusLabels[subscription.status]}</b><span>{activePlan.name} · {subscription.billingCycle==="MENSAL"?"cobrança mensal":"cobrança anual"}</span></div>
    </div>
    {message&&<div className="panel settings-message">{message}</div>}

    <div className="settings-grid">
      <div className="panel">
        <div className="panel-heading"><div><h2>Plano atual</h2><p>Informações comerciais da assinatura.</p></div></div>
        <div className="settings-list">
          <div><b>Plano</b><span>{activePlan.name}</span></div>
          <div><b>Valor</b><span>{money(subscription.price)}</span></div>
          <div><b>Status</b><span>{statusLabels[subscription.status]}</span></div>
          <div><b>Degustação</b><span>{subscription.status==="AVALIACAO"?date(subscription.trialEndsAt):"Encerrada"}</span></div>
          <div><b>Período atual</b><span>{date(subscription.currentPeriodStart)} até {date(subscription.currentPeriodEnd)}</span></div>
          <div><b>Tolerância após vencimento</b><span>{subscription.graceDays} dias</span></div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-heading"><div><h2>Utilização</h2><p>Limite de usuários deste plano.</p></div></div>
        <div style={{fontSize:34,fontWeight:700}}>{subscription.activeUsers} <span style={{fontSize:16,fontWeight:500,color:"var(--muted)"}}>/ {limit(subscription.maxUsers)}</span></div>
        <div style={{height:10,borderRadius:999,background:"var(--line)",overflow:"hidden",marginTop:14}}><div style={{height:"100%",width:(usage?.users||0)+"%",background:"var(--brand,#b78b3d)"}}/></div>
        <p style={{marginTop:10,color:"var(--muted)"}}>{subscription.activeUsers>=subscription.maxUsers?"Limite de usuários atingido.":"Há espaço disponível para novos usuários."}</p>
      </div>
    </div>

    <div className="panel" style={{marginTop:18}}>
      <div className="panel-heading"><div><h2>Limitações do plano</h2><p>Os limites abaixo são a referência comercial desta assinatura.</p></div></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12}}>
        {[["Usuários",subscription.maxUsers],["Unidades",subscription.maxUnits],["Clientes",subscription.maxClients],["Produtos",subscription.maxProducts],["Vendas",subscription.maxSales],["Ordens de serviço",subscription.maxOrders]].map(([label,value])=><div key={String(label)} style={{border:"1px solid var(--line)",borderRadius:12,padding:15}}><div style={{fontSize:12,color:"var(--muted)"}}>{label}</div><strong style={{display:"block",fontSize:20,marginTop:5}}>{limit(value as number|null)}</strong></div>)}
      </div>
    </div>

    <div className="panel" style={{marginTop:18}}>
      <div className="panel-heading"><div><h2>Recursos liberados</h2><p>Os módulos são liberados conforme o plano contratado.</p></div></div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{(subscription.modules||[]).map(m=><span key={m} style={{border:"1px solid var(--line)",borderRadius:999,padding:"8px 12px",fontSize:13,background:"var(--surface,#fff)"}}>✓ {m}</span>)}</div>
    </div>

    <PlanCatalog currentCode={currentCode}/>
  </section>;
}

function PlanCatalog({currentCode}:{currentCode?:PlanCode}){
  return <div style={{marginTop:24}}>
    <div style={{marginBottom:14}}><span className="eyebrow">PLANOS</span><h2 style={{marginTop:6}}>Escolha o nível de utilização</h2><p style={{color:"var(--muted)",marginTop:5}}>Todos os novos clientes começam com 15 dias de degustação.</p></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14}}>
      {PLAN_CATALOG.map(plan=><div key={plan.code} className="panel" style={{padding:18,border:plan.code===currentCode?"2px solid var(--brand,#b78b3d)":"1px solid var(--line)",position:"relative"}}>
        {plan.highlight&&<span style={{position:"absolute",top:12,right:12,fontSize:11,fontWeight:700,padding:"5px 8px",borderRadius:999,border:"1px solid var(--line)"}}>{plan.highlight}</span>}
        <div className="eyebrow">{plan.code==="PROPRIETARIO"?"LICENÇA":"ASSINATURA"}</div>
        <h3 style={{marginTop:5}}>{plan.name}</h3>
        <p style={{color:"var(--muted)",minHeight:38}}>{plan.description}</p>
        <div style={{fontSize:26,fontWeight:800,margin:"12px 0"}}>{money(plan.price)} <small style={{fontSize:12,fontWeight:500,color:"var(--muted)"}}>{plan.code==="PROPRIETARIO"?"pagamento único":"/ mês"}</small></div>
        <div style={{display:"grid",gap:7,fontSize:13}}>
          <div>Usuários: <b>{limit(plan.users)}</b></div>
          <div>Unidades: <b>{limit(plan.units)}</b></div>
          <div>Clientes: <b>{limit(plan.clients)}</b></div>
          <div>Produtos: <b>{limit(plan.products)}</b></div>
        </div>
        <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid var(--line)",display:"grid",gap:6,fontSize:13}}>
          {plan.features.map(feature=><div key={feature}>✓ {feature}</div>)}
        </div>
        {plan.code===currentCode&&<div style={{marginTop:14,fontWeight:700,fontSize:12}}>PLANO ATUAL</div>}
      </div>)}
    </div>
  </div>;
}
