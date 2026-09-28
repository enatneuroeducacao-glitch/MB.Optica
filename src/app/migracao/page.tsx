"use client";

import { useEffect, useState } from "react";

type Audit = {
  source:string; fingerprint:string; total:number; collections:number; collectionCounts:Record<string,number>;
  duplicateKeys:number; warnings:string[]; readyForDryRun:boolean; note:string;
};
type DryRunReport = {
  mode:string; source:string; fingerprint:string; total:number; collections:number; duplicateKeys:number;
  legacyConflicts:number; sourceCounts:Record<string,number>;
  plan:{
    categories:{source:number;existing:number;create:number};
    suppliers:{source:number;existing:number;create:number};
    users:{source:number;existing:number;create:number};
    paymentMethods:{source:number;existing:number;create:number};
    customers:{source:number;existing:number;create:number};
    products:{source:number;existing:number;create:number};
    orders:number; sales:number; receivableAccounts:number; payableAccounts:number;
    lots:number; movements:number; preservedLegacyRecords:number; mappedSourceCollectionsEstimate:number;
  };
  warnings:string[]; safe:boolean; note:string;
};
type Run = {id:string;status:string;total:number;imported:number;mapped:number;warnings:number;errors:number;startedAt:string;completedAt:string|null;report:any};

const EXPECTED_TOTAL = 5788;
const EXPECTED_COLLECTIONS = 29;

