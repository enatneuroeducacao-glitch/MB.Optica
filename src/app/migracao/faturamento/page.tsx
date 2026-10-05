"use client";

import { useState } from "react";

type CollectionAnalysis = {
  collection:string; count:number; confidence:number; classification:string; reason:string;
  fields:Array<{field:string;count:number}>;
  referenceFields:Array<{field:string;occurrences:number}>;
  dateCoverage:{withDate:number;withoutDate:number;first:string|null;last:string|null};
  amount:{total:number;positiveRecords:number;negativeRecords:number};
};

type Analysis = {
  fingerprint: string;
  totalRecords: number;
  collections: number;
  financialCandidates: CollectionAnalysis[];
  possibleAdditionalFinancialCollections: CollectionAnalysis[];
  summary:{
    salesCount:number; billing:number; movementCount:number; movementTotal:number;
    receivableCount:number; receivableOpen:number; payableCount:number; payableOpen:number;
    salesWithCustomerRef:number; salesWithProductRef:number; unresolvedCustomerRefs:number; unresolvedProductRefs:number;
  };
  safety:{writesPerformed:boolean;operationalDataChanged:boolean;migrationRunCreated:boolean;nextStep:string};
};

const money=(n:number)=>`R$ ${Number(n||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

export default function Page(){
  const [file,setFile]=useState<File|null>(null);
  const [analysis,setAnalysis]=useState<Analysis|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [records,setRecords]=useState<any[]>([]);
  const [c2,setC2]=useState<any|null>(null);
  const [c2Busy,setC2Busy]=useState(false);

  async function analyze(){
    if(!file)return;
    setBusy(true);setMessage("");setAnalysis(null);
    try{
      const parsed=JSON.parse(await file.text());
      if(!Array.isArray(parsed))throw new Error("O backup precisa ser uma lista JSON.");
      setRecords(parsed);
      const r=await fetch("/api/migration/faturamento/analyze",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({records:parsed})
      });
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Falha na análise do faturamento.");
      setAnalysis(d);
      setMessage("C1 concluída. O backup foi apenas lido; nenhuma alteração foi gravada.");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao analisar o backup.");}
    finally{setBusy(false);}
  }

  return <section className="page">
    <div className="page-heading">
      <div>
        <span className="eyebrow">FASE C1 · LEITOR DE FATURAMENTO</span>
        <h1>Análise do faturamento BeepStart</h1>
        <p>Identificação das coleções financeiras, campos, período, valores e vínculos. Esta etapa é somente leitura.</p>
      </div>
      <div className="settings-status"><b>● SOMENTE LEITURA</b><span>Nenhuma gravação</span></div>
    </div>

    {message&&<div className="panel settings-message">{message}</div>}

    <div className="panel" style={{marginBottom:16,borderLeft:"4px solid #087f73"}}>
      <div className="panel-heading">
        <div>
          <span className="eyebrow">ETAPA C1</span>
          <h2>Carregar o backup BeepStart</h2>
          <p>Selecione o mesmo JSON usado nas auditorias anteriores. O sistema não cria MigrationRun, não cria vendas e não altera clientes, produtos ou financeiro.</p>
        </div>
        <a className="secondary" href="/migracao">Voltar para Central</a>
      </div>
      <input type="file" accept=".json,.txt,application/json,text/plain" onChange={e=>{setFile(e.target.files?.[0]||null);setAnalysis(null);setMessage("");}} />
      <button className="primary" disabled={!file||busy} onClick={analyze} style={{marginTop:10}}>{busy?"Analisando...":"Analisar faturamento (C1)"}</button>
    </div>

    {analysis&&<div className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">RESULTADO C1</span>
          <h2>Mapa financeiro encontrado</h2>
          <p>Fingerprint: <code>{analysis.fingerprint}</code></p>
        </div>
        <b>✓ SEM GRAVAÇÃO</b>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10,marginBottom:16}}>
        {[
          ["Registros",analysis.totalRecords.toLocaleString("pt-BR")],
          ["Coleções",analysis.collections.toLocaleString("pt-BR")],
          ["Vendas",analysis.summary.salesCount.toLocaleString("pt-BR")],
          ["Faturamento identificado",money(analysis.summary.billing)]
        ].map(([label,value])=><div key={label} style={{border:"1px solid var(--line)",borderRadius:12,padding:14}}><small style={{display:"block",color:"var(--muted)"}}>{label}</small><strong style={{fontSize:21}}>{value}</strong></div>)}
      </div>

      <div className="settings-list" style={{marginBottom:16}}>
        <div><b>Movimentações / recebimentos</b><span>{analysis.summary.movementCount.toLocaleString("pt-BR")} · {money(analysis.summary.movementTotal)}</span></div>
        <div><b>Contas a receber</b><span>{analysis.summary.receivableCount.toLocaleString("pt-BR")} · aberto {money(analysis.summary.receivableOpen)}</span></div>
        <div><b>Contas a pagar</b><span>{analysis.summary.payableCount.toLocaleString("pt-BR")} · aberto {money(analysis.summary.payableOpen)}</span></div>
        <div><b>Vínculos de cliente em vendas</b><span>{analysis.summary.salesWithCustomerRef} · não resolvidos nesta leitura: {analysis.summary.unresolvedCustomerRefs}</span></div>
        <div><b>Vínculos de produto em vendas</b><span>{analysis.summary.salesWithProductRef} · não resolvidos nesta leitura: {analysis.summary.unresolvedProductRefs}</span></div>
      </div>

      <h3>Coleções financeiras identificadas</h3>
      <div className="table" style={{marginTop:10}}>
        <div className="row header"><span>Coleção</span><span>Registros</span><span>Confiança</span><span>Período / valores</span></div>
        {analysis.financialCandidates.map(c=><div className="row" key={c.collection}>
          <span><strong>{c.collection}</strong><small style={{display:"block",color:"var(--muted)"}}>{c.reason}</small></span>
          <span>{c.count.toLocaleString("pt-BR")}</span>
          <span>{c.confidence}%</span>
          <span>{c.dateCoverage.first?new Date(c.dateCoverage.first).toLocaleDateString("pt-BR")+" → ":"—"}{c.dateCoverage.last?new Date(c.dateCoverage.last).toLocaleDateString("pt-BR"):"—"}<small style={{display:"block",color:"var(--muted)"}}>{money(c.amount.total)}</small></span>
        </div>)}
      </div>

      {analysis.possibleAdditionalFinancialCollections.length>0&&<>
        <h3 style={{marginTop:18}}>Coleções que precisam de validação</h3>
        <div className="settings-list">
          {analysis.possibleAdditionalFinancialCollections.map(c=><div key={c.collection}><b>{c.collection}</b><span>{c.count.toLocaleString("pt-BR")} registros · análise manual necessária</span></div>)}
        </div>
      </>}

      <div style={{marginTop:18,padding:16,border:"1px solid var(--line)",borderRadius:12}}>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">ETAPA C2</span>
            <h3>Reconciliação / Dry Run</h3>
            <p>Compara as vendas do BeepStart com clientes, produtos, vendas e registros legados existentes no MB Gestão. Continua sem gravar nada.</p>
          </div>
          <button className="primary" disabled={!analysis||!records.length||c2Busy} onClick={async()=>{
            setC2Busy(true);setMessage("");
            try{
              const r=await fetch("/api/migration/faturamento/dry-run",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records})});
              const d=await r.json();
              if(!r.ok)throw new Error(d.error||"Falha no Dry Run C2.");
              setC2(d);setMessage("C2 concluída. Nenhum dado foi gravado.");
            }catch(e){setMessage(e instanceof Error?e.message:"Erro na C2.");}
            finally{setC2Busy(false);}
          }}>{c2Busy?"Reconciliação...":"Executar C2 — Dry Run"}</button>
        </div>
        {c2&&<div style={{marginTop:14}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10}}>
            {[
              ["Vendas encontradas",c2.summary.salesFound.toLocaleString("pt-BR")],
              ["Faturamento",money(c2.summary.billing)],
              ["Seriam novas",c2.summary.newRecords.toLocaleString("pt-BR")],
              ["Bloqueadas",c2.summary.blockedRecords.toLocaleString("pt-BR")]
            ].map(([label,value])=><div key={label} style={{border:"1px solid var(--line)",borderRadius:12,padding:14}}><small style={{display:"block",color:"var(--muted)"}}>{label}</small><strong style={{fontSize:21}}>{value}</strong></div>)}
          </div>
          <div className="settings-list" style={{marginTop:12}}>
            <div><b>Já importadas</b><span>{c2.summary.alreadyImported}</span></div>
            <div><b>Possíveis duplicidades</b><span>{c2.summary.possibleDuplicates}</span></div>
            <div><b>Duplicadas no próprio backup</b><span>{c2.summary.duplicateInBackup}</span></div>
            <div><b>Canceladas</b><span>{c2.summary.canceled}</span></div>
            <div><b>Clientes vinculados ao MB</b><span>{c2.summary.customerOperationalMatched}</span></div>
            <div><b>Clientes encontrados no legado</b><span>{c2.summary.customerLegacyFound}</span></div>
            <div><b>Clientes não resolvidos</b><span>{c2.summary.customerMissing}</span></div>
            <div><b>Produtos não resolvidos</b><span>{c2.summary.productMissing}</span></div>
          </div>
          {c2.warnings?.length>0&&<div style={{marginTop:12,padding:14,borderRadius:10,background:"#fff7e6"}}><b>Pontos para revisão:</b><ul>{c2.warnings.map((w:string)=><li key={w}>{w}</li>)}</ul></div>}
          <div style={{marginTop:12,padding:14,borderRadius:10,background:"#f1faf8",color:"#087f73"}}><b>Segurança:</b> C2 não criou MigrationRun e não alterou vendas, clientes, produtos, estoque ou financeiro. O número “Seriam novas” é apenas uma previsão para a futura C3.</div>
        </div>}
      </div>

      <div style={{marginTop:18,padding:14,borderRadius:10,background:"#f1faf8",color:"#087f73"}}>
        <b>Segurança:</b> C1 não grava nada. O próximo passo, C2, será o Dry Run de reconciliação e divergências antes de qualquer importação.
      </div>
    </div>}
  </section>;
}
