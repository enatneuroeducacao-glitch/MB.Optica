"use client";
import {useEffect,useState} from "react";
import {useRealtimeRefresh} from "@/lib/use-realtime-refresh";
import {StatCard} from "@/components/StatCard";
import {money} from "@/lib/domain";

type DashboardData={customers:number;products:number;integratedProducts:number;orders:number;receivables:number;payables:number;salesToday:number;receivedToday:number;cashBalance:number;cashOpen:boolean;lowStock:number;zeroStock:number;overdue:number;appointmentsToday:number;appointments:{id:string;scheduledAt:string;type:string;professionalName:string;customer:{name:string}}[];recentOrders:{id:string;number:number;status:string;dueDate:string|null;total:number;customer:{name:string}}[];laboratory:Record<string,number>};
type EconomicAlert={severity:"CRITICO"|"ATENCAO"|"INFORMATIVO";title:string;detail:string};
type ManagementIndicators={
 faturamento:{total:number;vendas:number;ticketMedio:number;hoje:number;mesAnterior:number;variacaoPercentual:number|null};
 margem:{custo:number;margemBruta:number;margemBrutaPercentual:number;margemMesAnterior:number};
 estoque:{produtosAtivos:number;estoqueBaixo:number;estoqueZero:number;estoqueNegativo:number;valorCusto:number;valorVenda:number;itensCriticos:{id:string;code:string;description:string;quantity:number;minimumStock:number;cost:number;salePrice:number;stockCost:number;stockRetail:number;supplierId:string|null}[]};
 contas:{receber:number;pagar:number;capitalDeGiro:number;receberVencido:number;pagarVencido:number;titulosVencidos:number};
 caixa:{aberto:boolean;sessoesAbertas:number;saldo:number};
 fornecedores:{ativos:number;comProdutos:number;maioresCompromissos:{id:string;name:string;products:number;payable:number}[]};
 vendas:{total:number;canceladasExcluidas:boolean;vendedoresComVenda:number};
 alertas:{severity:"CRITICO"|"ATENCAO"|"INFORMATIVO";indicator:string;message:string}[];
 generatedAt:string;
};
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
 const [data,setData]=useState<DashboardData|null>(null); const [management,setManagement]=useState<ManagementIndicators|null>(null); const [error,setError]=useState(""); const [health,setHealth]=useState<EconomicHealth|null>(null); const [healthLoading,setHealthLoading]=useState(false);
 const load=async()=>{try{const r=await fetch("/api/dashboard",{cache:"no-store"});if(!r.ok)throw new Error("Não foi possível carregar o dashboard");setData(await r.json());setError("")}catch(e){setError(e instanceof Error?e.message:"Erro ao carregar dashboard")}};
 const loadManagement=async()=>{try{const r=await fetch("/api/gestao/indicadores",{cache:"no-store"});if(r.ok)setManagement(await r.json())}catch{}};
 const generateEconomicHealth=async()=>{setHealthLoading(true);try{const r=await fetch("/api/dashboard/economic-health",{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Não foi possível gerar o relatório.");setHealth(d)}catch(e){setError(e instanceof Error?e.message:"Erro ao gerar relatório.")}finally{setHealthLoading(false)}};


 useEffect(()=>{load();loadManagement()},[]);
 useRealtimeRefresh(()=>{load();loadManagement()},15000);
 return <section className="page">
  <div className="page-heading dashboard-header"><div><span className="eyebrow">MB ÓPTICA</span><h1>Centro de controle</h1><p>Visão operacional atualizada a partir do banco de dados.</p></div><nav className="dashboard-actions"><a className="primary" href="/vendas">+ Nova venda</a><a className="secondary" href="/clientes">+ Novo cliente</a><a className="secondary" href="/pedidos">+ Novo pedido</a><a className="secondary" href="/agenda">Agenda</a><button className="secondary" onClick={generateEconomicHealth} disabled={healthLoading}>{healthLoading?"Gerando...":"Saúde econômica"}</button></nav></div>
  {error&&<div className="panel"><strong>Dashboard indisponível</strong><p>{error}</p></div>}
  {management&&<div className="panel" style={{marginBottom:16}}>
   <div className="panel-heading"><div><span className="eyebrow">GESTÃO INTELIGENTE</span><h2>Resumo gerencial</h2><p>Somente os indicadores essenciais para a primeira tela. Análises detalhadas ficam em Relatórios.</p></div><div style={{display:"flex",gap:8,alignItems:"center"}}><span className="version-badge">Atualizado {new Date(management.generatedAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</span><a className="secondary" href="/relatorios">Ver relatórios</a></div></div>
   <div className="stats">
    <StatCard label="Faturamento do mês" value={money(management.faturamento.total)} detail={management.faturamento.variacaoPercentual===null?"sem comparação":(management.faturamento.variacaoPercentual>=0?"+":"")+management.faturamento.variacaoPercentual.toLocaleString("pt-BR",{maximumFractionDigits:1})+"% vs. mês anterior"}/>
    <StatCard label="Margem bruta" value={management.margem.margemBrutaPercentual.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})+"%"} detail={money(management.margem.margemBruta)}/>
    <StatCard label="A receber" value={money(management.contas.receber)} detail={money(management.contas.receberVencido)+" vencido"}/>
    <StatCard label="A pagar" value={money(management.contas.pagar)} detail={money(management.contas.pagarVencido)+" vencido"}/>
    <StatCard label="Estoque a custo" value={money(management.estoque.valorCusto)} detail={management.estoque.estoqueBaixo+" baixo · "+management.estoque.estoqueZero+" zerado"}/>
    <StatCard label="Capital de giro" value={money(management.contas.capitalDeGiro)} detail="a receber − a pagar"/>
   </div>
   <div className="grid-two" style={{marginTop:14}}>
    <div className="panel" style={{margin:0}}><div className="panel-heading"><div><h3>Alertas gerenciais</h3><p>Prioridades do motor central.</p></div></div><div className="funnel">{management.alertas.length?management.alertas.slice(0,5).map((a,i)=><div key={i}><span><b>{a.severity==="CRITICO"?"CRÍTICO":a.severity==="ATENCAO"?"ATENÇÃO":"INFO"}</b> · {a.message}</span><strong>{a.indicator}</strong></div>):<div><span>Nenhum alerta gerencial</span><strong>OK</strong></div>}</div></div>
    <div className="panel" style={{margin:0}}><div className="panel-heading"><div><h3>Caixa e período</h3><p>Resumo financeiro imediato.</p></div><a href="/financeiro">Abrir financeiro</a></div><div className="funnel"><div><span>Faturamento hoje</span><strong>{money(management.faturamento.hoje)}</strong></div><div><span>Faturamento mês anterior</span><strong>{money(management.faturamento.mesAnterior)}</strong></div><div><span>Caixa</span><strong>{management.caixa.aberto?money(management.caixa.saldo):"Fechado"}</strong></div><div><span>Títulos vencidos</span><strong>{management.contas.titulosVencidos}</strong></div></div></div>
   </div>
  </div>
  <div className="grid-two">
   <div className="panel"><div className="panel-heading"><div><h2>Pedidos em andamento</h2><p>Operações que ainda exigem acompanhamento.</p></div><a href="/pedidos">Ver todos</a></div><div className="table"><div className="row header"><span>Pedido</span><span>Cliente</span><span>Status</span><span>Entrega</span><span>Total</span></div>{data?.recentOrders?.length?data.recentOrders.map(o=><div className="row" key={o.id}><strong>#{o.number}</strong><span>{o.customer?.name||"—"}</span><span>{statusLabel(o.status)}</span><span>{o.dueDate?new Date(o.dueDate).toLocaleDateString("pt-BR"):"—"}</span><strong>{money(o.total)}</strong></div>):<div className="row"><span>—</span><span>Nenhum pedido em andamento</span><span>—</span><span>—</span><strong>—</strong></div>}</div></div>
   <div className="panel"><div className="panel-heading"><div><h2>Fluxo do laboratório</h2><p>Acompanhamento da produção óptica.</p></div><a href="/laboratorio">Abrir laboratório</a></div><div className="funnel">{Object.entries(data?.laboratory||{}).map(([s,c])=><div key={s}><span>{statusLabel(s)}</span><strong>{c}</strong></div>)}{!Object.keys(data?.laboratory||{}).length&&<div><span>Nenhum pedido no laboratório</span><strong>0</strong></div>}</div></div>
  </div>
  <div className="grid-two">
   <div className="panel"><div className="panel-heading"><div><h2>Agenda de hoje</h2><p>Próximos atendimentos registrados.</p></div><a href="/agenda">Ver agenda</a></div><div className="funnel">{data?.appointments?.length?data.appointments.map(a=><div key={a.id}><span><b>{new Date(a.scheduledAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</b> · {a.customer?.name||"Cliente"}<small> · {a.type} · {a.professionalName}</small></span><strong>Hoje</strong></div>):<div><span>Nenhum atendimento agendado para hoje</span><strong>0</strong></div>}</div></div>
   <div className="panel"><div className="panel-heading"><div><h2>Alertas operacionais</h2><p>Pontos que merecem atenção imediata.</p></div></div><div className="funnel"><div><span>Estoque abaixo do mínimo</span><strong>{data?.lowStock??"—"}</strong></div><div><span>Produtos sem estoque</span><strong>{data?.zeroStock??"—"}</strong></div><div><span>Contas vencidas</span><strong>{data?.overdue??"—"}</strong></div><div><span>Caixa</span><strong>{data?data.cashOpen?money(data.cashBalance):"Fechado":"—"}</strong></div></div></div>
  </div>
  <div className="panel"><div className="panel-heading"><div><h2>Integridade do sistema</h2><p>Dados estruturados, rastreabilidade e migração segura.</p></div></div><div className="principles"><div><b>Dados estruturados</b><span>Receitas, pedidos, estoque e financeiro possuem entidades próprias.</span></div><div><b>Rastreabilidade</b><span>Eventos, auditoria e lotes registram operações relevantes.</span></div><div><b>Migração segura</b><span>O legado BeepStart permanece preservado e separado do modelo novo.</span></div></div></div>
 </section>;
}