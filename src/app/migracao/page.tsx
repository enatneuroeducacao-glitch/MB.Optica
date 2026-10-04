"use client";

import { useEffect, useState } from "react";

type Audit = {
  source:string;
  fingerprint:string;
  total:number;
  collections:number;
  collectionCounts:Record<string,number>;
  duplicateKeys:number;
  warnings:string[];
};
type LegacyRow = {
  id:string;
  collectionKey:string|null;
  legacyId:string|null;
  legacyKey:string;
  payload:Record<string,unknown>;
  status:string;
  importedAt:string;
  matchedCustomer?:{id:string;name:string}|null;
};
type FinancialMonth = { month:string; sales:number; billing:number; received:number; receivable:number; payable:number };
type FinancialSummary = {
  archivedRecords:number; salesCount:number; billing:number; received:number; receivable:number; payable:number;
  payablePaid:number; receivableAccounts:number; payableAccounts:number; months:FinancialMonth[];
};
type Run = {
  id:string; source:string; sourceFingerprint:string; status:string; total:number; imported:number; mapped:number;
  warnings:number; errors:number; startedAt:string; completedAt:string|null;
};
type Operational = { customerTotal:number; activeCustomers:number; productTotal:number; activeProducts:number };
type MigrationOption = {
  key:"CLIENTES"|"PRODUTOS"|"FATURAMENTO";
  label:string;
  source:string;
  completed:boolean;
  blocked:boolean;
  run?:{id:string;total:number;completedAt:string|null}|null;
};

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
    code:firstValue(p,["codigo","code","barcode","codigoBarras","id"]),
  };
}

