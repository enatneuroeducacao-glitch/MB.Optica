"use client";
import {useEffect,useState} from "react";
import {useRealtimeRefresh} from "@/lib/use-realtime-refresh";
import {StatCard} from "@/components/StatCard";
import {money} from "@/lib/domain";

type DashboardData={customers:number;products:number;integratedProducts:number;orders:number;receivables:number;payables:number;salesToday:number;receivedToday:number;cashBalance:number;cashOpen:boolean;lowStock:number;zeroStock:number;overdue:number;appointmentsToday:number;appointments:{id:string;scheduledAt:string;type:string;professionalName:string;customer:{name:string}}[];recentOrders:{id:string;number:number;status:string;dueDate:string|null;total:number;customer:{name:string}}[];laboratory:Record<string,number>};
type LegacyFinancial={billing:number;received:number;receivable:number;payable:number;salesCount:number;clientsActive:number;salesToday:number;salesTodayCount:number;months:{month:string;sales:number;billing:number;received:number;receivable:number}[]};
const statusLabel=(s:string)=>({AGUARDANDO_LABORATORIO:"Aguardando laboratório",EM_PRODUCAO:"Em produção",RECEBIDO:"Recebido",CONFERENCIA:"Conferência",RETORNO_GARANTIA:"Retorno em garantia",PRONTO:"Pronto"} as Record<string,string>)[s]||s;

