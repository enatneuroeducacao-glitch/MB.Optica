"use client";
import {useEffect,useState} from "react";
import {useRealtimeRefresh} from "@/lib/use-realtime-refresh";
import {StatCard} from "@/components/StatCard";
import {money} from "@/lib/domain";

type DashboardData={customers:number;products:number;integratedProducts:number;orders:number;receivables:number;payables:number;salesToday:number;receivedToday:number;cashBalance:number;cashOpen:boolean;lowStock:number;zeroStock:number;overdue:number;appointmentsToday:number;appointments:{id:string;scheduledAt:string;type:string;professionalName:string;customer:{name:string}}[];recentOrders:{id:string;number:number;status:string;dueDate:string|null;total:number;customer:{name:string}}[];laboratory:Record<string,number>};
type LegacyFinancial={billing:number;received:number;receivable:number;payable:number;salesCount:number;clientsActive:number;salesToday:number;salesTodayCount:number;months:{month:string;sales:number;billing:number;received:number;receivable:number}[]};
type EconomicAlert={severity:"CRITICO"|"ATENCAO"|"INFORMATIVO";title:string;detail:string};
type EconomicHealth={
 alerts:EconomicAlert[];
 operational:{cashBalance:number;cashOpen:boolean;receivable:number;payable:number;netWorkingCapital:number;overdue:number;todaySales:number;activeProducts:number;lowStock:number;zeroStock:number};
 historical:{billing:number;received:number;receivable:number;payable:number;netWorkingCapital:number;salesCount:number;activeMonths:number;averageMonthlyBilling:number;collectionRate:number|null;top3Share:number;months:{month:number;sales:number;billing:number;received:number}[]};
 positives:string[];
 attention:string[];
 methodology:string[];
 generatedAt:string;
};
const statusLabel=(s:string)=>({AGUARDANDO_LABORATORIO:"Aguardando laboratório",EM_PRODUCAO:"Em produção",RECEBIDO:"Recebido",CONFERENCIA:"Conferência",RETORNO_GARANTIA:"Retorno em garantia",PRONTO:"Pronto"} as Record<string,string>)[s]||s;

