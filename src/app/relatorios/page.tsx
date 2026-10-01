"use client";
import {useEffect,useState} from "react";
const n=(v:any)=>Number(v||0);
const money=(v:any)=>n(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const tabs=["VISÃO","SAÚDE DO FATURAMENTO","FATURAMENTO","MARGEM","VENDAS","ESTOQUE","PEDIDOS","FINANCEIRO","CLIENTES","ORÇAMENTOS","PRESCRIÇÕES","AGENDA","FISCAL","AUDITORIA","INCONSISTÊNCIAS"];
const Card=({t,v,d}:{t:string;v:any;d?:string})=><div className="report-card"><span>{t}</span><strong>{v}</strong>{d&&<small>{d}</small>}</div>;
export default function Relatorios(){
 const[d,setD]=useState<any>(null);const[legacy,setLegacy]=useState<any>(null);const[management,setManagement]=useState<any>(null);const[tab,setTab]=useState("VISÃO");const[q,setQ]=useState("");
 useEffect(()=>{fetch("/api/migration/financial-summary",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(setLegacy).catch(()=>{})},[]);
 useEffect(()=>{fetch("/api/relatorios",{cache:"no-store"}).then(r=>r.json()).then(setD)},[]);
 useEffect(()=>{fetch("/api/gestao/indicadores",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(setManagement).catch(()=>{})},[]);
 if(!d)return <section className="page"><div className="panel"><div className="panel-heading"><div><h2>Gerando relatórios...</h2><p>Consolidando todos os módulos.</p></div></div></div></section>;
 const s=d.summary,inc=d.inconsistencies||[];
 const download=()=>{const b=new Blob([JSON.stringify(d,null,2)],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download="mb-optica-relatorios.json";a.click();URL.revokeObjectURL(u)};
 const row=(a:any,b:any,c:any="",e:any="")=><div className="report-row"><span>{a}</span><span>{b}</span><span>{c}</span><strong>{e}</strong></div>;
 return <section className="page reports-page">
 <div className="page-heading"><div><span className="eyebrow">GESTÃO INTELIGENTE</span><h1>Relatórios</h1><p>Informações completas do sistema, desempenho, rastreabilidade e integridade.</p></div><div className="report-actions"><button className="secondary" onClick={()=>window.print()}>🖨 Imprimir</button><button className="primary" onClick={download}>⇩ Exportar</button></div></div>
 {inc.length?<div className="report-alert"><div><b>⚠ {inc.length} inconsistência(s)</b><span>Existem registros que precisam de conferência.</span></div><button className="secondary" onClick={()=>setTab("INCONSISTÊNCIAS")}>Ver alertas</button></div>:<div className="report-ok">✓ Nenhuma inconsistência automática encontrada.</div>}
 <div className="report-tabs">{tabs.map(x=><button key={x} className={tab===x?"active":""} onClick={()=>setTab(x)}>{x}</button>)}</div>
 {tab==="VISÃO"&&<><div className="report-kpis"><Card t="Vendas" v={s.sales}/><Card t="Faturamento" v={money(s.saleTotal)}/><Card t="Margem bruta" v={money(s.grossMargin)}/><Card t="A receber" v={money(s.receivable)}/><Card t="A pagar" v={money(s.payable)}/><Card t="Estoque baixo" v={s.lowStock}/><Card t="Pedidos" v={s.orders}/><Card t="Alertas" v={s.inconsistencies}/></div><div className="report-grid-2"><div className="panel"><div className="panel-heading"><div><h2>Evolução mensal</h2><p>Vendas e recebimentos dos últimos 12 meses.</p></div></div><div className="report-table"><div className="report-row head"><span>Mês</span><span>Vendas</span><span>Faturamento</span><span>Recebido</span></div>{d.sales.monthly.map((x:any)=>row(x.month,x.sales,"",money(x.total)))}</div></div><div className="panel"><div className="panel-heading"><div><h2>Resumo operacional</h2></div></div><div className="report-metrics"><div><b>{s.activeCustomers}</b><span>clientes ativos</span></div><div><b>{s.zeroStock}</b><span>produtos zerados</span></div><div><b>{d.quotes.open}</b><span>orçamentos abertos</span></div><div><b>{d.appointments.today}</b><span>agendamentos hoje</span></div><div><b>{d.fiscal.rejected}</b><span>fiscais rejeitados</span></div><div><b>{s.auditEvents}</b><span>eventos auditados</span></div></div></div></div></>}
 {tab==="SAÚDE DO FATURAMENTO"&&(()=>{
   const faturamento=n(s.saleTotal), recebido=n(s.received), aReceber=n(s.receivable), aPagar=n(s.payable), custo=n(s.saleCost), margem=n(s.grossMargin);
   const taxaReceb=faturamento>0?recebido/faturamento:0;
   const margemPct=faturamento>0?margem/faturamento:0;
   const pontos:any[]=[];
   const add=(nivel:string,item:string,evidencia:string,acao:string)=>pontos.push({nivel,item,evidencia,acao});
   if(faturamento<=0)add("ATENÇÃO","Não há faturamento operacional no MB Óptica","O histórico operacional atual do MB ainda não apresenta vendas faturadas.","Acompanhar as vendas novas diariamente e manter o histórico BeepStart separado até a transição estar consolidada.");
   if(aReceber>0&&faturamento>0&&aReceber/faturamento>=0.25)add("ATENÇÃO","Saldo a receber elevado em relação ao faturamento","O saldo a receber representa "+(aReceber/faturamento*100).toFixed(1)+"% do faturamento operacional acumulado.","Priorizar cobrança dos títulos vencidos e acompanhar os próximos vencimentos.");
   if(aPagar>0&&faturamento>0&&aPagar/faturamento>=0.25)add("ATENÇÃO","Compromissos a pagar relevantes","O saldo a pagar representa "+(aPagar/faturamento*100).toFixed(1)+"% do faturamento operacional acumulado.","Revisar vencimentos, fluxo de caixa e programação de pagamentos.");
   if(faturamento>0&&taxaReceb<0.7)add("ATENÇÃO","Conversão de faturamento em recebimento","Apenas "+(taxaReceb*100).toFixed(1)+"% do faturamento operacional acumulado aparece como recebido nos dados atuais.","Separar claramente vendas faturadas, recebimentos e contas a receber para acompanhar a conversão de caixa.");
   if(faturamento>0&&margemPct<0.25)add("ATENÇÃO","Margem bruta merece acompanhamento","A margem bruta calculada está em "+(margemPct*100).toFixed(1)+"% do faturamento.","Revisar custos dos produtos, descontos e preços de venda.");
   if(s.lowStock>0)add("ATENÇÃO","Estoque abaixo do mínimo","Há "+s.lowStock+" produto(s) abaixo do estoque mínimo.","Revisar reposição dos itens com maior giro antes de perder vendas.");
   if(s.zeroStock>0)add("ATENÇÃO","Produtos sem estoque","Há "+s.zeroStock+" produto(s) zerado(s).","Verificar se algum item de venda recorrente precisa de reposição.");
   if(d.quotes.expired>0)add("ATENÇÃO","Orçamentos vencidos","Há "+d.quotes.expired+" orçamento(s) aberto(s) e vencido(s).","Entrar em contato com os clientes e atualizar o status dos orçamentos.");
   if(d.fiscal.rejected>0)add("ATENÇÃO","Documentos fiscais rejeitados","Há "+d.fiscal.rejected+" documento(s) fiscal(is) rejeitado(s).","Corrigir as rejeições antes de considerar o faturamento fiscal plenamente conciliado.");
   if(d.inconsistencies>0)add("ATENÇÃO","Inconsistências de dados","O sistema encontrou "+d.inconsistencies+" alerta(s) automático(s).","Abrir a Central de integridade e corrigir os registros antes de fechar análises.");
   if(legacy?.ok){
     if(legacy.receivable>0)add("ACOMPANHAR","Contas a receber do legado BeepStart","O histórico BeepStart possui "+money(legacy.receivable)+" ainda em aberto.","Acompanhar essas contas no cadastro dos clientes e migrá-las seletivamente, sem duplicar vendas.");
     if(legacy.billing>0)add("ACOMPANHAR","Faturamento histórico ainda está no BeepStart","O BeepStart registra "+money(legacy.billing)+" de faturamento em 2026, separado do faturamento operacional do MB.","Usar o bloco histórico como referência até a transição financeira ser concluída.");
   }
   if(!pontos.length)add("ACOMPANHAR","Nenhum ponto crítico identificado automaticamente","Os indicadores disponíveis não acionaram os critérios de atenção configurados.","Continuar o acompanhamento periódico e revisar os indicadores ao longo do mês.");
   return <div className="panel full">
    <div className="panel-heading"><div><span className="eyebrow">ANÁLISE AUTOMÁTICA</span><h2>Saúde do faturamento</h2><p>Relatório interpretativo com evidências e pontos que merecem acompanhamento.</p></div><div className="report-actions"><button className="secondary" onClick={()=>window.print()}>🖨 Imprimir relatório</button></div></div>
    <div className="report-kpis compact"><Card t="Faturamento MB" v={money(faturamento)} d="vendas operacionais"/><Card t="Recebido MB" v={money(recebido)} d={faturamento?((taxaReceb*100).toFixed(1)+"% do faturamento"):"sem base"}/><Card t="A receber MB" v={money(aReceber)}/><Card t="A pagar MB" v={money(aPagar)}/><Card t="Margem bruta" v={money(margem)} d={faturamento?(margemPct*100).toFixed(1)+"% do faturamento":"sem base"}/></div>
    <div className="panel" style={{marginTop:16}}><div className="panel-heading"><div><h2>Pontos que merecem atenção</h2><p>O sistema mostra o indicador, a evidência encontrada e uma abordagem sugerida.</p></div><span className="alert-badge">{pontos.length} ponto(s)</span></div>
      <div className="report-table"><div className="report-row head"><span>Nível</span><span>Item</span><span>Evidência</span><span>Abordagem sugerida</span></div>{pontos.map((p,i)=><div className="report-row" key={i}><strong>{p.nivel}</strong><span><b>{p.item}</b></span><span>{p.evidencia}</span><span>{p.acao}</span></div>)}</div>
    </div>
    {legacy?.ok&&<div className="report-grid-2" style={{marginTop:16}}><div className="panel"><div className="panel-heading"><div><h2>Histórico BeepStart</h2><p>Base histórica separada do operacional atual.</p></div></div><div className="report-metrics"><div><b>{money(legacy.billing)}</b><span>faturamento 2026</span></div><div><b>{money(legacy.received)}</b><span>recebido 2026</span></div><div><b>{money(legacy.receivable)}</b><span>a receber</span></div><div><b>{legacy.salesCount}</b><span>vendas históricas</span></div></div></div><div className="panel"><div className="panel-heading"><div><h2>Leitura gerencial</h2><p>Como interpretar o relatório.</p></div></div><p style={{lineHeight:1.7,fontSize:13}}>O relatório não classifica a empresa por uma nota única. Ele identifica relações entre faturamento, recebimento, contas a receber, contas a pagar, margem, estoque, orçamentos e integridade dos dados. Cada alerta deve ser analisado junto com sua evidência antes de qualquer decisão.</p></div></div>}
   </div>;
 })()}
 {tab==="FATURAMENTO"&&(()=>{ 
   const monthly=(d.sales?.monthly||[]).map((x:any)=>({...x,total:n(x.total),received:n(x.received),sales:n(x.sales)}));
   const current=monthly[monthly.length-1]||{month:"—",sales:0,total:0,received:0};
   const previous=monthly[monthly.length-2]||{month:"—",sales:0,total:0,received:0};
   const variation=previous.total>0?((current.total-previous.total)/previous.total)*100:null;
   const average=monthly.length?monthly.reduce((a:any,x:any)=>a+x.total,0)/monthly.length:0;
   const receivedRate=current.total>0?(current.received/current.total)*100:null;
   const highest=monthly.reduce((a:any,x:any)=>x.total>a.total?x:a,current);
   return <div className="report-grid-2">
    <div className="panel full">
     <div className="panel-heading"><div><span className="eyebrow">FASE 6.4</span><h2>Faturamento</h2><p>Análise do faturamento operacional dos últimos 12 meses, com comparação, recebimento e evolução.</p></div><div className="report-actions"><button className="secondary" onClick={()=>window.print()}>🖨 Imprimir relatório</button></div></div>
     <div className="report-kpis compact">
      <Card t="Faturamento do mês" v={money(current.total)} d={current.sales+" venda(s)"}/>
      <Card t="Mês anterior" v={money(previous.total)} d={previous.sales+" venda(s)"}/>
      <Card t="Variação" v={variation===null?"sem base":((variation>=0?"+":"")+variation.toFixed(1)+"%")} d="comparação com o mês anterior"/>
      <Card t="Recebido no mês" v={money(current.received)} d={receivedRate===null?"sem base":receivedRate.toFixed(1)+"% do faturamento"}/>
      <Card t="Média mensal" v={money(average)} d="últimos 12 meses"/>
      <Card t="Maior faturamento do período" v={money(highest.total)} d={highest.month}/>
     </div>
    </div>
    <div className="panel full">
     <div className="panel-heading"><div><h2>Evolução do faturamento</h2><p>Comparação mês a mês da receita registrada e dos recebimentos associados às vendas.</p></div></div>
     <div className="report-table">
      <div className="report-row head"><span>Mês</span><span>Vendas</span><span>Faturamento</span><span>Recebido</span></div>
      {monthly.map((x:any,i:number)=>{const prev=monthly[i-1];const v=prev?.total>0?((x.total-prev.total)/prev.total)*100:null;return <div className="report-row" key={x.month}><strong>{x.month}</strong><span>{x.sales}</span><span>{money(x.total)}</span><strong>{money(x.received)}{v===null?"": " · "+(v>=0?"+":"")+v.toFixed(1)+"%"}</strong></div>})}
     </div>
    </div>
    <div className="panel">
     <div className="panel-heading"><div><h2>Leitura do período</h2><p>Indicadores derivados da série mensal.</p></div></div>
     <div className="funnel">
      <div><span>Faturamento atual</span><strong>{money(current.total)}</strong></div>
      <div><span>Recebimento associado</span><strong>{money(current.received)}</strong></div>
      <div><span>Ticket médio do mês</span><strong>{money(current.sales?current.total/current.sales:0)}</strong></div>
      <div><span>Participação do mês atual na média</span><strong>{average>0?(current.total/average*100).toFixed(1)+"%":"—"}</strong></div>
     </div>
    </div>
    <div className="panel">
     <div className="panel-heading"><div><h2>Composição das vendas</h2><p>Indicadores disponíveis na base operacional.</p></div></div>
     <div className="report-table">
      <div className="report-row head"><span>Vendedor</span><span></span><span></span><span>Faturamento</span></div>
      {d.sales.bySeller.slice(0,10).map((x:any)=><div className="report-row" key={x.name}><span>{x.name}</span><span></span><span></span><strong>{money(x.total)}</strong></div>)}
     </div>
    </div>
    <div className="panel full">
     <div className="panel-heading"><div><h2>Meios de pagamento</h2><p>Valor registrado por meio de pagamento nas vendas ativas.</p></div></div>
     <div className="report-table">
      <div className="report-row head"><span>Meio</span><span></span><span></span><span>Valor</span></div>
      {d.sales.paymentMethods.map((x:any)=><div className="report-row" key={x.name}><span>{x.name}</span><span></span><span></span><strong>{money(x.value)}</strong></div>)}
     </div>
    </div>
   </div>;
 })()}
 {tab==="MARGEM"&&(()=>{
   const m=management?.margem;
   if(!m)return <div className="panel"><div className="panel-heading"><div><span className="eyebrow">FASE 6.5</span><h2>Margem</h2><p>Carregando os indicadores centrais de margem...</p></div></div></div>;
   const custo=n(m.custo),bruta=n(m.margemBruta),pct=n(m.margemBrutaPercentual),prevPct=n(m.margemMesAnteriorPercentual),pp=n(m.variacaoPontosPercentuais),varPct=m.variacaoPercentual===null?null:n(m.variacaoPercentual),descontos=n(m.descontos),descontoPct=n(m.descontoPercentual);
   const insuficientes=m.produtosInsuficientes||[],abaixoCusto=m.produtosAbaixoDoCusto||[];
   return <div className="report-grid-2">
    <div className="panel full">
     <div className="panel-heading"><div><span className="eyebrow">FASE 6.5</span><h2>Análise de margem</h2><p>Leitura específica de custo, margem bruta, percentual, descontos e comparação temporal usando o motor central de indicadores.</p></div><div className="report-actions"><button className="secondary" onClick={()=>window.print()}>🖨 Imprimir relatório</button></div></div>
     <div className="report-kpis compact">
      <Card t="Custo das vendas" v={money(custo)} d="mês atual"/>
      <Card t="Margem bruta" v={money(bruta)} d="faturamento menos custo"/>
      <Card t="Margem bruta %" v={pct.toFixed(1)+"%"} d="mês atual"/>
      <Card t="Margem mês anterior" v={prevPct.toFixed(1)+"%"} d="comparação temporal"/>
      <Card t="Variação" v={(pp>=0?"+":"")+pp.toFixed(1)+" p.p."} d={varPct===null?"sem base percentual":"variação relativa de "+varPct.toFixed(1)+"%"}/>
      <Card t="Descontos" v={money(descontos)} d={descontoPct.toFixed(1)+"% da venda bruta"}/>
     </div>
    </div>
    <div className="panel">
     <div className="panel-heading"><div><h2>Comparação temporal</h2><p>Margem atual versus mês anterior.</p></div></div>
     <div className="funnel">
      <div><span>Margem atual</span><strong>{pct.toFixed(1)}%</strong></div>
      <div><span>Margem anterior</span><strong>{prevPct.toFixed(1)}%</strong></div>
      <div><span>Variação em pontos percentuais</span><strong>{(pp>=0?"+":"")+pp.toFixed(1)+" p.p."}</strong></div>
      <div><span>Custo atual</span><strong>{money(custo)}</strong></div>
     </div>
    </div>
    <div className="panel">
     <div className="panel-heading"><div><h2>Impacto dos descontos</h2><p>Descontos consolidados pelo motor de indicadores.</p></div></div>
     <div className="funnel">
      <div><span>Desconto aplicado</span><strong>{money(descontos)}</strong></div>
      <div><span>Participação sobre venda bruta</span><strong>{descontoPct.toFixed(1)}%</strong></div>
      <div><span>Desconto mês anterior</span><strong>{money(m.descontoMesAnterior)}</strong></div>
      <div><span>Leitura</span><strong>{descontos>0?"acompanhar efeito sobre margem":"sem desconto registrado"}</strong></div>
     </div>
    </div>
    <div className="panel full">
     <div className="panel-heading"><div><h2>Produtos com margem insuficiente</h2><p>Itens vendidos no mês atual com margem inferior ao limite configurado de 20%.</p></div><span className={insuficientes.length?"alert-badge":"good-badge"}>{insuficientes.length} item(ns)</span></div>
     <div className="report-table">
      <div className="report-row head"><span>Produto</span><span>Qtd.</span><span>Margem</span><span>% Margem</span></div>
      {insuficientes.length?insuficientes.map((x:any)=><div className="report-row" key={x.id}><span>{x.code+" · "+x.description}</span><span>{x.quantity}</span><span>{money(x.margin)}</span><strong>{n(x.marginPercent).toFixed(1)}%</strong></div>):<div className="empty-state">✓ Nenhum produto vendido abaixo do limite configurado.</div>}
     </div>
    </div>
    <div className="panel full">
     <div className="panel-heading"><div><h2>Produtos com preço abaixo do custo</h2><p>Cadastro ativo em que o preço de venda está inferior ao custo informado.</p></div><span className={abaixoCusto.length?"alert-badge":"good-badge"}>{abaixoCusto.length} item(ns)</span></div>
     <div className="report-table">
      <div className="report-row head"><span>Produto</span><span>Custo</span><span>Preço</span><span>Diferença</span></div>
      {abaixoCusto.length?abaixoCusto.map((x:any)=><div className="report-row" key={x.id}><span>{x.code+" · "+x.description}</span><span>{money(x.cost)}</span><span>{money(x.salePrice)}</span><strong>{money(x.difference)}</strong></div>):<div className="empty-state">✓ Nenhum produto ativo com preço abaixo do custo.</div>}
     </div>
    </div>
    <div className="panel full">
     <div className="panel-heading"><div><h2>Leitura gerencial da margem</h2><p>Os dados são derivados do motor central; o relatório apenas organiza a análise.</p></div></div>
     <p style={{lineHeight:1.7,fontSize:13}}>A margem bruta representa o faturamento das vendas ativas menos o custo dos itens vendidos. A comparação temporal mostra a mudança em pontos percentuais em relação ao mês anterior. Os descontos são apresentados separadamente para permitir avaliar seu peso sobre a venda bruta. Produtos abaixo de 20% de margem aparecem para revisão, enquanto produtos com preço cadastrado abaixo do custo são tratados como inconsistência comercial.</p>
    </div>
   </div>;
 })()}
 {tab==="VENDAS"&&<div className="report-grid-2"><div className="panel"><div className="panel-heading"><div><h2>Vendas por vendedor</h2></div></div><div className="report-table">{d.sales.bySeller.map((x:any)=>row(x.name,"","",money(x.total)))}</div></div><div className="panel"><div className="panel-heading"><div><h2>Meios de pagamento</h2></div></div><div className="report-table">{d.sales.paymentMethods.map((x:any)=>row(x.name,"","",money(x.value)))}</div></div><div className="panel full"><div className="panel-heading"><div><h2>Itens com maior faturamento</h2></div></div><div className="report-table">{d.sales.topItems.map((x:any,i:number)=>row("#"+(i+1)+" · "+x.description,"","",money(x.total)))}</div></div></div>}
 {tab==="ESTOQUE"&&<div className="report-grid-2"><div className="panel full"><div className="panel-heading"><div><h2>Posição do estoque</h2><p>Filtre por código ou descrição.</p></div><input className="report-search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Pesquisar produto..." /></div><div className="report-table"><div className="report-row head"><span>Produto</span><span>Qtd.</span><span>Mín.</span><span>Status</span></div>{d.stock.items.filter((x:any)=>!q||x.description.toLowerCase().includes(q.toLowerCase())||x.code.toLowerCase().includes(q.toLowerCase())).slice(0,150).map((x:any)=>row(x.code+" · "+x.description,x.quantity,x.minimum,x.quantity<=0?"ZERADO":x.quantity<=x.minimum?"BAIXO":"OK"))}</div></div></div>}
 {tab==="ESTOQUE"&&(()=>{
   const e=management?.estoque;
   if(!e)return <div className="panel"><div className="panel-heading"><div><span className="eyebrow">FASE 6.6</span><h2>Estoque</h2><p>Carregando os indicadores centrais de estoque...</p></div></div></div>;
   const items=d.stock?.items||[],crit=e.itensCriticos||[],repor=e.reposicaoNecessaria||[],coverage=e.coberturaCritica||[];
   const totalCost=n(e.valorCusto),totalRetail=n(e.valorVenda),marginStock=totalRetail-totalCost;
   const qFilter=(x:any)=>!q||String(x.description||"").toLowerCase().includes(q.toLowerCase())||String(x.code||"").toLowerCase().includes(q.toLowerCase());
   return <div className="report-grid-2">
    <div className="panel full">
     <div className="panel-heading"><div><span className="eyebrow">FASE 6.6</span><h2>Análise de estoque</h2><p>Posição atual, criticidade, valor imobilizado, necessidade de reposição e cobertura estimada.</p></div><div className="report-actions"><button className="secondary" onClick={()=>window.print()}>🖨 Imprimir relatório</button></div></div>
     <div className="report-kpis compact">
      <Card t="Produtos ativos" v={e.produtosAtivos}/><Card t="Estoque baixo" v={e.estoqueBaixo}/><Card t="Estoque zerado" v={e.estoqueZero}/><Card t="Estoque negativo" v={e.estoqueNegativo}/><Card t="Valor a custo" v={money(totalCost)}/><Card t="Valor a venda" v={money(totalRetail)} d={"potencial bruto "+money(marginStock)}/>
     </div>
    </div>
    <div className="panel full">
     <div className="panel-heading"><div><h2>Posição do estoque</h2><p>Consulta por código ou descrição.</p></div><input className="report-search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Pesquisar produto..." /></div>
     <div className="report-table"><div className="report-row head"><span>Produto</span><span>Qtd.</span><span>Mín.</span><span>Status</span></div>
      {items.filter(qFilter).slice(0,150).map((x:any)=><div className="report-row" key={x.id}><span>{x.code+" · "+x.description}</span><span>{x.quantity}</span><span>{x.minimum}</span><strong>{x.quantity<0?"NEGATIVO":x.quantity===0?"ZERADO":x.quantity<=x.minimum?"ABAIXO DO MÍNIMO":"OK"}</strong></div>)}
     </div>
    </div>
    <div className="panel">
     <div className="panel-heading"><div><h2>Necessidade de reposição</h2><p>Quantidade sugerida para retornar ao estoque mínimo cadastrado.</p></div><span className={repor.length?"alert-badge":"good-badge"}>{repor.length} item(ns)</span></div>
     <div className="report-table"><div className="report-row head"><span>Produto</span><span>Atual</span><span>Mín.</span><span>Repor</span></div>
      {repor.length?repor.slice(0,50).map((x:any)=><div className="report-row" key={x.id}><span>{x.code+" · "+x.description}</span><span>{x.quantity}</span><span>{x.minimumStock}</span><strong>{x.reorderQuantity}</strong></div>):<div className="empty-state">✓ Nenhuma reposição necessária pelo critério de estoque mínimo.</div>}
     </div>
    </div>
    <div className="panel">
     <div className="panel-heading"><div><h2>Itens críticos</h2><p>Prioridade: negativos, zerados e abaixo do mínimo.</p></div><span className={crit.length?"alert-badge":"good-badge"}>{crit.length} item(ns)</span></div>
     <div className="report-table"><div className="report-row head"><span>Produto</span><span>Qtd.</span><span>Vendas no mês</span><span>Status</span></div>
      {crit.length?crit.slice(0,50).map((x:any)=><div className="report-row" key={x.id}><span>{x.code+" · "+x.description}</span><span>{x.quantity}</span><span>{x.soldThisMonth}</span><strong>{x.status.replace("_"," ")}</strong></div>):<div className="empty-state">✓ Nenhum item crítico.</div>}
     </div>
    </div>
    <div className="panel full">
     <div className="panel-heading"><div><h2>Cobertura estimada</h2><p>Estimativa baseada nas vendas do mês atual; serve como sinal de acompanhamento, não como previsão definitiva.</p></div></div>
     <div className="report-table"><div className="report-row head"><span>Produto</span><span>Estoque</span><span>Vendido no mês</span><span>Dias estimados</span></div>
      {coverage.length?coverage.slice(0,50).map((x:any)=><div className="report-row" key={x.id}><span>{x.code+" · "+x.description}</span><span>{x.quantity}</span><span>{x.soldThisMonth}</span><strong>{x.estimatedDaysCoverage} dia(s)</strong></div>):<div className="empty-state">Sem vendas no mês para estimar cobertura.</div>}
     </div>
    </div>
    <div className="panel full">
     <div className="panel-heading"><div><h2>Leitura gerencial do estoque</h2><p>Os indicadores são calculados no motor central e apenas organizados nesta visão.</p></div></div>
     <p style={{lineHeight:1.7,fontSize:13}}>O valor a custo representa o capital atualmente imobilizado nos produtos ativos. O valor a venda mostra o potencial bruto de venda do estoque existente. Estoque negativo exige conferência do movimento; estoque zerado pode representar risco de ruptura; estoque abaixo do mínimo indica necessidade de reposição conforme o parâmetro cadastrado. A cobertura estimada usa o ritmo de vendas do mês corrente e deve ser interpretada junto ao histórico e ao comportamento de cada produto.</p>
    </div>
   </div>;
 })()}
 {tab==="PEDIDOS"&&<div className="panel"><div className="panel-heading"><div><h2>Pedidos e laboratório</h2><p>Fluxo por status e pedidos recentes.</p></div></div><div className="report-status-grid">{Object.entries(d.orders.byStatus).map(([k,v]:any)=><div key={k}><span>{k.replaceAll("_"," ")}</span><b>{v}</b></div>)}</div><div className="report-table">{d.orders.recent.slice(0,100).map((x:any)=>row("#"+x.number,x.customer,x.status,x.laboratory||"—"))}</div></div>}
 {tab==="FINANCEIRO"&&<div className="report-grid-2"><div className="panel"><div className="report-kpis compact"><Card t="A receber" v={money(s.receivable)}/><Card t="A pagar" v={money(s.payable)}/><Card t="Recebido" v={money(s.received)}/><Card t="Pago" v={money(s.payablePaid)}/></div></div><div className="panel"><div className="report-kpis compact"><Card t="Saldo de caixa" v={money(s.cashBalance)}/><Card t="Caixas abertos" v={s.openCash}/><Card t="Sessões" v={d.finance.cashSessions.length}/></div></div><div className="panel full"><div className="panel-heading"><div><h2>Liquidações recentes</h2></div></div><div className="report-table">{d.finance.settlements.slice(0,100).map((x:any)=>row(new Date(x.paidAt).toLocaleDateString("pt-BR"),x.account.description,x.account.type,money(x.amount)))}</div></div></div>}
 {tab==="CLIENTES"&&<div className="panel"><div className="report-kpis compact"><Card t="Total" v={s.customers}/><Card t="Ativos" v={s.activeCustomers}/><Card t="Novos 30 dias" v={d.customers.new30}/><Card t="Com telefone/WhatsApp" v={d.customers.withPhone}/><Card t="Sem CPF/CNPJ" v={d.customers.withoutDocument}/></div></div>}
 {tab==="ORÇAMENTOS"&&<div className="panel"><div className="report-kpis compact"><Card t="Total" v={s.quotes}/><Card t="Abertos" v={d.quotes.open}/><Card t="Vencidos" v={d.quotes.expired}/><Card t="Convertidos" v={d.quotes.converted}/></div></div>}
 {tab==="PRESCRIÇÕES"&&<div className="panel"><div className="report-kpis compact"><Card t="Total" v={d.prescriptions.total}/><Card t="Válidas" v={d.prescriptions.valid}/><Card t="Vencidas" v={d.prescriptions.expired}/></div></div>}
 {tab==="AGENDA"&&<div className="panel"><div className="report-kpis compact"><Card t="Total" v={d.appointments.total}/><Card t="Hoje" v={d.appointments.today}/><Card t="Agendados" v={d.appointments.pending}/></div></div>}
 {tab==="FISCAL"&&<div className="panel"><div className="report-kpis compact"><Card t="Total" v={d.fiscal.total}/><Card t="Autorizados" v={d.fiscal.authorized}/><Card t="Pendentes" v={d.fiscal.pending}/><Card t="Rejeitados" v={d.fiscal.rejected}/></div></div>}
 {tab==="AUDITORIA"&&<div className="panel"><div className="panel-heading"><div><h2>Trilha de auditoria</h2><p>Quem fez o quê e quando.</p></div><input className="report-search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Pesquisar..." /></div><div className="report-table">{d.audit.events.filter((x:any)=>JSON.stringify(x).toLowerCase().includes(q.toLowerCase())).slice(0,150).map((x:any)=>row(new Date(x.createdAt).toLocaleString("pt-BR"),x.user?.name||"Sistema",x.action,x.entity+(x.entityId?" · "+x.entityId.slice(0,8):"")))}</div></div>}
 {tab==="INCONSISTÊNCIAS"&&<div className="panel"><div className="panel-heading"><div><h2>Central de integridade</h2><p>Verificações automáticas sobre financeiro, vendas, estoque, pedidos, fiscal e cadastros.</p></div><span className={inc.length?"alert-badge":"good-badge"}>{inc.length} alerta(s)</span></div><div className="report-table">{inc.length?inc.map((x:any,i:number)=>row(x.severity,x.type,x.message,x.entity||"—")):<div className="empty-state">✓ Nenhuma inconsistência encontrada.</div>}</div></div>}
 <div className="report-foot">Atualizado em {new Date(d.generatedAt).toLocaleString("pt-BR")} · Os alertas são automáticos e devem ser conferidos antes de decisões operacionais.</div>
 </section>
}