export default function Dashboard(){
 const [data,setData]=useState<DashboardData|null>(null); const [legacy,setLegacy]=useState<LegacyFinancial|null>(null); const [error,setError]=useState("");
 const load=async()=>{try{const r=await fetch("/api/dashboard",{cache:"no-store"});if(!r.ok)throw new Error("Não foi possível carregar o dashboard");setData(await r.json());setError("")}catch(e){setError(e instanceof Error?e.message:"Erro ao carregar dashboard")}};
 const loadLegacy=async()=>{try{const r=await fetch("/api/migration/financial-summary",{cache:"no-store"});if(r.ok)setLegacy(await r.json())}catch{}};

 useEffect(()=>{load();loadLegacy()},[]);
 useRealtimeRefresh(load,15000);
 return <section className="page">
  <div className="page-heading dashboard-header"><div><span className="eyebrow">MB ÓPTICA</span><h1>Centro de controle</h1><p>Visão operacional atualizada a partir do banco de dados.</p></div><nav className="dashboard-actions"><a className="primary" href="/vendas">+ Nova venda</a><a className="secondary" href="/clientes">+ Novo cliente</a><a className="secondary" href="/pedidos">+ Novo pedido</a><a className="secondary" href="/agenda">Agenda</a></nav></div>
  {error&&<div className="panel"><strong>Dashboard indisponível</strong><p>{error}</p></div>}
  <div className="stats">
   <StatCard label="Clientes ativos" value={legacy?String(legacy.clientsActive):"—"} detail="clientes ativos no BeepStart"/>
   <StatCard label="Vendas hoje" value={legacy?money(legacy.salesToday):"—"} detail={legacy?legacy.salesTodayCount+" venda(s) hoje · BeepStart":"aguardando dados"}/>
   <StatCard label="Produtos ativos" value={data?String(data.products):"—"} detail={data?String(data.integratedProducts||0)+" integrado(s) do BeepStart":"catálogo atual"}/>
   <StatCard label="A receber" value={legacy?money(legacy.receivable):"—"} detail="saldo em aberto no BeepStart"/>
  </div>
  {legacy&&<div className="panel" style={{marginBottom:16}}>
   <div className="panel-heading"><div><span className="eyebrow">HISTÓRICO BEEPSTART</span><h2>Resumo financeiro 2026</h2><p>Visão histórica separada dos indicadores operacionais de hoje.</p></div><a href="/migracao">Abrir migração</a></div>
   <div className="stats">
    <StatCard label="Faturamento 2026" value={money(legacy.billing)} detail={legacy.salesCount+" vendas no legado"}/>
    <StatCard label="Recebido 2026" value={money(legacy.received)} detail="entradas registradas no período"/>
    <StatCard label="A receber" value={money(legacy.receivable)} detail="saldo histórico estimado"/>
    <StatCard label="A pagar" value={money(legacy.payable)} detail="saldo histórico estimado"/>
   </div>
   <div className="table" style={{marginTop:14}}><div className="row header"><span>Mês</span><span>Vendas</span><span>Faturamento</span><span>Recebido</span><span>A receber</span></div>{legacy.months.map(m=><div className="row" key={m.month}><strong>{m.month}</strong><span>{m.sales}</span><span>{money(m.billing)}</span><span>{money(m.received)}</span><span>{money(m.receivable)}</span></div>)}</div>
  </div>}
  <div className="grid-two">
   <div className="panel"><div className="panel-heading"><div><h2>Pedidos em andamento</h2><p>Operações que ainda exigem acompanhamento.</p></div><a href="/pedidos">Ver todos</a></div><div className="table"><div className="row header"><span>Pedido</span><span>Cliente</span><span>Status</span><span>Entrega</span><span>Total</span></div>{data?.recentOrders?.length?data.recentOrders.map(o=><div className="row" key={o.id}><strong>#{o.number}</strong><span>{o.customer?.name||"—"}</span><span>{statusLabel(o.status)}</span><span>{o.dueDate?new Date(o.dueDate).toLocaleDateString("pt-BR"):"—"}</span><strong>{money(o.total)}</strong></div>):<div className="row"><span>—</span><span>Nenhum pedido em andamento</span><span>—</span><span>—</span><strong>—</strong></div>}</div></div>
   <div className="panel"><div className="panel-heading"><div><h2>Fluxo do laboratório</h2><p>Acompanhamento da produção óptica.</p></div><a href="/laboratorio">Abrir laboratório</a></div><div className="funnel">{Object.entries(data?.laboratory||{}).map(([s,c])=><div key={s}><span>{statusLabel(s)}</span><strong>{c}</strong></div>)}{!Object.keys(data?.laboratory||{}).length&&<div><span>Nenhum pedido no laboratório</span><strong>0</strong></div>}</div></div>
  </div>
  <div className="grid-two">
   <div className="panel"><div className="panel-heading"><div><h2>Agenda de hoje</h2><p>Próximos atendimentos registrados.</p></div><a href="/agenda">Ver agenda</a></div><div className="funnel">{data?.appointments?.length?data.appointments.map(a=><div key={a.id}><span><b>{new Date(a.scheduledAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</b> · {a.customer?.name||"Cliente"}<small> · {a.type} · {a.professionalName}</small></span><strong>Hoje</strong></div>):<div><span>Nenhum atendimento agendado para hoje</span><strong>0</strong></div>}</div></div>
   <div className="panel"><div className="panel-heading"><div><h2>Alertas operacionais</h2><p>Pontos que merecem atenção imediata.</p></div></div><div className="funnel"><div><span>Estoque abaixo do mínimo</span><strong>{data?.lowStock??"—"}</strong></div><div><span>Produtos sem estoque</span><strong>{data?.zeroStock??"—"}</strong></div><div><span>Contas vencidas</span><strong>{data?.overdue??"—"}</strong></div><div><span>Caixa</span><strong>{data?data.cashOpen?money(data.cashBalance):"Fechado":"—"}</strong></div></div></div>
  </div>
  <div className="panel"><div className="panel-heading"><div><h2>Integração de produtos</h2><p>O catálogo do MB Óptica recebe somente os produtos selecionados do estoque BeepStart.</p></div><a href="/migracao">Gerenciar integração</a></div><div className="funnel"><div><span>Produtos ativos no MB Óptica</span><strong>{data?.products??"—"}</strong></div><div><span>Produtos integrados do BeepStart</span><strong>{data?.integratedProducts??"—"}</strong></div></div></div>
  <div className="panel"><div className="panel-heading"><div><h2>Integridade do sistema</h2><p>Dados estruturados, rastreabilidade e migração segura.</p></div></div><div className="principles"><div><b>Dados estruturados</b><span>Receitas, pedidos, estoque e financeiro possuem entidades próprias.</span></div><div><b>Rastreabilidade</b><span>Eventos, auditoria e lotes registram operações relevantes.</span></div><div><b>Migração segura</b><span>O legado BeepStart permanece preservado e separado do modelo novo.</span></div></div></div>
 </section>;
}