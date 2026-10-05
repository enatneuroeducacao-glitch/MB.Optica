"use client";
import {useEffect,useState} from "react";
const n=(v:any)=>Number(v||0);
const money=(v:any)=>n(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const tabs=["VISÃO","SAÚDE DO FATURAMENTO","FATURAMENTO","MARGEM","CONTAS","INADIMPLÊNCIA","FORNECEDORES","VENDAS","ESTOQUE","INTELIGÊNCIA GERENCIAL","RELATÓRIO CONSOLIDADO","PEDIDOS","FINANCEIRO","CLIENTES","ORÇAMENTOS","PRESCRIÇÕES","AGENDA","FISCAL","AUDITORIA","INCONSISTÊNCIAS"];
const Card=({t,v,d}:{t:string;v:any;d?:string})=><div className="report-card"><span>{t}</span><strong>{v}</strong>{d&&<small>{d}</small>}</div>;
export default function Relatorios(){
 const[d,setD]=useState<any>(null);const[legacy,setLegacy]=useState<any>(null);const[legacySales,setLegacySales]=useState<any>(null);const[manualHistorical,setManualHistorical]=useState<any[]>([]);const[management,setManagement]=useState<any>(null);const[tab,setTab]=useState("VISÃO");const[q,setQ]=useState("");const[showManualHistorical,setShowManualHistorical]=useState(false);const[manualForm,setManualForm]=useState({month:"",sales:"",total:"",notes:""});const[manualSaving,setManualSaving]=useState(false);const[manualError,setManualError]=useState("");
 useEffect(()=>{fetch("/api/migration/financial-summary",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(setLegacy).catch(()=>{})},[]);useEffect(()=>{fetch("/api/migration/financial-sales",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(setLegacySales).catch(()=>{})},[]);useEffect(()=>{fetch("/api/relatorios/historico-manual",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(x=>setManualHistorical(x?.entries||[])).catch(()=>{})},[]);
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
    {legacySales?.ok&&<div className="panel full" style={{marginTop:16}}>
     <div className="panel-heading"><div><span className="eyebrow">HISTÓRICO</span><h2>Faturamento mensal histórico</h2><p>Base BeepStart preservada separadamente das vendas atuais. Os lançamentos manuais também ficam isolados e nunca criam ou alteram vendas, recebimentos ou contas do mês atual.</p></div>
      <div className="report-actions">
       <button className="primary" onClick={()=>{setManualError("");setShowManualHistorical(true)}}>＋ Inserir vendas antigas</button>
       <button className="secondary" onClick={()=>{
        const lines=["Mês;Quantidade de vendas;Faturamento;Origem"];
        legacySales.monthly.forEach((x:any)=>lines.push([x.month.split("-").reverse().join("/"),String(x.sales),String(x.total).replace(".",","),"BeepStart"].join(";")));
        manualHistorical.forEach((x:any)=>lines.push([String(x.month).split("-").reverse().join("/"),String(x.sales),String(x.total).replace(".",","),"Manual"].join(";")));
        const blob=new Blob(["\ufeff"+lines.join("\n")],{type:"text/csv;charset=utf-8"});
        const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="faturamento-historico.csv";a.click();URL.revokeObjectURL(url);
       }}>⇩ Exportar mensal</button>
       <button className="secondary" onClick={()=>{
        const lines=["Data;Valor faturado;ID legado"];
        legacySales.sales.forEach((x:any)=>lines.push([x.date?new Date(x.date).toLocaleDateString("pt-BR"):"",String(x.value).replace(".",","),x.saleId].join(";")));
        const blob=new Blob(["\ufeff"+lines.join("\n")],{type:"text/csv;charset=utf-8"});
        const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="faturamento-legado-beepstart-2026.csv";a.click();URL.revokeObjectURL(url);
       }}>⇩ Exportar vendas BeepStart</button>
      </div>
     </div>
     <div className="report-kpis compact"><Card t="Vendas BeepStart" v={legacySales.count}/><Card t="Total BeepStart" v={money(legacySales.total)} d="base preservada"/><Card t="Lançamentos manuais" v={manualHistorical.length} d="sem impacto operacional"/><Card t="Vendas atuais" v={current.sales} d="mantidas separadas"/></div>
     <div className="report-table">
      <div className="report-row head"><span>Mês</span><span>Vendas</span><span>Faturamento</span><span>Origem</span></div>
      {legacySales.monthly.map((x:any)=><div className="report-row" key={"beep-"+x.month}><strong>{x.month.split("-").reverse().join("/")}</strong><s   {showManualHistorical&&<div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>!manualSaving&&setShowManualHistorical(false)}>
     <div className="panel" style={{width:"min(520px,100%)",margin:0}} onClick={e=>e.stopPropagation()}>
      <div className="panel-heading"><div><span className="eyebrow">HISTÓRICO</span><h2>Inserir vendas antigas</h2><p>Este lançamento fica separado das vendas atuais.</p></div><button className="secondary" onClick={()=>setShowManualHistorical(false)} disabled={manualSaving}>Fechar</button></div>
      <div style={{display:"grid",gap:12}}>
       <label>Competência<input type="month" value={manualForm.month} onChange={e=>setManualForm({...manualForm,month:e.target.value})}/></label>
       <label>Quantidade de vendas<input type="number" min="0" step="1" value={manualForm.sales} onChange={e=>setManualForm({...manualForm,sales:e.target.value})}/></label>
       <label>Faturamento do período<input type="number" min="0" step="0.01" value={manualForm.total} onChange={e=>setManualForm({...manualForm,total:e.target.value})}/></label>
       <label>Observação (opcional)<textarea rows={3} value={manualForm.notes} onChange={e=>setManualForm({...manualForm,notes:e.target.value})}/></label>
       {manualError&&<div className="report-alert"><div><b>Não foi possível salvar</b><span>{manualError}</span></div></div>}
       <div className="report-actions"><button className="secondary" onClick={()=>setShowManualHistorical(false)} disabled={manualSaving}>Cancelar</button><button className="primary" disabled={manualSaving} onClick={async()=>{setManualSaving(true);setManualError("");try{const r=await fetch("/api/relatorios/historico-manual",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(manualForm)});const x=await r.json();if(!r.ok||!x.ok)throw new Error(x.error||"Não foi possível salvar.");const list=await fetch("/api/relatorios/historico-manual",{cache:"no-store"}).then(v=>v.json());setManualHistorical(list?.entries||[]);setManualForm({month:"",sales:"",total:"",notes:""});setShowManualHistorical(false)}catch(e){setManualError(e instanceof Error?e.message:"Erro ao salvar.")}finally{setManualSaving(false)}}}>{manualSaving?"Salvando...":"Salvar lançamento"}</button></div>
      </div>
     </div>
    </div>}
pan>{x.sales}</span><strong>{money(x.total)}</strong><span>BeepStart</span></div>)}
      {manualHistorical.map((x:any)=><div className="report-row" key={"manual-"+x.id}><strong>{String(x.month).split("-").reverse().join("/")}</strong><span>{x.sales}</span><strong>{money(x.total)}</strong><span>Manual</span></div>)}
     </div>
     <p style={{marginTop:10,fontSize:12,color:"var(--muted)"}}>Os valores BeepStart são somente leitura. O botão de lançamento registra um complemento histórico isolado no banco do MB Gestão e não altera as vendas atuais.</p>
    </div>}   <div className="panel full">
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
 {tab==="CONTAS"&&(()=>{
   const a=management?.contas;
   if(!a)return <div className="panel"><div className="panel-heading"><div><span className="eyebrow">FASE 6.7</span><h2>Contas</h2><p>Carregando os indicadores centrais de contas...</p></div></div></div>;
   const f=a.futuro||{},rc=a.concentracaoReceber||[],pc=a.concentracaoPagar||[],sp=a.situacaoPorPeriodo||{};
   const periodRows=[
    ["Vencido",sp.vencido],
    ["Próximos 30 dias",sp.ate30],
    ["31–60 dias",sp.de31a60],
    ["61–90 dias",sp.de61a90]
   ];
   return <div className="report-grid-2">
    <div className="panel full"><div className="panel-heading"><div><span className="eyebrow">FASE 6.7</span><h2>Inteligência de contas</h2><p>Análise gerencial sobre contas a receber, contas a pagar, vencimentos, capital de giro e compromissos futuros.</p></div><div className="report-actions"><button className="secondary" onClick={()=>window.print()}>🖨 Imprimir relatório</button></div></div>
     <div className="report-kpis compact"><Card t="A receber" v={money(a.receber)} d={a.titulosReceber+" título(s) em aberto"}/><Card t="A pagar" v={money(a.pagar)} d={a.titulosPagar+" título(s) em aberto"}/><Card t="Capital de giro" v={money(a.capitalDeGiro)} d="a receber menos a pagar"/><Card t="Receber vencido" v={money(a.receberVencido)} d="títulos vencidos"/><Card t="Pagar vencido" v={money(a.pagarVencido)} d="títulos vencidos"/><Card t="Títulos vencidos" v={a.titulosVencidos}/></div>
    </div>
    <div className="panel"><div className="panel-heading"><div><h2>Compromissos futuros</h2><p>Valores em aberto por janela de vencimento.</p></div></div><div className="funnel"><div><span>Receber · próximos 30 dias</span><strong>{money(f.receber30)}</strong></div><div><span>Receber · 31–60 dias</span><strong>{money(f.receber60)}</strong></div><div><span>Receber · 61–90 dias</span><strong>{money(f.receber90)}</strong></div></div></div>
    <div className="panel"><div className="panel-heading"><div><h2>Títulos pendentes e parciais</h2><p>Separação gerencial dos títulos ainda não liquidados.</p></div></div><div className="report-table"><div className="report-row head"><span>Categoria</span><span>Quantidade</span><span>Valor em aberto</span><span>Situação</span></div>
      <div className="report-row"><span>Receber · pendentes</span><span>{a.pendentesReceber}</span><span>{money(a.valorPendentesReceber)}</span><strong>PENDENTE</strong></div>
      <div className="report-row"><span>Receber · parciais</span><span>{a.parciaisReceber}</span><span>{money(a.valorParciaisReceber)}</span><strong>PARCIAL</strong></div>
      <div className="report-row"><span>Pagar · pendentes</span><span>{a.pendentesPagar}</span><span>{money(a.valorPendentesPagar)}</span><strong>PENDENTE</strong></div>
      <div className="report-row"><span>Pagar · parciais</span><span>{a.parciaisPagar}</span><span>{money(a.valorParciaisPagar)}</span><strong>PARCIAL</strong></div>
    </div></div>
    <div className="panel"><div className="panel-heading"><div><h2>Pagamentos futuros</h2><p>Compromissos a pagar por janela.</p></div></div><div className="funnel"><div><span>Pagar · próximos 30 dias</span><strong>{money(f.pagar30)}</strong></div><div><span>Pagar · 31–60 dias</span><strong>{money(f.pagar60)}</strong></div><div><span>Pagar · 61–90 dias</span><strong>{money(f.pagar90)}</strong></div></div></div>
    <div className="panel"><div className="panel-heading"><div><h2>Maior concentração a receber</h2><p>Principais títulos por valor em aberto.</p></div></div><div className="report-table"><div className="report-row head"><span>Descrição</span><span>Vencimento</span><span>Status</span><span>Valor</span></div>{rc.slice(0,8).map((x:any)=><div className="report-row" key={x.id}><span>{x.description}</span><span>{new Date(x.dueDate).toLocaleDateString("pt-BR")}</span><span>{x.status}</span><strong>{money(x.amount)}</strong></div>)}{!rc.length&&<div className="empty-state">Nenhuma conta a receber em aberto.</div>}</div></div>
    <div className="panel"><div className="panel-heading"><div><h2>Maior concentração a pagar</h2><p>Principais compromissos por valor em aberto.</p></div></div><div className="report-table"><div className="report-row head"><span>Descrição</span><span>Vencimento</span><span>Status</span><span>Valor</span></div>{pc.slice(0,8).map((x:any)=><div className="report-row" key={x.id}><span>{x.description}</span><span>{new Date(x.dueDate).toLocaleDateString("pt-BR")}</span><span>{x.status}</span><strong>{money(x.amount)}</strong></div>)}{!pc.length&&<div className="empty-state">Nenhuma conta a pagar em aberto.</div>}</div></div>
    <div className="panel full"><div className="panel-heading"><div><h2>Alertas de contas</h2><p>Indicadores que merecem acompanhamento gerencial.</p></div></div><div className="funnel">{a.receberVencido>0&&<div><span><b>ATENÇÃO</b> · Existem contas a receber vencidas.</span><strong>{money(a.receberVencido)}</strong></div>}{a.pagarVencido>0&&<div><span><b>ATENÇÃO</b> · Existem contas a pagar vencidas.</span><strong>{money(a.pagarVencido)}</strong></div>}{a.pagar>a.receber&&<div><span><b>ATENÇÃO</b> · O saldo a pagar supera o saldo a receber.</span><strong>{money(a.pagar-a.receber)}</strong></div>}{a.receberVencido===0&&a.pagarVencido===0&&a.pagar<=a.receber&&<div><span>Nenhum alerta financeiro acionado pelos critérios da visão.</span><strong>OK</strong></div>}</div></div>
    <div className="panel full"><div className="panel-heading"><div><h2>Situação financeira por período</h2><p>Recebimentos, compromissos e saldo projetado por faixa de vencimento.</p></div></div>
     <div className="report-table"><div className="report-row head"><span>Período</span><span>A receber</span><span>A pagar</span><span>Saldo projetado</span></div>
      {periodRows.map(([label,x]:any)=><div className="report-row" key={label}><span>{label}</span><span>{money(x?.receber)}</span><span>{money(x?.pagar)}</span><strong>{money(x?.saldoProjetado)}</strong></div>)}
     </div>
     <p style={{lineHeight:1.7,fontSize:13,marginTop:12}}>O saldo projetado representa a diferença entre valores a receber e a pagar em cada faixa. Valores vencidos mostram pressão financeira já existente; as demais faixas mostram compromissos previstos. Esta visão é gerencial e não substitui o fluxo de caixa operacional.</p>
    </div>
   </div>;
 })()}
 {tab==="INADIMPLÊNCIA"&&(()=>{
   const i=management?.contas?.inadimplencia;
   if(!i)return <div className="panel"><div className="panel-heading"><div><span className="eyebrow">FASE 6.8</span><h2>Inadimplência</h2><p>Carregando os indicadores centrais de inadimplência...</p></div></div></div>;
   const faixas=i.faixas||{};
   const concentracao=i.concentracaoClientes||[];
   const evolucao=i.evolucaoPorVencimento||[];
   const alertas=i.alertas||[];
   const total=n(i.total);
   const capitalAjustado=n(i.capitalDeGiroAjustado);
   return <div className="report-grid-2">
    <div className="panel full">
     <div className="panel-heading"><div><span className="eyebrow">FASE 6.8</span><h2>Inteligência de inadimplência</h2><p>Análise gerencial dos títulos a receber vencidos, exposição por cliente, atraso, impacto no capital de giro e sinais de atenção.</p></div><div className="report-actions"><button className="secondary" onClick={()=>window.print()}>🖨 Imprimir relatório</button></div></div>
     <div className="report-kpis compact">
      <Card t="Inadimplência total" v={money(total)} d="contas a receber vencidas"/>
      <Card t="Títulos vencidos" v={i.titulos} d="em aberto"/>
      <Card t="% sobre A receber" v={n(i.percentualSobreReceber).toFixed(1)+"%"} d="exposição vencida"/>
      <Card t="Média de atraso" v={n(i.mediaDiasAtraso).toFixed(1)+" dias"} d="ponderada pelo valor"/>
      <Card t="Capital de giro ajustado" v={money(capitalAjustado)} d="descontando a inadimplência"/>
      <Card t="Impacto no capital" v={i.impactoCapitalDeGiro===null?"sem base":n(i.impactoCapitalDeGiro).toFixed(1)+"%"} d="inadimplência / capital de giro"/>
     </div>
    </div>
    <div className="panel full">
     <div className="panel-heading"><div><h2>Faixas de atraso</h2><p>Distribuição da carteira vencida por tempo de atraso.</p></div></div>
     <div className="report-table"><div className="report-row head"><span>Faixa</span><span>Títulos</span><span>Valor vencido</span><span>Participação</span></div>
      {[
       ["1–30 dias",faixas.ate30],
       ["31–60 dias",faixas.de31a60],
       ["61–90 dias",faixas.de61a90],
       ["> 90 dias",faixas.acima90]
      ].map(([label,x]:any)=><div className="report-row" key={label}><span>{label}</span><span>{x?.quantidade||0}</span><span>{money(x?.valor)}</span><strong>{total>0?((n(x?.valor)/total)*100).toFixed(1)+"%":"—"}</strong></div>)}
     </div>
    </div>
    <div className="panel">
     <div className="panel-heading"><div><h2>Clientes com maior exposição</h2><p>Concentração do valor atualmente vencido por cliente.</p></div></div>
     <div className="report-table"><div className="report-row head"><span>Cliente</span><span>Títulos</span><span>Valor vencido</span><span>Participação</span></div>
      {concentracao.length?concentracao.map((x:any)=><div className="report-row" key={x.customerId||x.customerName}><span>{x.customerName}</span><span>{x.quantidade}</span><span>{money(x.valor)}</span><strong>{total>0?((n(x.valor)/total)*100).toFixed(1)+"%":"—"}</strong></div>):<div className="empty-state">✓ Nenhuma exposição vencida por cliente.</div>}
     </div>
    </div>
    <div className="panel">
     <div className="panel-heading"><div><h2>Alertas de inadimplência</h2><p>Sinais gerenciais derivados da carteira vencida atual.</p></div><span className={alertas.length?"alert-badge":"good-badge"}>{alertas.length} alerta(s)</span></div>
     <div className="report-table">{alertas.length?alertas.map((x:any,idx:number)=><div className="report-row" key={idx}><strong>{x.severity}</strong><span>{x.indicator}</span><span>{x.message}</span><span>acompanhar</span></div>):<div className="empty-state">✓ Nenhum alerta específico de inadimplência.</div>}</div>
    </div>
    <div className="panel full">
     <div className="panel-heading"><div><h2>Evolução por mês de vencimento</h2><p>Carteira vencida atual agrupada pelo mês em que os títulos venceram.</p></div></div>
     <div className="report-table"><div className="report-row head"><span>Mês de vencimento</span><span>Títulos</span><span>Valor vencido</span><span>Participação</span></div>
      {evolucao.map((x:any)=><div className="report-row" key={x.month}><strong>{x.month}</strong><span>{x.quantidade}</span><span>{money(x.valor)}</span><strong>{total>0?((n(x.valor)/total)*100).toFixed(1)+"%":"—"}</strong></div>)}
     </div>
     <p style={{lineHeight:1.7,fontSize:13,marginTop:12}}>Esta série mostra a composição atual da inadimplência por mês de vencimento. Ela não representa um histórico diário/mensal de saldos de inadimplência, porque o sistema ainda não mantém snapshots históricos da carteira.</p>
    </div>
    <div className="panel full">
     <div className="panel-heading"><div><h2>Impacto sobre o capital de giro</h2><p>Leitura gerencial derivada dos valores atualmente em aberto.</p></div></div>
     <div className="funnel">
      <div><span>Capital de giro antes da inadimplência</span><strong>{money(n(i.total)+capitalAjustado)}</strong></div>
      <div><span>Inadimplência descontada</span><strong>{money(total)}</strong></div>
      <div><span>Capital de giro ajustado</span><strong>{money(capitalAjustado)}</strong></div>
      <div><span>Impacto percentual</span><strong>{i.impactoCapitalDeGiro===null?"sem base":n(i.impactoCapitalDeGiro).toFixed(1)+"%"}</strong></div>
     </div>
    </div>
    <div className="panel full">
     <div className="panel-heading"><div><h2>Leitura gerencial</h2><p>Como transformar os indicadores em acompanhamento de gestão.</p></div></div>
     <p style={{lineHeight:1.8,fontSize:13}}>A inadimplência deve ser acompanhada pelo valor vencido, quantidade de títulos, tempo de atraso e concentração por cliente. Títulos acima de 90 dias representam uma exposição mais antiga e devem ser analisados individualmente. A concentração mostra onde uma cobrança pode ter maior efeito sobre o saldo vencido. O capital de giro ajustado demonstra quanto do saldo líquido de contas deixa de ser tratado como recurso disponível enquanto a carteira vencida permanece sem liquidação.</p>
    </div>
   </div>;
 })()}
 {tab==="FORNECEDORES"&&(()=>{
   const f=management?.fornecedores;
   if(!f)return <div className="panel"><div className="panel-heading"><div><span className="eyebrow">FASE 6.9</span><h2>Fornecedores</h2><p>Carregando os indicadores centrais de fornecedores...</p></div></div></div>;
   const lista=f.concentracao||f.maioresCompromissos||[];
   const futuro=f.futuro||{};
   const total=n(f.totalAPararFornecedores);
   const vencido=n(f.vencido);
   return <div className="report-grid-2">
    <div className="panel full">
     <div className="panel-heading"><div><span className="eyebrow">FASE 6.9</span><h2>Inteligência de fornecedores</h2><p>Análise gerencial da base de fornecedores, compromissos financeiros, concentração, produtos vinculados e próximos vencimentos.</p></div><div className="report-actions"><button className="secondary" onClick={()=>window.print()}>🖨 Imprimir relatório</button></div></div>
     <div className="report-kpis compact">
      <Card t="Fornecedores ativos" v={f.ativos}/>
      <Card t="Com produtos" v={f.comProdutos}/>
      <Card t="Sem produtos vinculados" v={f.semProdutos}/>
      <Card t="Compromissos em aberto" v={money(total)}/>
      <Card t="Compromissos vencidos" v={money(vencido)}/>
      <Card t="Próximos 30 dias" v={money(futuro.ate30)}/>
     </div>
    </div>
    <div className="panel full">
     <div className="panel-heading"><div><h2>Concentração de compromissos</h2><p>Fornecedores ordenados pelo valor de contas a pagar em aberto vinculadas.</p></div></div>
     <div className="report-table"><div className="report-row head"><span>Fornecedor</span><span>Produtos</span><span>Em aberto</span><span>Participação</span></div>
      {lista.length?lista.map((x:any)=><div className="report-row" key={x.id}><span>{x.name}</span><span>{x.products}</span><span>{money(x.payable)}</span><strong>{n(x.shareOfPayable).toFixed(1)}%</strong></div>):<div className="empty-state">Nenhum compromisso financeiro vinculado a fornecedor.</div>}
     </div>
    </div>
    <div className="panel">
     <div className="panel-heading"><div><h2>Compromissos futuros</h2><p>Contas a pagar vinculadas a fornecedores por janela de vencimento.</p></div></div>
     <div className="funnel"><div><span>Até 30 dias</span><strong>{money(futuro.ate30)}</strong></div><div><span>31–60 dias</span><strong>{money(futuro.de31a60)}</strong></div><div><span>61–90 dias</span><strong>{money(futuro.de61a90)}</strong></div></div>
    </div>
    <div className="panel">
     <div className="panel-heading"><div><h2>Exposição vencida</h2><p>Compromissos de fornecedores que já ultrapassaram o vencimento.</p></div></div>
     <div className="funnel"><div><span>Total vencido</span><strong>{money(vencido)}</strong></div><div><span>Participação nos compromissos</span><strong>{total>0?(vencido/total*100).toFixed(1)+"%":"—"}</strong></div><div><span>Fornecedores com exposição</span><strong>{lista.filter((x:any)=>n(x.overdue)>0).length}</strong></div></div>
    </div>
    <div className="panel full">
     <div className="panel-heading"><div><h2>Leitura gerencial</h2><p>Como utilizar os indicadores para acompanhamento de fornecedores.</p></div></div>
     <p style={{lineHeight:1.8,fontSize:13}}>A análise de fornecedores deve combinar o valor dos compromissos em aberto, os vencimentos futuros, a exposição já vencida e a concentração por fornecedor. Uma concentração elevada não significa, por si só, um problema: ela indica dependência financeira relevante que merece acompanhamento. Fornecedores ativos sem produtos vinculados também aparecem para conferência cadastral. A análise utiliza os dados operacionais existentes e não reconstrói contas a pagar.</p>
    </div>
   </div>;
 })()}
 {tab==="VENDAS"&&(()=>{
   const monthly=d.sales?.monthly||[], sellers=d.sales?.bySeller||[], methods=d.sales?.paymentMethods||[], topItems=d.sales?.topItems||[];
   const current=monthly[monthly.length-1]||{month:"—",sales:0,total:0,received:0};
   const previous=monthly[monthly.length-2]||{month:"—",sales:0,total:0,received:0};
   const currentTotal=n(current.total), previousTotal=n(previous.total);
   const variation=previousTotal>0?((currentTotal-previousTotal)/previousTotal)*100:null;
   const ticket=current.sales>0?currentTotal/current.sales:0;
   const average12=monthly.length?monthly.reduce((sum:any,x:any)=>sum+n(x.total),0)/monthly.length:0;
   const topSeller=sellers.slice().sort((a:any,b:any)=>n(b.total)-n(a.total))[0];
   const topMethod=methods.slice().sort((a:any,b:any)=>n(b.value)-n(a.value))[0];
   const sellerTotal=sellers.reduce((sum:any,x:any)=>sum+n(x.total),0);
   const methodTotal=methods.reduce((sum:any,x:any)=>sum+n(x.value),0);
   const alerts:any[]=[];
   if(variation!==null&&variation<-15)alerts.push(["ATENÇÃO","Queda de faturamento","O faturamento do mês está "+Math.abs(variation).toFixed(1)+"% abaixo do mês anterior.","Comparar volume de vendas, ticket e mix de produtos."]);
   if(current.sales>0&&ticket<average12/Math.max(1,monthly.reduce((sum:any,x:any)=>sum+n(x.sales),0)/Math.max(1,monthly.length)))alerts.push(["ACOMPANHAR","Ticket médio","O ticket atual merece comparação com a média histórica disponível.","Verificar composição das vendas e oportunidades de venda adicional."]);
   if(topSeller&&sellerTotal>0&&n(topSeller.total)/sellerTotal>=0.5)alerts.push(["ACOMPANHAR","Concentração por vendedor","Um vendedor responde por "+(n(topSeller.total)/sellerTotal*100).toFixed(1)+"% do faturamento listado.","Acompanhar distribuição das vendas sem tratar concentração isoladamente como problema."]);
   if(topMethod&&methodTotal>0&&n(topMethod.value)/methodTotal>=0.7)alerts.push(["ACOMPANHAR","Concentração por pagamento","O principal meio de pagamento representa "+(n(topMethod.value)/methodTotal*100).toFixed(1)+"% dos valores registrados.","Acompanhar dependência do meio de pagamento predominante."]);
   return <div className="report-grid-2">
    <div className="panel full">
     <div className="panel-heading"><div><span className="eyebrow">FASE 6.10</span><h2>Inteligência de vendas</h2><p>Análise gerencial do volume, faturamento, ticket, vendedores, meios de pagamento, itens e evolução mensal.</p></div><div className="report-actions"><button className="secondary" onClick={()=>window.print()}>🖨 Imprimir relatório</button></div></div>
     <div className="report-kpis compact">
      <Card t="Vendas no mês" v={current.sales}/>
      <Card t="Faturamento no mês" v={money(currentTotal)}/>
      <Card t="Ticket médio" v={money(ticket)}/>
      <Card t="Recebido associado" v={money(current.received)}/>
      <Card t="Variação mensal" v={variation===null?"sem base":(variation>=0?"+":"")+variation.toFixed(1)+"%"}/>
      <Card t="Média mensal" v={money(average12)}/>
     </div>
    </div>
    <div className="panel full">
     <div className="panel-heading"><div><h2>Evolução das vendas</h2><p>Volume e faturamento dos últimos 12 meses disponíveis.</p></div></div>
     <div className="report-table"><div className="report-row head"><span>Mês</span><span>Quantidade</span><span>Faturamento</span><span>Variação</span></div>
      {monthly.map((x:any,i:number)=>{const prev=monthly[i-1];const v=prev&&n(prev.total)>0?((n(x.total)-n(prev.total))/n(prev.total))*100:null;return <div className="report-row" key={x.month}><strong>{x.month}</strong><span>{x.sales}</span><span>{money(x.total)}</span><strong>{v===null?"—":(v>=0?"+":"")+v.toFixed(1)+"%"}</strong></div>})}
     </div>
    </div>
    <div className="panel">
     <div className="panel-heading"><div><h2>Desempenho por vendedor</h2><p>Faturamento registrado por vendedor no conjunto de vendas ativas consultado.</p></div></div>
     <div className="report-table"><div className="report-row head"><span>Vendedor</span><span></span><span>Faturamento</span><span>Participação</span></div>
      {sellers.length?sellers.slice().sort((a:any,b:any)=>n(b.total)-n(a.total)).map((x:any)=><div className="report-row" key={x.name}><span>{x.name}</span><span></span><span>{money(x.total)}</span><strong>{sellerTotal>0?(n(x.total)/sellerTotal*100).toFixed(1)+"%":"—"}</strong></div>):<div className="empty-state">Nenhuma venda ativa encontrada.</div>}
     </div>
    </div>
    <div className="panel">
     <div className="panel-heading"><div><h2>Meios de pagamento</h2><p>Participação dos valores recebidos nas vendas ativas.</p></div></div>
     <div className="report-table"><div className="report-row head"><span>Meio</span><span></span><span>Valor</span><span>Participação</span></div>
      {methods.length?methods.slice().sort((a:any,b:any)=>n(b.value)-n(a.value)).map((x:any)=><div className="report-row" key={x.name}><span>{x.name}</span><span></span><span>{money(x.value)}</span><strong>{methodTotal>0?(n(x.value)/methodTotal*100).toFixed(1)+"%":"—"}</strong></div>):<div className="empty-state">Nenhum pagamento registrado.</div>}
     </div>
    </div>
    <div className="panel full">
     <div className="panel-heading"><div><h2>Itens mais vendidos</h2><p>Itens ordenados pelo valor vendido no conjunto consultado.</p></div></div>
     <div className="report-table"><div className="report-row head"><span>Item</span><span></span><span>Valor vendido</span><span>Participação</span></div>
      {topItems.length?topItems.slice(0,15).map((x:any)=><div className="report-row" key={x.description}><span>{x.description}</span><span></span><span>{money(x.total)}</span><strong>{currentTotal>0?(n(x.total)/currentTotal*100).toFixed(1)+"%":"—"}</strong></div>):<div className="empty-state">Nenhum item vendido.</div>}
     </div>
    </div>
    <div className="panel">
     <div className="panel-heading"><div><h2>Pontos de atenção</h2><p>Leitura gerencial derivada dos indicadores já disponíveis.</p></div><span className={alerts.length?"alert-badge":"good-badge"}>{alerts.length} alerta(s)</span></div>
     <div className="report-table">{alerts.length?alerts.map((x:any,i:number)=><div className="report-row" key={i}><strong>{x[0]}</strong><span>{x[1]}</span><span>{x[2]}</span><span>{x[3]}</span></div>):<div className="empty-state">✓ Nenhum ponto específico acionado pelos critérios atuais.</div>}</div>
    </div>
    <div className="panel">
     <div className="panel-heading"><div><h2>Leitura gerencial</h2><p>Como interpretar os indicadores de vendas.</p></div></div>
     <p style={{lineHeight:1.8,fontSize:13}}>A análise de vendas deve combinar quantidade de vendas, faturamento, ticket médio, evolução mensal, distribuição por vendedor, meios de pagamento e mix de itens. Concentração é um indicador de dependência e deve ser acompanhada junto ao contexto comercial. O relatório não substitui a rotina do PDV nem reconstrói o financeiro operacional.</p>
    </div>
   </div>;
 })()}
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
 {tab==="INTELIGÊNCIA GERENCIAL"&&(()=>{
   const intelligence=management?.inteligenciaGerencial||[];
   const critical=intelligence.filter((x:any)=>x.severity==="CRITICO");
   const attention=intelligence.filter((x:any)=>x.severity==="ATENCAO");
   const informational=intelligence.filter((x:any)=>x.severity==="INFORMATIVO");
   const severityLabel=(x:any)=>x==="CRITICO"?"CRÍTICO":x==="ATENCAO"?"ATENÇÃO":"INFORMATIVO";
   const categoryLabel=(x:any)=>String(x||"").replaceAll("_"," ");
   if(!management)return <div className="panel"><div className="panel-heading"><div><span className="eyebrow">FASE 6.11</span><h2>Inteligência gerencial</h2><p>Consolidando os cruzamentos dos indicadores...</p></div></div></div>;
   return <div className="report-grid-2">
    <div className="panel full">
     <div className="panel-heading">
      <div><span className="eyebrow">FASE 6.11.2</span><h2>Alertas e inteligência gerencial</h2><p>Visão consolidada dos cruzamentos entre os indicadores das fases 6.3–6.10.</p></div>
      <div className="report-actions"><button className="secondary" onClick={()=>window.print()}>🖨 Imprimir relatório</button></div>
     </div>
     <div className="report-kpis compact">
      <Card t="Críticos" v={critical.length} d="prioridade imediata"/>
      <Card t="Atenção" v={attention.length} d="requerem análise"/>
      <Card t="Informativos" v={informational.length} d="acompanhamento"/>
      <Card t="Total" v={intelligence.length} d="cruzamentos acionados"/>
     </div>
    </div>
    <div className="panel full">
     <div className="panel-heading"><div><h2>Visão consolidada para decisão</h2><p>Os itens estão ordenados pela prioridade calculada pelo motor central.</p></div><span className={critical.length?"alert-badge":"good-badge"}>{critical.length} crítico(s)</span></div>
     <div className="report-table">
      <div className="report-row head"><span>Prioridade</span><span>Severidade / Categoria</span><span>Alerta e evidência</span><span>Abordagem gerencial</span></div>
      {intelligence.length?intelligence.map((x:any)=><div className="report-row" key={x.id}>
       <strong>{x.priority}</strong>
       <span><b>{severityLabel(x.severity)}</b><br/>{categoryLabel(x.category)}</span>
       <span><b>{x.title}</b><br/>{x.evidence}</span>
       <span>{x.approach}</span>
      </div>):<div className="empty-state">✓ Nenhum alerta gerencial acionado pelos critérios atuais.</div>}
     </div>
    </div>
    <div className="panel">
     <div className="panel-heading"><div><h2>Críticos</h2><p>Ocorrências de maior prioridade.</p></div><span className={critical.length?"alert-badge":"good-badge"}>{critical.length}</span></div>
     <div className="report-table">
      {critical.length?critical.map((x:any)=><div className="report-row" key={x.id}><strong>{x.priority}</strong><span>{x.title}</span><span>{x.evidence}</span><strong>{severityLabel(x.severity)}</strong></div>):<div className="empty-state">✓ Nenhum alerta crítico.</div>}
     </div>
    </div>
    <div className="panel">
     <div className="panel-heading"><div><h2>Atenção</h2><p>Situações que exigem acompanhamento gerencial.</p></div><span className={attention.length?"alert-badge":"good-badge"}>{attention.length}</span></div>
     <div className="report-table">
      {attention.length?attention.map((x:any)=><div className="report-row" key={x.id}><strong>{x.priority}</strong><span>{x.title}</span><span>{x.evidence}</span><strong>{severityLabel(x.severity)}</strong></div>):<div className="empty-state">✓ Nenhum alerta de atenção.</div>}
     </div>
    </div>
    <div className="panel">
     <div className="panel-heading"><div><h2>Informativos</h2><p>Itens para acompanhamento de rotina.</p></div><span className="good-badge">{informational.length}</span></div>
     <div className="report-table">
      {informational.length?informational.map((x:any)=><div className="report-row" key={x.id}><strong>{x.priority}</strong><span>{x.title}</span><span>{x.evidence}</span><strong>{severityLabel(x.severity)}</strong></div>):<div className="empty-state">Nenhum informativo gerado.</div>}
     </div>
    </div>
    <div className="panel full">
     <div className="panel-heading"><div><h2>Indicadores envolvidos</h2><p>Cada alerta informa quais áreas contribuíram para o cruzamento.</p></div></div>
     <div className="report-table">
      <div className="report-row head"><span>Alerta</span><span>Categoria</span><span>Indicadores</span><span>Prioridade</span></div>
      {intelligence.map((x:any)=><div className="report-row" key={x.id}><span>{x.title}</span><span>{categoryLabel(x.category)}</span><span>{(x.relatedIndicators||[]).join(" · ")}</span><strong>{x.priority}</strong></div>)}
     </div>
    </div>
    <div className="panel full">
     <div className="panel-heading"><div><h2>Leitura gerencial</h2><p>Como utilizar esta camada.</p></div></div>
     <p style={{lineHeight:1.8,fontSize:13}}>Esta visão não substitui os relatórios de faturamento, margem, estoque, contas, inadimplência, fornecedores ou vendas. Ela cruza os indicadores já existentes para destacar combinações que merecem atenção. A prioridade orienta a ordem de análise; a evidência mostra o fato que acionou o alerta; e a abordagem gerencial indica o próximo ponto de investigação, sem executar decisões automaticamente.</p>
    </div>
   </div>;
 })()}
 {tab==="RELATÓRIO CONSOLIDADO"&&(()=>{
   const f=management?.faturamento, m=management?.margem, e=management?.estoque, cta=management?.contas, intel=management?.inteligenciaGerencial||[];
   if(!management)return <div className="panel"><div className="panel-heading"><div><span className="eyebrow">FASE 6.12</span><h2>Relatório consolidado</h2><p>Consolidando os indicadores gerenciais...</p></div></div></div>;
   const critical=intel.filter((x:any)=>x.severity==="CRITICO");
   const attention=intel.filter((x:any)=>x.severity==="ATENCAO");
   const info=intel.filter((x:any)=>x.severity==="INFORMATIVO");
   const cash=n(cta?.capitalDeGiro), adjusted=n(cta?.inadimplencia?.capitalDeGiroAjustado);
   const overdue=n(cta?.inadimplencia?.total), payable=n(cta?.pagar), receivable=n(cta?.receber);
   const salesVariation=f?.variacaoPercentual;
   const marginPct=n(m?.margemBrutaPercentual);
   const stockCritical=(e?.itensCriticos||[]).length;
   const topAlert=[...intel].sort((a:any,b:any)=>n(b.priority)-n(a.priority))[0];
   const status=(critical.length>0?"ATENÇÃO PRIORITÁRIA":attention.length>0?"ACOMPANHAMENTO":"MONITORAMENTO");
   return <div className="report-grid-2">
    <div className="panel full">
     <div className="panel-heading">
      <div><span className="eyebrow">FASE 6.12</span><h2>Relatório consolidado de gestão</h2><p>Visão executiva integrada dos indicadores das fases 6.3–6.11, sem duplicar os relatórios analíticos.</p></div>
      <div className="report-actions"><button className="secondary" onClick={()=>window.print()}>🖨 Imprimir relatório</button></div>
     </div>
     <div className="report-kpis compact">
      <Card t="Faturamento" v={money(f?.total)} d="mês atual"/>
      <Card t="Margem bruta" v={money(m?.margemBruta)} d={marginPct.toFixed(1)+"% do faturamento"}/>
      <Card t="A receber" v={money(receivable)}/>
      <Card t="A pagar" v={money(payable)}/>
      <Card t="Capital de giro" v={money(cash)}/>
      <Card t="Inadimplência" v={money(overdue)} d={n(cta?.inadimplencia?.percentualSobreReceber).toFixed(1)+"% do a receber"}/>
     </div>
    </div>

    <div className="panel">
     <div className="panel-heading"><div><h2>Posição executiva</h2><p>Leitura sintética do momento atual.</p></div><span className={critical.length?"alert-badge":"good-badge"}>{status}</span></div>
     <div className="funnel">
      <div><span>Faturamento do mês</span><strong>{money(f?.total)}</strong></div>
      <div><span>Variação mensal</span><strong>{salesVariation===null||salesVariation===undefined?"sem base":((n(salesVariation)>=0?"+":"")+n(salesVariation).toFixed(1)+"%")}</strong></div>
      <div><span>Margem bruta</span><strong>{marginPct.toFixed(1)}%</strong></div>
      <div><span>Capital de giro ajustado</span><strong>{money(adjusted)}</strong></div>
     </div>
    </div>

    <div className="panel full">
     <div className="panel-heading"><div><h2>Riscos e atenção</h2><p>Resumo da inteligência gerencial já calculada.</p></div><span className={critical.length?"alert-badge":"good-badge"}>{critical.length+attention.length} ponto(s)</span></div>
     <div className="report-table">
      <div className="report-row head"><span>Prioridade</span><span>Severidade</span><span>Alerta</span><span>Indicadores</span></div>
      {intel.length?intel.slice(0,6).map((x:any)=><div className="report-row" key={x.id}><strong>{x.priority}</strong><span>{x.severity==="CRITICO"?"CRÍTICO":x.severity==="ATENCAO"?"ATENÇÃO":"INFORMATIVO"}</span><span>{x.title}</span><strong>{(x.relatedIndicators||[]).join(" · ")}</strong></div>):<div className="empty-state">✓ Nenhum alerta consolidado.</div>}
     </div>
    </div>

    <div className="panel">
     <div className="panel-heading"><div><h2>Financeiro</h2><p>Indicadores já validados nas fases de contas e inadimplência.</p></div></div>
     <div className="report-metrics">
      <div><b>{money(receivable)}</b><span>a receber</span></div>
      <div><b>{money(payable)}</b><span>a pagar</span></div>
      <div><b>{money(cash)}</b><span>capital de giro</span></div>
      <div><b>{money(overdue)}</b><span>vencidos</span></div>
      <div><b>{n(cta?.futuro?.receber30).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</b><span>a receber em 30 dias</span></div>
      <div><b>{n(cta?.futuro?.pagar30).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</b><span>a pagar em 30 dias</span></div>
     </div>
    </div>

    <div className="panel">
     <div className="panel-heading"><div><h2>Comercial e margem</h2><p>Resumo das fases de faturamento, vendas e margem.</p></div></div>
     <div className="report-metrics">
      <div><b>{f?.vendas||0}</b><span>vendas no mês</span></div>
      <div><b>{money(f?.ticketMedio)}</b><span>ticket médio</span></div>
      <div><b>{marginPct.toFixed(1)}%</b><span>margem bruta</span></div>
      <div><b>{money(m?.descontos)}</b><span>descontos</span></div>
      <div><b>{salesVariation===null||salesVariation===undefined?"—":n(salesVariation).toFixed(1)+"%"}</b><span>variação do faturamento</span></div>
      <div><b>{(m?.produtosInsuficientes||[]).length}</b><span>itens com margem insuficiente</span></div>
     </div>
    </div>

    <div className="panel">
     <div className="panel-heading"><div><h2>Estoque e fornecedores</h2><p>Resumo consolidado dos indicadores de estoque, abastecimento e compromissos.</p></div></div>
     <div className="report-metrics">
      <div><b>{e?.produtosAtivos||0}</b><span>produtos ativos</span></div>
      <div><b>{e?.estoqueBaixo||0}</b><span>estoque baixo</span></div>
      <div><b>{e?.estoqueZero||0}</b><span>estoque zerado</span></div>
      <div><b>{e?.estoqueNegativo||0}</b><span>estoque negativo</span></div>
      <div><b>{money(e?.valorCusto)}</b><span>estoque a custo</span></div>
      <div><b>{stockCritical}</b><span>itens críticos</span></div>
      <div><b>{management?.fornecedores?.ativos||0}</b><span>fornecedores ativos</span></div>
      <div><b>{management?.fornecedores?.comProdutos||0}</b><span>com produtos</span></div>
      <div><b>{management?.fornecedores?.semProdutos||0}</b><span>sem produtos</span></div>
      <div><b>{money(management?.fornecedores?.totalAPararFornecedores)}</b><span>compromissos em aberto</span></div>
      <div><b>{money(management?.fornecedores?.vencido)}</b><span>compromissos vencidos</span></div>
      <div><b>{money(management?.fornecedores?.futuro?.ate30)}</b><span>a pagar até 30 dias</span></div>
     </div>
    </div>

    <div className="panel full">
     <div className="panel-heading"><div><h2>Prioridades de gestão</h2><p>Somente os pontos mais relevantes já identificados pela inteligência gerencial.</p></div></div>
     {topAlert?<div className="report-table">
       <div className="report-row head"><span>Prioridade</span><span>Alerta</span><span>Evidência</span><span>Abordagem</span></div>
       {intel.slice(0,5).map((x:any)=><div className="report-row" key={x.id}><strong>{x.priority}</strong><span><b>{x.title}</b><br/>{x.severity==="CRITICO"?"CRÍTICO":x.severity==="ATENCAO"?"ATENÇÃO":"INFORMATIVO"}</span><span>{x.evidence}</span><span>{x.approach}</span></div>)}
      </div>:<div className="empty-state">✓ Nenhuma prioridade gerencial identificada.</div>}
    </div>

    <div className="panel full">
     <div className="panel-heading"><div><h2>Conclusão executiva</h2><p>Leitura consolidada sem substituir os relatórios analíticos.</p></div></div>
     <p style={{lineHeight:1.8,fontSize:13}}>O relatório consolidado reúne os indicadores já produzidos nas fases 6.3–6.11 e os apresenta em uma única visão executiva. Ele não cria novos cálculos operacionais nem substitui as análises detalhadas de faturamento, margem, estoque, contas, inadimplência, fornecedores, vendas e inteligência gerencial. A finalidade é facilitar a identificação do que merece atenção primeiro, preservando a evidência e a origem de cada indicador.</p>
     <p style={{lineHeight:1.8,fontSize:13,marginTop:8}}>Estado atual: <b>{status}</b>. {info.length} informativo(s), {attention.length} ponto(s) de atenção e {critical.length} crítico(s) foram gerados pela inteligência gerencial atual.</p>
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