const money=(v:number)=>`R$ ${Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

export default function Page(){
  const [file,setFile]=useState<File|null>(null);
  const [records,setRecords]=useState<Record<string,unknown>[]|null>(null);
  const [audit,setAudit]=useState<Audit|null>(null);
  const [runs,setRuns]=useState<Run[]>([]);
  const [legacyStored,setLegacyStored]=useState(0);
  const [operational,setOperational]=useState<Operational|null>(null);
  const [q,setQ]=useState("");
  const [collection,setCollection]=useState("");
  const [results,setResults]=useState<LegacyRow[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [selected,setSelected]=useState<LegacyRow|null>(null);
  const [financial,setFinancial]=useState<FinancialSummary|null>(null);
  const [migrationOptions,setMigrationOptions]=useState<MigrationOption[]>([]);

  async function load(){
    try{
      const r=await fetch("/api/migration",{cache:"no-store"});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Não foi possível carregar a central.");
      setRuns(d.runs||[]);
      setMigrationOptions(d.migrationOptions||[]);
      setLegacyStored(d.legacyStored||0);
      setOperational(d.operational||null);
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao carregar a central.");}
  }

  async function loadFinancialSummary(){
    try{
      const r=await fetch("/api/migration/financial-summary",{cache:"no-store"});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Não foi possível calcular o resumo financeiro.");
      setFinancial(d);
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao carregar o resumo financeiro.");}
  }

  async function searchLegacy(){
    try{
      const params=new URLSearchParams();
      if(q.trim())params.set("q",q.trim());
      if(collection.trim())params.set("collection",collection.trim());
      params.set("take","100");
      const r=await fetch("/api/migration/legacy?"+params.toString(),{cache:"no-store"});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Falha na consulta.");
      setResults(d.records||[]);
    }catch(e){setMessage(e instanceof Error?e.message:"Erro na consulta ao legado.");}
  }

  useEffect(()=>{load();loadFinancialSummary();searchLegacy();},[]);

  async function auditBackup(){
    if(!file)return;
    setBusy(true);setMessage("");setAudit(null);setRecords(null);
    try{
      const parsed=JSON.parse(await file.text());
      if(!Array.isArray(parsed)) throw new Error("O backup precisa ser uma lista JSON.");
      const nextRecords=parsed as Record<string,unknown>[];
      const r=await fetch("/api/migration",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records:nextRecords})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Falha na auditoria.");
      setRecords(nextRecords);setAudit(d.audit);
      setMessage("Backup auditado. Nenhum dado operacional foi alterado.");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao auditar backup.");}
    finally{setBusy(false);}
  }

  async function archiveLegacy(){
    if(!records||!audit)return;
    if(!window.confirm("CONFIRMAR ARQUIVAMENTO\n\nO backup será preservado somente para consulta histórica. Nenhum cliente, produto, venda, estoque ou financeiro será alterado.\n\nContinuar?")) return;
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/migration/legacy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records,fingerprint:audit.fingerprint})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Falha ao arquivar o legado.");
      setMessage(d.message||"Backup arquivado como legado.");
      await load(); await searchLegacy();
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao arquivar o legado.");}
    finally{setBusy(false);}
  }

  async function importCustomer(row:LegacyRow){
    const summary=recordSummary(row);
    if((row.collectionKey||"").toLowerCase()!=="cliente") return;
    if(!window.confirm("ENVIAR CLIENTE PARA O CADASTRO DO MB ÓPTICA?\n\n"+(summary.name||"Cliente legado")+"\n"+(summary.document?"CPF/CNPJ: "+summary.document+"\n":"")+"\nO histórico do BeepStart continuará preservado.")) return;
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/migration/legacy/import-customer",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({legacyRecordId:row.id})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Não foi possível enviar o cliente ao cadastro.");
      setMessage(d.message||"Cliente enviado para o cadastro.");
      await searchLegacy();
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao importar cliente.");}
    finally{setBusy(false);}
  }

  const collections=[...new Set(results.map(r=>r.collectionKey).filter(Boolean) as string[])].sort();

  return <section className="page">
    <div className="page-heading">
      <div>
        <span className="eyebrow">ADMINISTRAÇÃO · DADOS E LEGADO</span>
        <h1>Central de Migração</h1>
        <p>O legado BeepStart permanece separado da operação atual. Primeiro analisamos; depois preservamos; somente uma reconciliação confirmada pode alterar o cadastro operacional.</p>
      </div>
      <div className="settings-status"><b>● PROTEGIDA</b><span>Leitura por padrão</span></div>
    </div>

    {message&&<div className="panel settings-message">{message}</div>}

    <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10,marginBottom:16}}>
      {[
        ["Clientes atuais",operational?.customerTotal??"—",operational?operational.activeCustomers+" ativos":"", "current"],
        ["Produtos atuais",operational?.productTotal??"—",operational?operational.activeProducts+" ativos":"", "current"],
        ["Registros no legado",legacyStored.toLocaleString("pt-BR"),"somente leitura","legacy"],
        ["Execuções",runs.length,"histórico de processos","history"],
      ].map(([label,value,sub])=>
        <div key={String(label)} className="panel" style={{margin:0,padding:16}}>
          <small style={{display:"block",color:"var(--muted)",marginBottom:6}}>{String(label)}</small>
          <strong style={{display:"block",fontSize:25,color:"#17324d"}}>{String(value)}</strong>
          <span style={{fontSize:12,color:"var(--muted)"}}>{String(sub)}</span>
        </div>
      )}
    </div>

    <div className="panel" style={{marginBottom:16}}>
      <div className="panel-heading">
        <div>
          <span className="eyebrow">MIGRAÇÃO CONTROLADA</span>
          <h2>Escolha o que será migrado</h2>
          <p>Cada tipo de migração possui seu próprio controle. Depois de concluída, a mesma migração fica bloqueada para evitar duplicidade.</p>
        </div>
        <b>● CONTROLE DE DUPLICIDADE</b>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:12}}>
        {([
          ["CLIENTES","Somente clientes","Clientes do BeepStart → cadastro MB","/migracao/segura?tipo=CLIENTES"],
          ["PRODUTOS","Somente produtos","Produtos do BeepStart → cadastro e estoque MB","/migracao/segura?tipo=PRODUTOS"],
          ["FATURAMENTO","Somente faturamento","Vendas históricas e seus vínculos financeiros",""]
        ] as const).map(([key,title,description,href])=>{
          const option=migrationOptions.find(x=>x.key===key);
          const completed=Boolean(option?.completed);
          const available=key!=="FATURAMENTO";
          return <div key={key} style={{border:"1px solid var(--line)",borderRadius:14,padding:16,background:completed?"#f7f7f7":"#fff"}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"flex-start"}}>
              <div><span className="eyebrow">{key}</span><h3 style={{margin:"4px 0 6px"}}>{title}</h3></div>
              <span style={{fontSize:11,fontWeight:800,color:completed?"#7b1e1e":available?"#087f73":"#9a6500"}}>{completed?"🔒 CONCLUÍDA / BLOQUEADA":available?"● DISPONÍVEL":"EM PREPARAÇÃO"}</span>
            </div>
            <p style={{fontSize:13,color:"var(--muted)",minHeight:42}}>{description}</p>
            {completed&&option?.run?.completedAt&&<small style={{display:"block",color:"var(--muted)",marginBottom:8}}>Concluída em {new Date(option.run.completedAt).toLocaleString("pt-BR")}</small>}
            {available&&!completed
              ? <a className="primary" href={href}>Abrir migração</a>
              : <button className="secondary" disabled>{completed?"Migração bloqueada":"Importador em preparação"}</button>}
          </div>;
        })}
      </div>
      <div style={{marginTop:12,padding:12,borderRadius:10,background:"#fff8e8",fontSize:12}}>
        <b>Regra de segurança:</b> concluir uma migração registra sua execução no banco. Uma nova tentativa do mesmo tipo é recusada pelo servidor, mesmo que alguém tente contornar a interface.
      </div>
    </div>

    <div className="panel" style={{marginBottom:16,borderLeft:"4px solid #087f73"}}>
      <div className="panel-heading">
        <div>
          <span className="eyebrow">PRÓXIMO BACKUP</span>
          <h2>Reconciliação incremental segura</h2>
          <p>O novo BeepStart será analisado sem gravação. A inclusão só acontece depois da prévia e de uma confirmação explícita.</p>
        </div>
        <a className="primary" href="/migracao/segura">Abrir Central Segura</a>
      </div>
      <div className="settings-list">
        <div><b>Clientes existentes</b><span>preservados</span></div>
        <div><b>Produtos existentes</b><span>preservados</span></div>
        <div><b>Histórico BeepStart</b><span>mantido separadamente</span></div>
        <div><b>Gravação</b><span>somente após confirmação</span></div>
      </div>
    </div>

    <div className="settings-grid">
      <div className="panel">
        <div className="panel-heading">
          <div><span className="eyebrow">ARQUIVO HISTÓRICO</span><h2>Auditar e preservar</h2><p>Use esta área para armazenar um backup como legado somente leitura.</p></div>
        </div>
        <input type="file" accept=".json,.txt,application/json,text/plain" onChange={e=>{setFile(e.target.files?.[0]||null);setRecords(null);setAudit(null);}}/>
        <button className="primary" disabled={!file||busy} onClick={auditBackup} style={{marginTop:10}}>{busy?"Processando...":"Auditar backup"}</button>
        {audit&&<div className="settings-list" style={{marginTop:14}}>
          <div><b>Registros</b><span>{audit.total.toLocaleString("pt-BR")}</span></div>
          <div><b>Coleções</b><span>{audit.collections}</span></div>
          <div><b>Duplicidades estruturais</b><span>{audit.duplicateKeys}</span></div>
          <div><b>Fingerprint</b><code>{audit.fingerprint.slice(0,20)}…</code></div>
        </div>}
        {audit&&<button className="secondary" disabled={!records||busy||audit.duplicateKeys>0} onClick={archiveLegacy} style={{marginTop:10}}>Arquivar como legado</button>}
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div><span className="eyebrow">REGRA OPERACIONAL</span><h2>Separação de bases</h2><p>O BeepStart não é a fonte automática da operação atual.</p></div>
        </div>
        <div className="settings-list">
          <div><b>Clientes</b><span>consulta histórica</span></div>
          <div><b>Vendas</b><span>consulta histórica</span></div>
          <div><b>Ordens</b><span>consulta histórica</span></div>
          <div><b>Produtos / estoque</b><span>consulta histórica</span></div>
          <div><b>Financeiro</b><span>consulta histórica</span></div>
          <div><b>Alterações</b><span>bloqueadas por padrão</span></div>
        </div>
      </div>
    </div>

    {audit&&<div className="panel" style={{marginTop:16}}>
      <div className="panel-heading">
        <div><span className="eyebrow">AUDITORIA</span><h2>Detalhes do backup</h2><p>{audit.source} · {audit.fingerprint}</p></div>
        <b>{audit.duplicateKeys===0?"✓ ESTRUTURA VÁLIDA":"⚠ REVISAR"}</b>
      </div>
      <div className="settings-grid">
        <div className="settings-list">{Object.entries(audit.collectionCounts).map(([name,count])=><div key={name}><b>{name}</b><span>{count.toLocaleString("pt-BR")}</span></div>)}</div>
        <div>
          {audit.warnings.length>0
            ? <div style={{padding:14,borderRadius:10,background:"#fff8e8"}}><b>Pontos de atenção</b>{audit.warnings.map((w,i)=><p key={i} style={{margin:"7px 0"}}>• {w}</p>)}</div>
            : <div style={{padding:14,borderRadius:10,background:"#f1faf8",color:"#087f73"}}><b>✓ Nenhum alerta estrutural.</b><p style={{margin:"6px 0 0"}}>O arquivo pode ser preservado como histórico.</p></div>}
        </div>
      </div>
    </div>}

    <div className="panel" style={{marginTop:16}}>
      <div className="panel-heading">
        <div><span className="eyebrow">PESQUISA HISTÓRICA</span><h2>Consultar legado</h2><p>Pesquise registros arquivados sem alterar a base operacional.</p></div>
        <button className="secondary" onClick={searchLegacy}>Pesquisar</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10}}>
        <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")searchLegacy()}} placeholder="Nome, CPF, telefone, código, descrição ou ID..." />
        <input value={collection} onChange={e=>setCollection(e.target.value)} placeholder="Coleção (ex.: Cliente)" list="legacy-collections"/>
      </div>
      <datalist id="legacy-collections">{collections.map(c=><option key={c} value={c}/>)}</datalist>

      {results.length===0
        ? <p style={{color:"var(--muted)",marginTop:14}}>Nenhum registro encontrado.</p>
        : <div className="table" style={{marginTop:14}}>
          <div className="row header"><span>Registro</span><span>Documento / contato</span><span>ID</span><span>Ação</span></div>
          {results.map(row=>{
            const s=recordSummary(row);
            const isCustomer=(row.collectionKey||"").toLowerCase()==="cliente";
            const matched=row.matchedCustomer;
            return <div className="row" key={row.id}>
              <span><strong>{s.name||row.collectionKey||"Registro legado"}</strong><small style={{display:"block",color:"var(--muted)"}}>{row.collectionKey||"—"}{s.code?" · "+s.code:""}</small>{matched&&<small style={{display:"block",color:"#087f73",fontWeight:700}}>✓ Correspondência no MB · {matched.name}</small>}</span>
              <span>{s.document||"—"}{s.phone&&<small style={{display:"block",color:"var(--muted)"}}>{s.phone}</small>}{s.email&&<small style={{display:"block",color:"var(--muted)"}}>{s.email}</small>}</span>
              <span><code>{row.legacyId||"—"}</code></span>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}><button className="secondary" onClick={()=>setSelected(row)}>Detalhes</button>{isCustomer&&<button className="primary" disabled={busy||!!matched} onClick={()=>importCustomer(row)}>{matched?"Já cadastrado":"Usar no cadastro"}</button>}</div>
            </div>;
          })}
        </div>}
    </div>

    {selected&&<div className="panel" style={{marginTop:16}}>
      <div className="panel-heading"><div><span className="eyebrow">REGISTRO</span><h2>Detalhes do legado</h2><p>{selected.collectionKey} · {selected.legacyId||"sem ID"}</p></div><button className="secondary" onClick={()=>setSelected(null)}>Fechar</button></div>
      <pre style={{whiteSpace:"pre-wrap",overflow:"auto",maxHeight:460,margin:0,fontSize:12}}>{JSON.stringify(selected.payload,null,2)}</pre>
    </div>}

    <details className="panel" style={{marginTop:16}}>
      <summary style={{cursor:"pointer",fontWeight:800}}>Resumo financeiro do legado</summary>
      {!financial ? <p style={{color:"var(--muted)",marginTop:12}}>Carregando...</p> :
        <div style={{marginTop:14}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:10}}>
            {[
              ["Faturamento",money(financial.billing)],
              ["Vendas",financial.salesCount.toLocaleString("pt-BR")],
              ["Recebido",money(financial.received)],
              ["A receber",money(financial.receivable)],
              ["A pagar",money(financial.payable)],
            ].map(([label,value])=><div key={String(label)} style={{border:"1px solid var(--line)",borderRadius:12,padding:12}}><small style={{display:"block",color:"var(--muted)"}}>{label}</small><strong style={{fontSize:19}}>{value}</strong></div>)}
          </div>
          <button className="secondary" onClick={loadFinancialSummary} style={{marginTop:12}}>Atualizar resumo</button>
        </div>}
    </details>

    <div className="panel" style={{marginTop:16}}>
      <div className="panel-heading"><div><span className="eyebrow">HISTÓRICO</span><h2>Arquivamentos</h2><p>Fontes preservadas e execuções registradas.</p></div><button className="secondary" onClick={load}>Atualizar</button></div>
      {runs.length===0?<p style={{color:"var(--muted)"}}>Nenhum backup arquivado.</p>:
        <div className="table"><div className="row header"><span>Status</span><span>Fonte</span><span>Total</span><span>Fingerprint</span><span>Data</span></div>
          {runs.map(r=><div className="row" key={r.id}><strong>{r.status}</strong><span>{r.source}</span><span>{r.total.toLocaleString("pt-BR")}</span><code style={{fontSize:10}}>{r.sourceFingerprint.slice(0,16)}…</code><span>{new Date(r.startedAt).toLocaleString("pt-BR")}</span></div>)}
        </div>}
    </div>
  </section>;
}