export default function Page(){
  const [file,setFile]=useState<File|null>(null);
  const [records,setRecords]=useState<any[]|null>(null);
  const [audit,setAudit]=useState<Audit|null>(null);
  const [dryRun,setDryRun]=useState<DryRunReport|null>(null);
  const [runs,setRuns]=useState<Run[]>([]);
  const [legacyStored,setLegacyStored]=useState(0);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function load(){
    setLoading(true);
    try{
      const r=await fetch("/api/migration",{cache:"no-store"});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Não foi possível carregar a central.");
      setRuns(d.runs||[]);
      setLegacyStored(d.legacyStored||0);
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao carregar a central.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load()},[]);

  async function auditBackup(){
    if(!file)return;
    setBusy(true);setMessage("");setAudit(null);setDryRun(null);
    try{
      const raw=await file.text();
      let parsed:unknown;
      try{parsed=JSON.parse(raw)}catch{throw new Error("O arquivo não é um JSON válido.");}
      if(!Array.isArray(parsed)) throw new Error("O backup precisa ser uma lista JSON.");
      const nextRecords=parsed as any[];
      const r=await fetch("/api/migration",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records:nextRecords})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Falha na auditoria.");
      setRecords(nextRecords);
      setAudit(d.audit);
      setMessage(d.audit.readyForDryRun?"Auditoria inicial aprovada. O dry-run está liberado.":"Auditoria encontrou pontos que precisam ser verificados antes do dry-run.");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao auditar backup.");}
    finally{setBusy(false);}
  }

  async function executeDryRun(){
    if(!records||!audit?.readyForDryRun)return;
    setBusy(true);setMessage("");setDryRun(null);
    try{
      const r=await fetch("/api/migration/dry-run",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records,fingerprint:audit.fingerprint})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Falha no dry-run.");
      setDryRun(d.report);
      setMessage(d.report.safe?"Dry-run concluído em modo somente leitura. Nenhum dado foi alterado.":"Dry-run encontrou pontos que exigem revisão.");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao executar dry-run.");}
    finally{setBusy(false);}
  }


  async function executeImport(){
    if(!records||!audit?.readyForDryRun||!dryRun?.safe)return;
    if(!window.confirm("CONFIRMAÇÃO DE MIGRAÇÃO DEFINITIVA\n\nO sistema gravará os dados do backup no MB Óptica em uma transação e preservará os 5.788 registros no LegacyRecord.\n\nDeseja continuar?"))return;
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/migration/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records,fingerprint:audit.fingerprint})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Falha na importação definitiva.");
      setMessage("Importação concluída. "+d.report.imported.toLocaleString("pt-BR")+" registros preservados, "+d.report.mapped.toLocaleString("pt-BR")+" mapeados.");
      await load();
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao importar backup.");}
    finally{setBusy(false);}
  }

  return <section className="page">
    <div className="page-heading">
      <div><span className="eyebrow">ADMINISTRAÇÃO</span><h1>Central de Migração</h1><p>BeepStart → MB Óptica · auditoria, dry-run, reconciliação e preservação do legado.</p></div>
      <div className="settings-status"><b>● Protegida</b><span>Somente Administrador</span></div>
    </div>

    {message&&<div className="panel settings-message">{message}</div>}

    <div className="settings-grid">
      <div className="panel">
        <div className="panel-heading"><div><h2>1. Auditoria do backup</h2><p>Envie uma cópia do backup oficial. Esta etapa não altera o banco operacional.</p></div></div>
        <input type="file" accept=".json,.txt,application/json,text/plain" onChange={e=>{setFile(e.target.files?.[0]||null);setRecords(null);setAudit(null);setDryRun(null)}}/>
        <button className="primary" disabled={!file||busy} onClick={auditBackup} style={{marginTop:10}}>{busy?"Processando...":"Auditar backup"}</button>
        <div className="settings-list" style={{marginTop:14}}>
          <div><b>Fonte</b><span>BeepStart</span></div>
          <div><b>Referência</b><span>{EXPECTED_TOTAL.toLocaleString("pt-BR")} registros · {EXPECTED_COLLECTIONS} coleções</span></div>
          <div><b>Preservação</b><span>Os registros originais serão mantidos em LegacyRecord durante a migração.</span></div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading"><div><h2>2. Estado do legado</h2><p>Registros preservados e últimas execuções.</p></div><button className="secondary" onClick={load}>Atualizar</button></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div className="panel" style={{padding:12}}><b>{legacyStored}</b><span style={{display:"block",color:"var(--muted)",fontSize:12}}>LegacyRecords preservados</span></div>
          <div className="panel" style={{padding:12}}><b>{runs.length}</b><span style={{display:"block",color:"var(--muted)",fontSize:12}}>Execuções registradas</span></div>
        </div>
        {loading?<p>Carregando...</p>:runs.length===0?<p style={{color:"var(--muted)"}}>Nenhuma migração executada.</p>:
          <div className="table" style={{marginTop:12}}><div className="row header"><span>Status</span><span>Total</span><span>Importados</span><span>Mapeados</span><span>Alertas</span><span>Início</span></div>
          {runs.map(r=><div className="row" key={r.id}><strong>{r.status}</strong><span>{r.total}</span><span>{r.imported}</span><span>{r.mapped}</span><span>{r.warnings+r.errors}</span><span>{new Date(r.startedAt).toLocaleString("pt-BR")}</span></div>)}</div>}
      </div>
    </div>

    {audit&&<div className="panel">
      <div className="panel-heading"><div><h2>Resultado da auditoria</h2><p>Fingerprint: <code>{audit.fingerprint}</code></p></div><b>{audit.readyForDryRun?"✓ APTO PARA DRY-RUN":"⚠ REVISAR"}</b></div>
      <div className="settings-grid">
        <div className="settings-list">
          <div><b>Registros</b><span>{audit.total.toLocaleString("pt-BR")} / {EXPECTED_TOTAL.toLocaleString("pt-BR")}</span></div>
          <div><b>Coleções</b><span>{audit.collections} / {EXPECTED_COLLECTIONS}</span></div>
          <div><b>Chaves duplicadas</b><span>{audit.duplicateKeys}</span></div>
        </div>
        <div className="settings-list">
          {Object.entries(audit.collectionCounts).map(([name,count])=><div key={name}><b>{name}</b><span>{count.toLocaleString("pt-BR")}</span></div>)}
        </div>
      </div>
      {audit.warnings.length>0&&<div className="panel" style={{marginTop:12,padding:12}}><b>Pontos de atenção</b>{audit.warnings.map((w,i)=><p key={i} style={{margin:"6px 0"}}>• {w}</p>)}</div>}
      <div className="panel" style={{marginTop:12,padding:12}}>
        <b>03 · Dry-run</b>
        <p style={{margin:"6px 0",color:"var(--muted)"}}>Simulação somente leitura: verifica conflitos com o banco atual e estima o que será criado, encontrado e preservado.</p>
        <button className="primary" disabled={!audit.readyForDryRun||!records||busy} onClick={executeDryRun}>{busy?"Executando...":"Executar dry-run"}</button>
      </div>
    </div>}

    {dryRun&&<div className="panel">
      <div className="panel-heading"><div><h2>Resultado do dry-run</h2><p>Fingerprint: <code>{dryRun.fingerprint}</code></p></div><b>{dryRun.safe?"✓ SOMENTE LEITURA":"⚠ REVISAR"}</b></div>
      <div className="settings-grid">
        <div className="settings-list">
          <div><b>Registros</b><span>{dryRun.total.toLocaleString("pt-BR")}</span></div>
          <div><b>Coleções</b><span>{dryRun.collections}</span></div>
          <div><b>Conflitos com legado</b><span>{dryRun.legacyConflicts}</span></div>
          <div><b>Registros preservados</b><span>{dryRun.plan.preservedLegacyRecords.toLocaleString("pt-BR")}</span></div>
        </div>
        <div className="settings-list">
          <div><b>Categorias</b><span>{dryRun.plan.categories.existing} existentes · {dryRun.plan.categories.create} novas</span></div>
          <div><b>Fornecedores</b><span>{dryRun.plan.suppliers.existing} existentes · {dryRun.plan.suppliers.create} novos</span></div>
          <div><b>Usuários</b><span>{dryRun.plan.users.existing} existentes · {dryRun.plan.users.create} novos</span></div>
          <div><b>Meios de pagamento</b><span>{dryRun.plan.paymentMethods.existing} existentes · {dryRun.plan.paymentMethods.create} novos</span></div>
          <div><b>Clientes</b><span>{dryRun.plan.customers.existing} encontrados · {dryRun.plan.customers.create} novos</span></div>
          <div><b>Produtos</b><span>{dryRun.plan.products.existing} encontrados · {dryRun.plan.products.create} novos</span></div>
        </div>
      </div>
      <div className="settings-list" style={{marginTop:12}}>
        <div><b>Pedidos</b><span>{dryRun.plan.orders}</span></div>
        <div><b>Vendas</b><span>{dryRun.plan.sales}</span></div>
        <div><b>Contas a receber</b><span>{dryRun.plan.receivableAccounts}</span></div>
        <div><b>Contas a pagar</b><span>{dryRun.plan.payableAccounts}</span></div>
        <div><b>Lotes</b><span>{dryRun.plan.lots}</span></div>
        <div><b>Movimentações</b><span>{dryRun.plan.movements}</span></div>
      </div>
      {dryRun.warnings.length>0&&<div className="panel" style={{marginTop:12,padding:12}}><b>Pontos de atenção</b>{dryRun.warnings.map((w,i)=><p key={i} style={{margin:"6px 0"}}>• {w}</p>)}</div>}
      <div className="panel" style={{marginTop:12,padding:12}}><b>04 · Importação definitiva</b><p style={{margin:"6px 0",color:"var(--muted)"}}>{dryRun.note}</p><p style={{margin:"6px 0",color:"var(--muted)"}}>Só é liberada quando o dry-run estiver seguro, sem conflitos com o legado e sem alertas.</p><button className="primary" disabled={!dryRun.safe||busy} onClick={executeImport} style={{marginTop:8}}>{busy?"Importando...":"Executar importação definitiva"}</button>{!dryRun.safe&&<p style={{margin:"8px 0 0",color:"var(--muted)",fontSize:12}}>Importação bloqueada até que todas as validações estejam sem alertas.</p>}</div>
    </div>}

    <div className="panel">
      <h2>Protocolo de migração</h2>
      <div className="settings-list">
        <div><b>01 · Backup oficial</b><span>Preservar o arquivo original sem alterações.</span></div>
        <div><b>02 · Auditoria</b><span>Validar contagem, coleções, duplicidades e fingerprint.</span></div>
        <div><b>03 · Dry-run</b><span>Simular mapeamentos sem alterar dados operacionais.</span></div>
        <div><b>04 · Importação transacional</b><span>Gravar em uma transação e preservar cada registro legado.</span></div>
        <div><b>05 · Reconciliação</b><span>Comparar fonte, legado e destino e gerar divergências.</span></div>
        <div><b>06 · Aprovação</b><span>Somente com divergências zero liberar a migração definitiva.</span></div>
      </div>
    </div>
  </section>
}
