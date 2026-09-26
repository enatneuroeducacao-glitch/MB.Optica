"use client";
import {useEffect,useMemo,useState} from "react";
import {StatCard} from "@/components/StatCard";

type Account={id:string;type:"RECEBER"|"PAGAR";description:string;dueDate:string;amount:number|string;paidAmount:number|string;status:string;customer?:{name:string}|null;supplier?:{name:string}|null};
type Cash={id:string;openingCash:number|string;closedAt:string|null;openedAt:string;movements:{id:string;kind:string;amount:number|string;description:string;createdAt:string}[]}|null;
const money=(v:any)=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const date=(v:any)=>new Date(v).toLocaleDateString("pt-BR");
const api=async(body:any)=>{const r=await fetch("/api/financeiro",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.detail||d.error||"Erro");return d};

export default function Financeiro(){
 const [data,setData]=useState<any>(null);
 const [tab,setTab]=useState("VISÃO");
 const [msg,setMsg]=useState("");
 const [account,setAccount]=useState({type:"RECEBER",description:"",amount:"",dueDate:new Date().toISOString().slice(0,10),notes:""});
 const [settle,setSettle]=useState({accountId:"",amount:"",method:"PIX",reference:""});
 const [cash,setCash]=useState({amount:"",description:""});
 const [cashMove,setCashMove]=useState({kind:"ENTRADA",amount:"",description:""});
 const load=async()=>{const r=await fetch("/api/financeiro",{cache:"no-store"});const d=await r.json();if(r.ok)setData(d);else setMsg(d.error||"Erro ao carregar")};
 useEffect(()=>{load()},[]);
 const accounts:Account[]=data?.accounts||[];
 const summary=data?.summary||{};
 const openCash:Cash=data?.openCash||null;
 const upcoming=useMemo(()=>accounts.filter(a=>a.status!=="PAGO"&&a.status!=="CANCELADO").slice(0,12),[accounts]);
 const submitAccount=async(e:any)=>{e.preventDefault();try{await api({action:"CREATE_ACCOUNT",...account,amount:Number(account.amount)});setMsg("Lançamento criado.");setAccount({...account,description:"",amount:"",notes:""});await load()}catch(e:any){setMsg(e.message)}};
 const settleAccount=async(e:any)=>{e.preventDefault();try{await api({action:"SETTLE_ACCOUNT",...settle,amount:Number(settle.amount)});setMsg("Liquidação registrada.");setSettle({...settle,accountId:"",amount:"",reference:""});await load()}catch(e:any){setMsg(e.message)}};
 const open=async()=>{try{await api({action:"OPEN_CASH",amount:Number(cash.amount||0),notes:cash.description});setMsg("Caixa aberto.");await load()}catch(e:any){setMsg(e.message)}};
 const movement=async(e:any)=>{e.preventDefault();try{await api({action:"CASH_MOVEMENT",...cashMove,amount:Number(cashMove.amount)});setMsg("Movimento lançado.");setCashMove({...cashMove,amount:"",description:""});await load()}catch(e:any){setMsg(e.message)}};
 const close=async()=>{try{const d=await api({action:"CLOSE_CASH"});setMsg("Caixa fechado. Saldo esperado: "+money(d.expected));await load()}catch(e:any){setMsg(e.message)}};

 return <section className="page">
  <div className="page-heading">
   <div><span className="eyebrow">CENTRO FINANCEIRO</span><h1>Financeiro</h1><p>Visão integrada de vendas, recebíveis, pagamentos e caixa da óptica.</p></div>
   <button className="primary" onClick={()=>setTab("LANÇAR")}>+ Novo lançamento</button>
  </div>
  {msg&&<div className="notice">{msg}</div>}
  <div className="stats">
   <StatCard label="A receber" value={money(summary.receivable)} detail="saldo aberto"/>
   <StatCard label="A pagar" value={money(summary.payable)} detail="obrigações abertas"/>
   <StatCard label="Recebido hoje" value={money(summary.todayReceived)} detail="pagamentos registrados"/>
   <StatCard label="Saldo de caixa" value={money(summary.cashBalance)} detail={openCash?"caixa aberto":"caixa fechado"}/>
  </div>
  <div className="finance-tabs">{["VISÃO","RECEBER","PAGAR","CAIXA","LANÇAR"].map(x=><button key={x} className={tab===x?"active":""} onClick={()=>setTab(x)}>{x}</button>)}</div>

  {tab==="VISÃO"&&(
   <div className="grid-two">
    <div className="panel"><div className="panel-heading"><div><h2>Agenda financeira</h2><p>Próximos títulos e vencimentos.</p></div></div>
     <div className="finance-list">{upcoming.map(a=><div key={a.id}><span><b>{a.type==="RECEBER"?"A receber":"A pagar"}</b> · {date(a.dueDate)} · {a.customer?.name||a.supplier?.name||"Lançamento"}</span><strong>{money(Number(a.amount)-Number(a.paidAmount))}</strong></div>)}</div>
    </div>
    <div className="panel"><div className="panel-heading"><div><h2>Indicadores</h2><p>Controle financeiro operacional.</p></div></div>
     <div className="finance-kpis"><div><b>{summary.dueToday||0}</b><span>vencendo hoje</span></div><div><b>{money(summary.ticket)}</b><span>ticket médio</span></div><div><b>{data?.sales?.length||0}</b><span>vendas recentes</span></div></div>
     <div className="cash-state"><span className={openCash?"online-dot":"offline-dot"}></span><div><b>{openCash?"Caixa aberto":"Caixa fechado"}</b><small>{openCash?"Abertura "+date(openCash.openedAt):"Abra o caixa para movimentar valores."}</small></div>{openCash?<button className="secondary" onClick={close}>Fechar caixa</button>:<button className="primary" onClick={()=>setTab("CAIXA")}>Abrir caixa</button>}</div>
    </div>
   </div>
  )}

  {(tab==="RECEBER"||tab==="PAGAR")&&(
   <div className="panel"><div className="panel-heading"><div><h2>{tab==="RECEBER"?"Contas a receber":"Contas a pagar"}</h2><p>Títulos financeiros reais.</p></div></div>
    <div className="finance-list">{accounts.filter(a=>a.type===tab).map(a=>{
      const saldo=Math.max(0,Number(a.amount)-Number(a.paidAmount));
      return <div key={a.id}><span><b>{a.description}</b><br/><small>{date(a.dueDate)} · {a.customer?.name||a.supplier?.name||"—"} · {a.status}</small></span><strong>{money(saldo)}</strong><button className="secondary" onClick={()=>{setSettle({accountId:a.id,amount:String(saldo),method:"PIX",reference:""});setTab("LANÇAR")}}>Liquidar</button></div>
    })}</div>
   </div>
  )}

  {tab==="CAIXA"&&(
   <div className="grid-two">
    <div className="panel"><div className="panel-heading"><div><h2>Caixa operacional</h2><p>Abertura, entradas, saídas, sangrias e fechamento.</p></div></div>
     {openCash?(
      <><div className="cash-state"><span className="online-dot"></span><div><b>Caixa aberto</b><small>Abertura: {money(openCash.openingCash)}</small></div><button className="secondary" onClick={close}>Fechar caixa</button></div>
      <form onSubmit={movement} className="form-grid"><label>Tipo<select value={cashMove.kind} onChange={e=>setCashMove({...cashMove,kind:e.target.value})}><option>ENTRADA</option><option>REFORCO</option><option>SAIDA</option><option>SANGRIA</option></select></label><label>Valor<input type="number" step="0.01" value={cashMove.amount} onChange={e=>setCashMove({...cashMove,amount:e.target.value})} required/></label><label className="wide">Descrição<input value={cashMove.description} onChange={e=>setCashMove({...cashMove,description:e.target.value})} required/></label><button className="primary">Lançar movimento</button></form></>
     ):(
      <form onSubmit={open} className="form-grid"><label>Fundo de caixa<input type="number" step="0.01" value={cash.amount} onChange={e=>setCash({...cash,amount:e.target.value})} required/></label><label className="wide">Observação<input value={cash.description} onChange={e=>setCash({...cash,description:e.target.value})}/></label><button className="primary">Abrir caixa</button></form>
     )}
    </div>
    <div className="panel"><div className="panel-heading"><div><h2>Movimentações</h2><p>Últimos lançamentos do caixa.</p></div></div><div className="finance-list">{(openCash?.movements||[]).map(m=><div key={m.id}><span>{m.kind} · {m.description}<br/><small>{date(m.createdAt)}</small></span><strong>{money(m.amount)}</strong></div>)}</div></div>
   </div>
  )}

  {tab==="LANÇAR"&&(
   <div className="grid-two">
    <div className="panel"><div className="panel-heading"><div><h2>Novo título</h2><p>Crie contas a receber ou a pagar.</p></div></div><form onSubmit={submitAccount} className="form-grid"><label>Tipo<select value={account.type} onChange={e=>setAccount({...account,type:e.target.value})}><option>RECEBER</option><option>PAGAR</option></select></label><label>Valor<input type="number" step="0.01" value={account.amount} onChange={e=>setAccount({...account,amount:e.target.value})} required/></label><label className="wide">Descrição<input value={account.description} onChange={e=>setAccount({...account,description:e.target.value})} required/></label><label>Vencimento<input type="date" value={account.dueDate} onChange={e=>setAccount({...account,dueDate:e.target.value})} required/></label><label className="wide">Observações<textarea value={account.notes} onChange={e=>setAccount({...account,notes:e.target.value})}/></label><button className="primary">Salvar lançamento</button></form></div>
    <div className="panel"><div className="panel-heading"><div><h2>Liquidar título</h2><p>Registre recebimentos ou pagamentos parciais/totais.</p></div></div><form onSubmit={settleAccount} className="form-grid"><label className="wide">Título<select value={settle.accountId} onChange={e=>{const a=accounts.find(x=>x.id===e.target.value);setSettle({...settle,accountId:e.target.value,amount:a?String(Math.max(0,Number(a.amount)-Number(a.paidAmount))):""})}}><option value="">Selecione</option>{accounts.filter(a=>a.status!=="PAGO"&&a.status!=="CANCELADO").map(a=><option key={a.id} value={a.id}>{a.type} · {a.description} · {money(Number(a.amount)-Number(a.paidAmount))}</option>)}</select></label><label>Valor<input type="number" step="0.01" value={settle.amount} onChange={e=>setSettle({...settle,amount:e.target.value})} required/></label><label>Meio<select value={settle.method} onChange={e=>setSettle({...settle,method:e.target.value})}><option>PIX</option><option>Dinheiro</option><option>Cartão</option><option>Transferência</option><option>Boleto</option></select></label><label className="wide">Referência<input value={settle.reference} onChange={e=>setSettle({...settle,reference:e.target.value})}/></label><button className="primary">Registrar liquidação</button></form></div>
   </div>
  )}
 </section>
}