export default function Dashboard(){
 const [data,setData]=useState<DashboardData|null>(null); const [legacy,setLegacy]=useState<LegacyFinancial|null>(null); const [error,setError]=useState(""); const [health,setHealth]=useState<EconomicHealth|null>(null); const [healthLoading,setHealthLoading]=useState(false);
 const load=async()=>{try{const r=await fetch("/api/dashboard",{cache:"no-store"});if(!r.ok)throw new Error("Não foi possível carregar o dashboard");setData(await r.json());setError("")}catch(e){setError(e instanceof Error?e.message:"Erro ao carregar dashboard")}};
 const loadLegacy=async()=>{try{const r=await fetch("/api/migration/financial-summary",{cache:"no-store"});if(r.ok)setLegacy(await r.json())}catch{}};
 const generateEconomicHealth=async()=>{setHealthLoading(true);try{const r=await fetch("/api/dashboard/economic-health",{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Não foi possível gerar o relatório.");setHealth(d)}catch(e){setError(e instanceof Error?e.message:"Erro ao gerar relatório.")}finally{setHealthLoading(false)}};


 useEffect(()=>{load();loadLegacy()},[]);
 useRealtimeRefresh(load,15000);
 return <section className="page">
  <div className="page-heading dashboard-header"><div><span className="eyebrow">MB ÓPTICA</span><h1>Centro de controle</h1><p>Visão operacional atualizada a partir do banco de dados.</p></div><nav className="dashboard-actions"><a className="primary" href="/vendas">+ Nova venda</a><a className="secondary" href="/clientes">+ Novo cliente</a><a className="secondary" href="/pedidos">+ Novo pedido</a><a className="secondary" href="/agenda">Agenda</a><button className="secondary" onClick={generateEconomicHealth} disabled={healthLoading}>{healthLoading?"Gerando...":"Saúde econômica"}</button></nav></div>
  {error&&<div className="panel"><strong>Dashboard indisponível</strong><p>{error}</p></div>}
  <div className="stats">
   <StatCard label="Clientes ativos" value={legacy?String(legacy.clientsActive):"—"} detail="clientes ativos no BeepStart"/>
   <StatCard label="Vendas hoje" value={legacy?money(legacy.salesToday):"—"} detail={legacy?legacy.salesTodayCount+" venda(s) hoje · BeepStart":"aguardando dados"}/>
   <StatCard label="Produtos ativos" value={data?String(data.products):"—"} detail={data?String(data.integratedProducts||0)+" integrado(s) do BeepStart":"catálogo atual"}/>
   <StatCard label="A receber" value={legacy?money(legacy.receivable):"—"} detail="saldo em aberto no BeepStart"/>
  </div>
  {legacy&&(()=>{const monthWithSales=[...legacy.months].reverse().find(m=>m.sales>0)||legacy.months[legacy.months.length-1];const ticket=monthWithSales?.sales?Number(monthWithSales.billing)/Number(monthWithSales.sales):0;const target=Math.max(0,Number(monthWithSales?.billing||0));return <div className="panel" style={{marginBottom:16}}>
   <div className="panel-heading"><div><span className="eyebrow">HISTÓRICO BEEPSTART</span><h2>Resumo financeiro 2026</h2><p>Visão histórica separada dos indicadores operacionais de hoje.</p></div><a href="/migracao">Abrir migração</a></div>
   <div className="stats">
    <StatCard label="Faturamento 2026" value={money(legacy.billing)} detail={legacy.salesCount+" vendas no legado"}/>
    <StatCard label="Recebido 2026" value={money(legacy.received)} detail="entradas registradas no período"/>
    <StatCard label={"Ticket médio · "+(monthWithSales?.month||"mês")} value={money(ticket)} detail={monthWithSales?.sales+" venda(s) no último mês com movimento"}/>
    <StatCard label="Meta mínima próximo mês" value={money(target)} detail="piso igual ao faturamento do último mês com movimento"/>
   </div>
   <div className="table" style={{marginTop:14}}><div className="row header"><span>Mês</span><span>Vendas</span><span>Faturamento</span><span>Recebido</span></div>{legacy.months.map(m=><div className="row" key={m.month}><strong>{m.month}</strong><span>{m.sales}</span><span>{money(m.billing)}</span><span>{money(m.received)}</span></div>)}</div>
  </div>})()}
  {health&&<div className="panel" style={{marginBottom:16}} id="relatorio-saude-economica">
   <div className="panel-heading"><div><span className="eyebrow">RELATÓRIO GERENCIAL</span><h2>Saúde econômica do negócio</h2><p>Leitura automática dos dados disponíveis, sem substituir uma análise contábil.</p></div><div style={{display:"flex",gap:8}}><button className="secondary" onClick={generateEconomicHealth}>Atualizar relatório</button><button className="secondary" onClick={()=>window.print()}>Imprimir</button></div></div>
   <div className="stats">
    <StatCard label="Caixa operacional" value={health.operational.cashOpen?money(health.operational.cashBalance):"Fechado"} detail={health.operational.cashOpen?"saldo das sessões abertas":"nenhuma sessão aberta"}/>
    <StatCard label="Capital de giro operacional" value={money(health.operational.netWorkingCapital)} detail="a receber menos a pagar"/>
    <StatCard label="Recebimentos 2026" value={money(health.historical.received)} detail={health.historical.collectionRate===null?"sem base de faturamento":health.historical.collectionRate.toLocaleString("pt-BR",{maximumFractionDigits:1})+"% do faturamento histórico"}/>
    <StatCard label="Atenção em estoque" value={String(health.operational.lowStock)} detail={health.operational.zeroStock+" produto(s) sem estoque"}/>
   </div>
   <div className="grid-two" style={{marginTop:14}}>
    <div className="panel" style={{margin:0,border:"1px solid #d9eee8"}}><div className="panel-heading"><div><h3>Pontos favoráveis observados</h3><p>Fatos derivados dos dados disponíveis.</p></div></div><div className="funnel">{health.positives.map((item,i)=><div key={i}><span>✓ {item}</span></div>)}</div></div>
    <div className="panel" style={{margin:0,border:"1px solid #f0dfc7"}}><div className="panel-heading"><div><h3>Pontos de atenção</h3><p>Itens que merecem acompanhamento gerencial.</p></div></div><div className="funnel">{health.attention.map((item,i)=><div key={i}><span>• {item}</span></div>)}</div></div>
   </div>
   <div className="panel" style={{marginTop:14,margin:0}}><div className="panel-heading"><div><h3>Alertas necessários</h3><p>Prioridades gerenciais geradas automaticamente pelos indicadores disponíveis.</p></div></div><div className="funnel">{health.alerts.map((alert,i)=><div key={i}><span><b>{alert.severity==="CRITICO"?"CRÍTICO":alert.severity==="ATENCAO"?"ATENÇÃO":"INFORMATIVO"}</b> · {alert.title}<small> · {alert.detail}</small></span></div>)}</div></div>
   <div className="table" style={{marginTop:14}}><div className="row header"><span>Indicador</span><span>Operacional atual</span><span>Histórico 2026</span><span>Leitura</span></div>
    <div className="row"><strong>A receber</strong><span>{money(health.operational.receivable)}</span><span>{money(health.historical.receivable)}</span><span>Valores em aberto</span></div>
    <div className="row"><strong>A pagar</strong><span>{money(health.operational.payable)}</span><span>{money(health.historical.payable)}</span><span>Compromissos em aberto</span></div>
    <div className="row"><strong>Faturamento</strong><span>{money(health.operational.todaySales)} hoje</span><span>{money(health.historical.billing)}</span><span>{health.historical.salesCount.toLocaleString("pt-BR")} vendas históricas</span></div>
    <div className="row"><strong>Concentração</strong><span>—</span><span>{health.historical.top3Share.toLocaleString("pt-BR",{maximumFractionDigits:1})}% nos 3 maiores meses</span><span>Acompanhar sazonalidade</span></div>
   </div>
   <div style={{marginTop:12,padding:12,borderRadius:10,background:"#f7f9fb",fontSize:12,color:"var(--muted)"}}><b>Metodologia:</b> {health.methodology.join(" ")}</div>
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