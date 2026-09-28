"use client";

import { useEffect, useState } from "react";

type Audit = {
  source:string; fingerprint:string; total:number; collections:number; collectionCounts:Record<string,number>;
  duplicateKeys:number; warnings:string[]; readyForDryRun:boolean; note:string;
};
type Run = {id:string;status:string;total:number;imported:number;mapped:number;warnings:number;errors:number;startedAt:string;completedAt:string|null;report:any};

export default function Page(){
  const [file,setFile]=useState<File|null>(null);
  const [audit,setAudit]=useState<Audit|null>(null);
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
    setBusy(true);setMessage("");setAudit(null);
    try{
      const text=await file.text();
      let records:unknown;
      try{records=JSON.parse(text)}catch{throw new Error("O arquivo não é um JSON válido.");}
      if(!Array.isArray(records)) throw new Error("O backup precisa ser uma lista JSON.");
      const r=await fetch("/api/migration",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Falha na auditoria.");
      setAudit(d.audit);
      setMessage(d.audit.readyForDryRun?"Auditoria inicial aprovada para o dry-run.":"Auditoria encontrou pontos que precisam ser verificados antes do dry-run.");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao auditar backup.");}
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
        <input type="file" accept=".json,application/json" onChange={e=>{setFile(e.target.files?.[0]||null);setAudit(null)}}/>
        <button className="primary" disabled={!file||busy} onClick={auditBackup} style={{marginTop:10}}>{busy?"Auditando...":"Auditar backup"}</button>
        <div className="settings-list" style={{marginTop:14}}>
          <div><b>Fonte</b><span>BeepStart</span></div>
          <div><b>Referência</b><span>5.785 registros · 30 coleções</span></div>
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
          <div><b>Registros</b><span>{audit.total.toLocaleString("pt-BR")} / 5.785</span></div>
          <div><b>Coleções</b><span>{audit.collections} / 30</span></div>
          <div><b>Chaves duplicadas</b><span>{audit.duplicateKeys}</span></div>
        </div>
        <div className="settings-list">
          {Object.entries(audit.collectionCounts).map(([name,count])=><div key={name}><b>{name}</b><span>{count.toLocaleString("pt-BR")}</span></div>)}
        </div>
      </div>
      {audit.warnings.length>0&&<div className="panel" style={{marginTop:12,padding:12}}><b>Pontos de atenção</b>{audit.warnings.map((w,i)=><p key={i} style={{margin:"6px 0"}}>• {w}</p>)}</div>}
      <div className="panel" style={{marginTop:12,padding:12}}><b>Próxima etapa</b><p style={{margin:"6px 0",color:"var(--muted)"}}>Após auditoria limpa, o próximo passo é executar o dry-run do importador no ambiente controlado. A importação definitiva permanece bloqueada até a reconciliação e aprovação.</p></div>
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
