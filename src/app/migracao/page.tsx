"use client";

import { useEffect, useState } from "react";

type Audit = {
  source:string; fingerprint:string; total:number; collections:number;
  collectionCounts:Record<string,number>; duplicateKeys:number; warnings:string[];
};
type LegacyRow = {
  id:string; collectionKey:string|null; legacyId:string|null; legacyKey:string;
  payload:Record<string,unknown>; status:string; importedAt:string; matchedCustomer?:{id:string;name:string}|null;
};
type Run = {
  id:string; source:string; sourceFingerprint:string; status:string; total:number;
  imported:number; mapped:number; warnings:number; errors:number;
  startedAt:string; completedAt:string|null;
};
type Current = {customers:number;activeCustomers:number;products:number;activeProducts:number};

function firstValue(payload:Record<string,unknown>, keys:string[]) {
  for (const key of keys) {
    const value=payload[key];
    if(value!==undefined && value!==null && String(value).trim()!=="") return String(value);
  }
  return "";
}
function recordSummary(row:LegacyRow) {
  const p=row.payload||{};
  return {
    name:firstValue(p,["nome","name","razaoSocial","razãoSocial","descricao","description"]),
    document:firstValue(p,["cpf","cpfCnpj","cnpj","documento"]),
    phone:firstValue(p,["telefone","phone","celular","whatsapp"]),
    email:firstValue(p,["email","eMail"]),
    code:firstValue(p,["codigo","code","barcode","codigoBarras","id"])
  };
}

