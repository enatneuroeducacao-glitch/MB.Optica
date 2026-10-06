"use client";
import {useEffect,useMemo,useState} from "react";

type Subscription={
  id:string;
  plan:"BASICO"|"PROFISSIONAL"|"ENTERPRISE";
  status:"AVALIACAO"|"ATIVA"|"PENDENTE"|"SUSPENSA"|"CANCELADA"|"EXPIRADA";
  billingCycle:"MENSAL"|"ANUAL";
  price:number;
  maxUsers:number;
  activeUsers:number;
  modules:string[];
  trialEndsAt:string|null;
  currentPeriodStart:string|null;
  currentPeriodEnd:string|null;
};

const planLabels={BASICO:"Básico",PROFISSIONAL:"Profissional",ENTERPRISE:"Enterprise"};
const statusLabels={AVALIACAO:"Em avaliação",ATIVA:"Ativa",PENDENTE:"Pagamento pendente",SUSPENSA:"Suspensa",CANCELADA:"Cancelada",EXPIRADA:"Expirada"};

function date(value:string|null){
  if(!value)return "—";
  return new Intl.DateTimeFormat("pt-BR",{dateStyle:"medium"}).format(new Date(value));
}
function money(value:number){
  return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value||0);
}

export default function Page(){
  const [subscription,setSubscription]=useState<Subscription|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [edit,setEdit]=useState(false);
  const [form,setForm]=useState({plan:"PROFISSIONAL",status:"AVALIACAO",billingCycle:"MENSAL",price:"",maxUsers:"5"});

  async function load(){
    setLoading(true);
    try{
      const r=await fetch("/api/assinatura",{cache:"no-store"});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Não foi possível carregar a assinatura.");
      setSubscription(d.subscription);
      if(d.subscription)setForm({
        plan:d.subscription.plan,
        status:d.subscription.status,
        billingCycle:d.subscription.billingCycle,
        price:String(d.subscription.price??0),
        maxUsers:String(d.subscription.maxUsers??5)
      });
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao carregar assinatura.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load()},[]);

  async function save(){
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/assinatura",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        plan:form.plan,status:form.status,billingCycle:form.billingCycle,
        price:form.price===""?0:Number(form.price),maxUsers:Number(form.maxUsers)
      })});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Não foi possível salvar.");
      setSubscription(d.subscription);setEdit(false);setMessage("Assinatura atualizada.");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao salvar assinatura.");}
    finally{setBusy(false);}
  }

  async function setStatus(status:Subscription["status"]){
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/assinatura",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Não foi possível atualizar o status.");
      setSubscription(d.subscription);setForm(f=>({...f,status}));setMessage("Status da assinatura atualizado.");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao atualizar assinatura.");}
    finally{setBusy(false);}
  }

  const usage=useMemo(()=>subscription?Math.min(100,Math.round((subscription.activeUsers/Math.max(1,subscription.maxUsers))*100)):0,[subscription]);

  if(loading)return <section className="page"><div className="panel" style={{padding:20}}>Carregando assinatura...</div></section>;

  return <section className="page settings-page">
    <div className="page-heading settings-heading">
      <div><span className="eyebrow">GESTÃO</span><h1>Assinatura do sistema</h1><p>Controle do plano de uso do MB Gestão Inteligente.</p></div>
      {subscription&&<div className="settings-status"><b>● {statusLabels[subscription.status]}</b><span>Plano {planLabels[subscription.plan]} · {subscription.billingCycle==="MENSAL"?"cobrança mensal":"cobrança anual"}</span></div>}
    </div>

    {message&&<div className="panel settings-message">{message}</div>}

    {!subscription ? <div className="panel" style={{padding:24}}>
      <h2>Assinatura ainda não configurada</h2>
      <p style={{color:"var(--muted)",marginTop:8}}>Cadastre o primeiro plano desta instalação para que o controle comercial do sistema fique registrado.</p>
      <button className="primary" style={{marginTop:18}} disabled={busy} onClick={()=>{setEdit(true);setForm({plan:"PROFISSIONAL",status:"AVALIACAO",billingCycle:"MENSAL",price:"",maxUsers:"5"})}}>Configurar assinatura</button>
    </div> : <>
      <div className="settings-grid">
        <div className="panel">
          <div className="panel-heading"><div><h2>Plano atual</h2><p>Dados comerciais e limites de utilização.</p></div><button className="primary" onClick={()=>setEdit(!edit)}>{edit?"Fechar edição":"Editar assinatura"}</button></div>
          {!edit ? <div className="settings-list">
            <div><b>Plano</b><span>{planLabels[subscription.plan]}</span></div>
            <div><b>Status</b><span>{statusLabels[subscription.status]}</span></div>
            <div><b>Valor</b><span>{subscription.price?money(subscription.price):"Definido no contrato"}</span></div>
            <div><b>Ciclo</b><span>{subscription.billingCycle==="MENSAL"?"Mensal":"Anual"}</span></div>
            <div><b>Período atual</b><span>{date(subscription.currentPeriodStart)} até {date(subscription.currentPeriodEnd)}</span></div>
            <div><b>Avaliação até</b><span>{date(subscription.trialEndsAt)}</span></div>
          </div> : <div className="settings-form">
            <label>Plano<select value={form.plan} onChange={e=>setForm({...form,plan:e.target.value})}><option value="BASICO">Básico</option><option value="PROFISSIONAL">Profissional</option><option value="ENTERPRISE">Enterprise</option></select></label>
            <label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="AVALIACAO">Em avaliação</option><option value="ATIVA">Ativa</option><option value="PENDENTE">Pagamento pendente</option><option value="SUSPENSA">Suspensa</option><option value="CANCELADA">Cancelada</option><option value="EXPIRADA">Expirada</option></select></label>
            <label>Ciclo de cobrança<select value={form.billingCycle} onChange={e=>setForm({...form,billingCycle:e.target.value})}><option value="MENSAL">Mensal</option><option value="ANUAL">Anual</option></select></label>
            <label>Valor da assinatura<input type="number" min="0" step="0.01" value={form.price} onChange={e=>setForm({...form,price:e.target.value})} placeholder="Definido no contrato"/></label>
            <label>Limite de usuários<input type="number" min="1" value={form.maxUsers} onChange={e=>setForm({...form,maxUsers:e.target.value})}/></label>
            <button className="primary" disabled={busy} onClick={save}>Salvar assinatura</button>
          </div>}
        </div>

        <div className="panel">
          <div className="panel-heading"><div><h2>Utilização</h2><p>Usuários ativos incluídos no plano.</p></div></div>
          <div style={{fontSize:34,fontWeight:700}}>{subscription.activeUsers} <span style={{fontSize:16,fontWeight:500,color:"var(--muted)"}}>/ {subscription.maxUsers}</span></div>
          <div style={{height:10,borderRadius:999,background:"var(--line)",overflow:"hidden",marginTop:14}}><div style={{height:"100%",width:usage+"%",background:"var(--brand,#b78b3d)"}}/></div>
          <p style={{marginTop:10,color:"var(--muted)"}}>{subscription.activeUsers>=subscription.maxUsers?"Limite de usuários atingido.":"Há espaço disponível para novos usuários."}</p>
        </div>
      </div>

      <div className="panel" style={{marginTop:18}}>
        <div className="panel-heading"><div><h2>Módulos incluídos</h2><p>Esta lista será usada como base para a futura gestão de planos por módulo.</p></div></div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{(subscription.modules||[]).map(m=><span key={m} style={{border:"1px solid var(--line)",borderRadius:999,padding:"8px 12px",fontSize:13,background:"var(--surface,#fff)"}}>{m}</span>)}</div>
      </div>

      <div className="panel" style={{marginTop:18}}>
        <div className="panel-heading"><div><h2>Ações da assinatura</h2><p>Somente o administrador pode alterar o status comercial.</p></div></div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          {subscription.status!=="ATIVA"&&<button className="primary" disabled={busy} onClick={()=>setStatus("ATIVA")}>Ativar assinatura</button>}
          {subscription.status==="ATIVA"&&<button className="secondary" disabled={busy} onClick={()=>setStatus("SUSPENSA")}>Suspender</button>}
          {subscription.status!=="CANCELADA"&&<button className="secondary" disabled={busy} style={{color:"#b42318",borderColor:"#f2b8b5"}} onClick={()=>{if(window.confirm("Cancelar a assinatura desta instalação?"))setStatus("CANCELADA")}}>Cancelar assinatura</button>}
        </div>
      </div>
    </>}
  </section>;
}