export default function Page(){
  const [file,setFile]=useState<File|null>(null);
  const [records,setRecords]=useState<Record<string,unknown>[]|null>(null);
  const [audit,setAudit]=useState<Audit|null>(null);
  const [runs,setRuns]=useState<Run[]>([]);
  const [legacyStored,setLegacyStored]=useState(0);
  const [current,setCurrent]=useState<Current|null>(null);
  const [q,setQ]=useState("");
  const [collection,setCollection]=useState("");
  const [results,setResults]=useState<LegacyRow[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [selected,setSelected]=useState<LegacyRow|null>(null);

  async function load(){
    try{
      const r=await fetch("/api/migration",{cache:"no-store"});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Não foi possível carregar a central.");
      setRuns(d.runs||[]); setLegacyStored(d.legacyStored||0); setCurrent(d.current||null);
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao carregar a central.");}
  }

  async function auditBackup(){
    if(!file)return;
    setBusy(true);setMessage("");setAudit(null);setRecords(null);
    try{
      const parsed=JSON.parse(await file.text());
      if(!Array.isArray(parsed)) throw new Error("O backup precisa ser uma lista JSON.");
      setRecords(parsed);
      const r=await fetch("/api/migration",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records:parsed})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Falha na auditoria.");
      setAudit(d.audit); setMessage("Backup auditado. Nenhum dado operacional foi alterado.");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao auditar backup.");}
    finally{setBusy(false);}
  }

  async function archiveLegacy(){
    if(!records||!audit)return;
    if(!window.confirm("CONFIRMAR ARQUIVAMENTO DO LEGADO\n\nO backup será armazenado somente para consulta histórica. Nenhum dado operacional será criado ou alterado.\n\nContinuar?")) return;
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/migration/legacy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records,fingerprint:audit.fingerprint})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Falha ao arquivar o legado.");
      setMessage(d.message); await load(); await searchLegacy();
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao arquivar o legado.");}
    finally{setBusy(false);}
  }

  async function importCustomer(row:LegacyRow){
    if((row.collectionKey||"").toLowerCase()!=="cliente") return;
    const s=recordSummary(row);
    if(!window.confirm("ENVIAR CLIENTE PARA O CADASTRO DO MB ÓPTICA?\n\n"+(s.name||"Cliente legado")+"\n"+(s.document?"CPF/CNPJ: "+s.document+"\n":"")+"\nO registro histórico será preservado.")) return;
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/migration/legacy/import-customer",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({legacyRecordId:row.id})});
      const d=await r.json(); if(!r.ok) throw new Error(d.error||"Não foi possível enviar o cliente ao cadastro.");
      setMessage(d.message); await searchLegacy();
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao importar cliente.");}
    finally{setBusy(false);}
  }

  async function searchLegacy(){
    try{
      const params=new URLSearchParams();
      if(q.trim())params.set("q",q.trim());
      if(collection.trim())params.set("collection",collection.trim());
      params.set("take","100");
      const r=await fetch("/api/migration/legacy?"+params.toString(),{cache:"no-store"});
      const d=await r.json(); if(!r.ok) throw new Error(d.error||"Falha na consulta.");
      setResults(d.records||[]);
    }catch(e){setMessage(e instanceof Error?e.message:"Erro na consulta ao legado.");}
  }

  useEffect(()=>{load();searchLegacy();},[]);
  const collections=[...new Set(results.map(r=>r.collectionKey).filter(Boolean) as string[])].sort();

  return <section className="page">
    <div className="page-heading">
      <div>
        <span className="eyebrow">ADMINISTRAÇÃO</span>
        <h1>Central de Legado BeepStart</h1>
        <p>Consulta histórica e reconciliação segura. Os números abaixo são lidos diretamente do banco atual.</p>
      </div>
      <div className="settings-status"><b>● Protegida</b><span>Somente administração</span></div>
    </div>

    {message&&<div className="panel settings-message">{message}</div>}

    <div className="panel" style={{marginBottom:16}}>
      <div className="panel-heading">
        <div><span className="eyebrow">BASE ATUAL</span><h2>Estado do MB Óptica</h2><p>Informação dinâmica; não há contagens fixas nesta tela.</p></div>
        <button className="secondary" onClick={load}>Atualizar</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10}}>
        {[
          ["Clientes",current?.customers ?? "—"],
          ["Clientes ativos",current?.activeCustomers ?? "—"],
          ["Produtos",current?.products ?? "—"],
          ["Produtos ativos",current?.activeProducts ?? "—"]
        ].map(([label,value])=><div key={String(label)} style={{border:"1px solid var(--line)",borderRadius:12,padding:14}}>
          <small style={{display:"block",color:"var(--muted)",marginBottom:6}}>{String(label)}</small>
          <strong style={{fontSize:24}}>{typeof value==="number"?value.toLocaleString("pt-BR"):value}</strong>
        </div>)}
      </div>
    </div>

    <div className="panel" style={{marginBottom:16}}>
      <div className="panel-heading">
        <div><span className="eyebrow">PRÓXIMO BACKUP</span><h2>Reconciliação incremental segura</h2><p>Use esta área para inserir um novo backup sem substituir Clientes ou Produtos existentes.</p></div>
        <a className="primary" href="/migracao/segura">Abrir Central Segura</a>
      </div>
      <div className="settings-list">
        <div><b>Clientes existentes</b><span>Preservados</span></div>
        <div><b>Produtos existentes</b><span>Preservados</span></div>
        <div><b>Histórico do BeepStart</b><span>Preservado</span></div>
        <div><b>Backup repetido</b><span>Bloqueado por fingerprint</span></div>
      </div>
    </div>

    <div className="settings-grid">
      <div className="panel">
        <div className="panel-heading"><div><span className="eyebrow">LEGADO</span><h2>Arquivar novo backup</h2><p>Audite e preserve o arquivo como histórico, sem alterar a operação.</p></div></div>
        <input type="file" accept=".json,.txt,application/json,text/plain" onChange={e=>{setFile(e.target.files?.[0]||null);setRecords(null);setAudit(null)}}/>
        <button className="primary" disabled={!file||busy} onClick={auditBackup} style={{marginTop:10}}>{busy?"Processando...":"Auditar backup"}</button>
        <div className="settings-list" style={{marginTop:14}}>
          <div><b>Registros históricos</b><span>{legacyStored.toLocaleString("pt-BR")}</span></div>
          <div><b>Arquivamentos</b><span>{runs.length}</span></div>
          <div><b>Modo</b><span>Somente leitura</span></div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-heading"><div><span className="eyebrow">CONSULTA</span><h2>Pesquisar legado</h2><p>Localize registros preservados sem alterar o histórico.</p></div><button className="secondary" onClick={searchLegacy}>Pesquisar</button></div>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10}}>
          <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")searchLegacy()}} placeholder="Nome, CPF, código, descrição ou ID..." />
          <input value={collection} onChange={e=>setCollection(e.target.value)} placeholder="Coleção (ex.: Cliente)" list="legacy-collections"/>
        </div>
        <datalist id="legacy-collections">{collections.map(c=><option key={c} value={c}/>)}</datalist>
      </div>
    </div>

    {audit&&<div className="panel" style={{marginTop:16}}>
      <div className="panel-heading"><div><h2>Auditoria do backup</h2><p>Fingerprint: <code>{audit.fingerprint}</code></p></div><b>{audit.duplicateKeys===0?"✓ ESTRUTURA VÁLIDA":"⚠ REVISAR DUPLICIDADES"}</b></div>
      <div className="settings-grid">
        <div className="settings-list">
          <div><b>Registros</b><span>{audit.total.toLocaleString("pt-BR")}</span></div>
          <div><b>Coleções</b><span>{audit.collections}</span></div>
          <div><b>Chaves duplicadas</b><span>{audit.duplicateKeys}</span></div>
        </div>
        <div className="settings-list">
          {Object.entries(audit.collectionCounts).map(([name,count])=><div key={name}><b>{name}</b><span>{count.toLocaleString("pt-BR")}</span></div>)}
        </div>
      </div>
      {audit.warnings.length>0&&<div style={{marginTop:12,padding:12,borderRadius:10,background:"#f7f9fb",color:"var(--muted)"}}><b>Pontos de atenção</b>{audit.warnings.map((w,i)=><p key={i} style={{margin:"6px 0"}}>• {w}</p>)}</div>}
      <div style={{marginTop:12,padding:12,borderRadius:10,background:"#f7f9fb"}}><b>Arquivamento</b><p style={{margin:"6px 0",color:"var(--muted)"}}>Cria somente registros históricos em LegacyRecord.</p><button className="primary" disabled={!records||busy||audit.duplicateKeys>0} onClick={archiveLegacy}>{busy?"Arquivando...":"Arquivar no Legado"}</button></div>
    </div>}

    {results.length>0&&<div className="panel" style={{marginTop:16}}>
      <div className="panel-heading"><div><h2>Resultados</h2><p>{results.length.toLocaleString("pt-BR")} registros encontrados.</p></div></div>
      <div className="table">
        <div className="row header"><span>Informação</span><span>Documento / contato</span><span>ID legado</span><span>Ação</span></div>
        {results.map(row=>{const s=recordSummary(row);const isCustomer=(row.collectionKey||"").toLowerCase()==="cliente";const matched=row.matchedCustomer;return <div className="row" key={row.id}>
          <span><strong>{s.name||row.collectionKey||"Registro legado"}</strong><small style={{display:"block",color:"var(--muted)"}}>{row.collectionKey||"—"}{s.code?" · Código "+s.code:""}</small>{isCustomer&&matched&&<small style={{display:"block",color:"#087f73",fontWeight:700}}>✓ Já localizado no MB Óptica · {matched.name}</small>}</span>
          <span>{s.document||"—"}{s.phone&&<small style={{display:"block",color:"var(--muted)"}}>{s.phone}</small>}{s.email&&<small style={{display:"block",color:"var(--muted)"}}>{s.email}</small>}</span>
          <span><code>{row.legacyId||"—"}</code></span>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}><button className="secondary" onClick={()=>setSelected(row)}>Ver detalhes</button>{isCustomer&&<button className="primary" disabled={busy||!!matched} onClick={()=>importCustomer(row)}>{matched?"Já cadastrado":"Usar no cadastro"}</button>}</div>
        </div>})}
      </div>
    </div>}

    {selected&&<div className="panel" style={{marginTop:16}}><div className="panel-heading"><div><h2>Registro legado</h2><p>{selected.collectionKey} · {selected.legacyId||"sem ID"}</p></div><button className="secondary" onClick={()=>setSelected(null)}>Fechar</button></div><pre style={{whiteSpace:"pre-wrap",overflow:"auto",maxHeight:420,margin:0,fontSize:12}}>{JSON.stringify(selected.payload,null,2)}</pre></div>}

    {runs.length>0&&<div className="panel" style={{marginTop:16}}><div className="panel-heading"><div><h2>Arquivamentos recentes</h2><p>Últimas fontes preservadas.</p></div><button className="secondary" onClick={load}>Atualizar</button></div><div className="table"><div className="row header"><span>Status</span><span>Fonte</span><span>Total</span><span>Fingerprint</span><span>Data</span></div>{runs.map(r=><div className="row" key={r.id}><strong>{r.status}</strong><span>{r.source}</span><span>{r.total.toLocaleString("pt-BR")}</span><code style={{fontSize:10}}>{r.sourceFingerprint.slice(0,16)}…</code><span>{new Date(r.startedAt).toLocaleString("pt-BR")}</span></div>)}</div></div>}
  </section>;
}
