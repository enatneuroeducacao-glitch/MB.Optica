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
  const name=firstValue(p,["nome","name","razaoSocial","razãoSocial","descricao","description"]);
  const document=firstValue(p,["cpf","cpfCnpj","cnpj","documento"]);
  const phone=firstValue(p,["telefone","phone","celular","whatsapp"]);
  const email=firstValue(p,["email","eMail"]);
  const code=firstValue(p,["codigo","code","barcode","codigoBarras","id"]);
  return {name,document,phone,email,code};
}
type FinancialMonth = {
  month:string;
  sales:number;
  billing:number;
  received:number;
  receivable:number;
  payable:number;
};
type FinancialSummary = {
  archivedRecords:number;
  salesCount:number;
  billing:number;
  received:number;
  receivable:number;
  payable:number;
  payablePaid:number;
  receivableAccounts:number;
  payableAccounts:number;
  months:FinancialMonth[];
};

type Run = {
  id:string;
  source:string;
  sourceFingerprint:string;
  status:string;
  total:number;
  imported:number;
  mapped:number;
  warnings:number;
  errors:number;
  startedAt:string;
  completedAt:string|null;
};

export default function Page(){
  const [file,setFile]=useState<File|null>(null);
  const [records,setRecords]=useState<Record<string,unknown>[]|null>(null);
  const [audit,setAudit]=useState<Audit|null>(null);
  const [runs,setRuns]=useState<Run[]>([]);
  const [legacyStored,setLegacyStored]=useState(0);
  const [q,setQ]=useState("");
  const [collection,setCollection]=useState("");
  const [results,setResults]=useState<LegacyRow[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [selected,setSelected]=useState<LegacyRow|null>(null);
  const [financial,setFinancial]=useState<FinancialSummary|null>(null);
  const [stockProducts,setStockProducts]=useState<any[]>([]),[selectedStock,setSelectedStock]=useState<string[]>([]),[stockBusy,setStockBusy]=useState(false),[stockMessage,setStockMessage]=useState("");
  const [selectedLegacyProducts,setSelectedLegacyProducts]=useState<string[]>([]);

  async function load(){
    try{
      const r=await fetch("/api/migration",{cache:"no-store"});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Não foi possível carregar a central.");
      setRuns(d.runs||[]);
      setLegacyStored(d.legacyStored||0);
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

  useEffect(()=>{load();loadFinancialSummary();loadStockProducts();},[]);

  async function auditBackup(){
    if(!file)return;
    setBusy(true);setMessage("");setAudit(null);setRecords(null);
    try{
      const raw=await file.text();
      const parsed=JSON.parse(raw);
      if(!Array.isArray(parsed)) throw new Error("O backup precisa ser uma lista JSON.");
      const nextRecords=parsed as Record<string,unknown>[];
      const r=await fetch("/api/migration",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({records:nextRecords})
      });
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Falha na auditoria.");
      setRecords(nextRecords);
      setAudit(d.audit);
      setMessage("Backup auditado. O próximo passo é arquivá-lo como legado somente leitura.");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao auditar backup.");}
    finally{setBusy(false);}
  }

  async function archiveLegacy(){
    if(!records||!audit)return;
    if(!window.confirm(
      "CONFIRMAR ARQUIVAMENTO DO LEGADO\n\n"+
      "O backup será armazenado para consulta somente leitura. "+
      "Nenhum cliente, produto, venda, estoque ou financeiro será criado/alterado no banco operacional.\n\n"+
      "Campos de senha legados não serão armazenados no índice de consulta.\n\nContinuar?"
    )) return;
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/migration/legacy",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({records,fingerprint:audit.fingerprint})
      });
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Falha ao arquivar o legado.");
      setMessage(d.message);
      await load();
      await searchLegacy();
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao arquivar o legado.");}
    finally{setBusy(false);}
  }

  async function importCustomer(row:LegacyRow){
    if((row.collectionKey||"").toLowerCase()!=="cliente") return;
    const summary=recordSummary(row);
    if(!window.confirm(
      "ENVIAR CLIENTE PARA O CADASTRO DO MB ÓPTICA?\\n\\n"+
      (summary.name||"Cliente legado")+"\\n"+
      (summary.document?"CPF/CNPJ: "+summary.document+"\\n":"")+
      "\\nO sistema verificará se já existe cadastro com o mesmo CPF/CNPJ. "+
      "O registro do BeepStart continuará preservado como histórico."
    )) return;
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/migration/legacy/import-customer",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({legacyRecordId:row.id})
      });
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Não foi possível enviar o cliente ao cadastro.");
      setMessage(d.message);
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao importar cliente.");}
    finally{setBusy(false);}
  }

  async function loadStockProducts(){setStockBusy(true);setStockMessage("");try{const r=await fetch("/api/migration/legacy/products-stock",{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Não foi possível carregar os produtos com estoque.");setStockProducts(d.products||[]);setSelectedStock([]);setStockMessage((d.products||[]).length+" produto(s) com estoque disponível encontrado(s).")}catch(e){setStockMessage(e instanceof Error?e.message:"Erro ao carregar produtos com estoque.")}finally{setStockBusy(false)}}
  async function integrateSelectedLegacyProducts(){if(!selectedLegacyProducts.length)return;if(!window.confirm("Integrar os produtos selecionados para o MB Óptica?\\n\\nSomente produtos com estoque maior que zero serão integrados. Produtos sem estoque ou já cadastrados serão ignorados. O registro do BeepStart continuará preservado."))return;setStockBusy(true);setStockMessage("");try{const r=await fetch("/api/migration/legacy/products-stock",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({legacyRecordIds:selectedLegacyProducts})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Falha na integração.");setStockMessage(d.message);setSelectedLegacyProducts([]);await searchLegacy();await loadStockProducts()}catch(e){setStockMessage(e instanceof Error?e.message:"Erro na integração dos produtos.")}finally{setStockBusy(false)}}

  async function integrateStockProducts(){if(!selectedStock.length)return;if(!window.confirm("Integrar somente os produtos selecionados que possuem estoque no BeepStart?\n\nOs produtos serão criados no MB Óptica com uma entrada de estoque vinculada ao legado. Produtos já cadastrados serão ignorados."))return;setStockBusy(true);setStockMessage("");try{const r=await fetch("/api/migration/legacy/products-stock",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({legacyRecordIds:selectedStock})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Falha na integração.");setStockMessage(d.message);await loadStockProducts()}catch(e){setStockMessage(e instanceof Error?e.message:"Erro na integração dos produtos.")}finally{setStockBusy(false)}}

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
      setSelectedLegacyProducts([]);
    }catch(e){setMessage(e instanceof Error?e.message:"Erro na consulta ao legado.");}
  }

  const collections=[...new Set(results.map(r=>r.collectionKey).filter(Boolean) as string[])].sort();

  return <section className="page">
    <div className="page-heading">
      <div>
        <span className="eyebrow">ADMINISTRAÇÃO</span>
        <h1>Central de Legado BeepStart</h1>
        <p>Histórico do BeepStart em modo somente leitura. O MB Óptica permanece independente para a operação atual.</p>
      </div>
      <div className="settings-status"><b>● Protegida</b><span>Administrador e Gerente</span></div>
    </div>

    {message&&<div className="panel settings-message">{message}</div>}
    <div className="panel" style={{marginBottom:16}}>
      <div className="panel-heading">
        <div>
          <span className="eyebrow">FINANCEIRO DO LEGADO</span>
          <h2>Resumo financeiro BeepStart — 2026</h2>
          <p>Visão gerencial separada da pesquisa textual. Os valores são calculados a partir das coleções financeiras preservadas no legado.</p>
        </div>
        <button className="secondary" onClick={loadFinancialSummary}>Atualizar financeiro</button>
      </div>

      {!financial ? <p style={{color:"var(--muted)"}}>Carregando dados financeiros...</p> :
      <>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:10}}>
          {[
            ["Faturamento de vendas",financial.billing,"primary"],
            ["Vendas realizadas",financial.salesCount,"neutral"],
            ["Recebido",financial.received,"positive"],
            ["Contas a receber",financial.receivable,"warning"],
            ["Contas a pagar",financial.payable,"danger"],
          ].map(([label,value,tone])=>
            <div key={String(label)} style={{border:"1px solid var(--line)",borderRadius:12,padding:14,background:"#fff"}}>
              <small style={{display:"block",color:"var(--muted)",marginBottom:7}}>{String(label)}</small>
              <strong style={{fontSize:21,color:tone==="positive"?"#087f73":tone==="warning"?"#9a6500":tone==="danger"?"#a13b3b":"#17324d"}}>
                {label==="Vendas realizadas"?Number(value).toLocaleString("pt-BR"):"R$ "+Number(value).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}
              </strong>
            </div>
          )}
        </div>

        <div style={{marginTop:18,overflowX:"auto"}}>
          <div className="table">
            <div className="row header"><span>Mês</span><span>Vendas</span><span>Faturamento</span><span>Recebido</span><span>A receber</span></div>
            {financial.months.map((m)=>
              <div className="row" key={m.month}>
                <strong>{m.month}</strong>
                <span>{m.sales.toLocaleString("pt-BR")}</span>
                <span>R$ {m.billing.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                <span>R$ {m.received.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                <span>R$ {m.receivable.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
              </div>
            )}
            <div className="row" style={{fontWeight:800,borderTop:"2px solid var(--line)"}}>
              <strong>TOTAL / POSIÇÃO</strong>
              <strong>{financial.salesCount.toLocaleString("pt-BR")}</strong>
              <strong>R$ {financial.billing.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong>
              <strong>R$ {financial.received.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong>
              <strong>R$ {financial.receivable.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong>
            </div>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10,marginTop:14}}>
          <div className="settings-list"><div><b>Contas a receber em aberto</b><span>{financial.receivableAccounts}</span></div></div>
          <div className="settings-list"><div><b>Contas a pagar em aberto</b><span>{financial.payableAccounts}</span></div></div>
          <div className="settings-list"><div><b>Registros financeiros analisados</b><span>{financial.archivedRecords.toLocaleString("pt-BR")}</span></div></div>
        </div>

        <div style={{marginTop:12,padding:12,borderRadius:10,background:"#f7f9fb",fontSize:12,color:"var(--muted)"}}>
          <b>Como o resumo é calculado:</b> faturamento vem de <code>Venda</code> (itens menos desconto); recebido vem das entradas positivas de <code>Movimentacao</code>; contas a receber e a pagar usam o saldo estimado das parcelas ainda não quitadas. A pesquisa abaixo continua sendo apenas consulta do legado.
        </div>
      </>}
    </div>


    <div className="settings-grid">
      <div className="panel">
        <div className="panel-heading">
          <div><h2>Arquivo legado</h2><p>Carregue o backup oficial para auditoria e arquivamento.</p></div>
        </div>
        <input type="file" accept=".json,.txt,application/json,text/plain"
          onChange={e=>{setFile(e.target.files?.[0]||null);setRecords(null);setAudit(null)}}/>
        <button className="primary" disabled={!file||busy} onClick={auditBackup} style={{marginTop:10}}>
          {busy?"Processando...":"Auditar backup"}
        </button>

        <div className="settings-list" style={{marginTop:14}}>
          <div><b>Registros no legado</b><span>{legacyStored.toLocaleString("pt-BR")}</span></div>
          <div><b>Execuções</b><span>{runs.length}</span></div>
          <div><b>Modo</b><span>SOMENTE LEITURA</span></div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div><h2>Regra operacional</h2><p>O BeepStart não alimenta automaticamente o banco operacional.</p></div>
        </div>
        <div className="settings-list">
          <div><b>Clientes</b><span>Consulta histórica</span></div>
          <div><b>Vendas</b><span>Consulta histórica</span></div>
          <div><b>Ordens</b><span>Consulta histórica</span></div>
          <div><b>Produtos / estoque</b><span>Consulta histórica</span></div>
          <div><b>Financeiro</b><span>Consulta histórica</span></div>
          <div><b>Alterações</b><span>Bloqueadas</span></div>
        </div>
      </div>
    </div>

    {audit&&<div className="panel">
      <div className="panel-heading">
        <div>
          <h2>Auditoria do backup</h2>
          <p>Fingerprint: <code>{audit.fingerprint}</code></p>
        </div>
        <b>{audit.duplicateKeys===0?"✓ ESTRUTURA VÁLIDA":"⚠ REVISAR DUPLICIDADES"}</b>
      </div>
      <div className="settings-grid">
        <div className="settings-list">
          <div><b>Registros</b><span>{audit.total.toLocaleString("pt-BR")}</span></div>
          <div><b>Coleções</b><span>{audit.collections}</span></div>
          <div><b>Chaves duplicadas</b><span>{audit.duplicateKeys}</span></div>
        </div>
        <div className="settings-list">
          {Object.entries(audit.collectionCounts).map(([name,count])=>
            <div key={name}><b>{name}</b><span>{count.toLocaleString("pt-BR")}</span></div>
          )}
        </div>
      </div>
      {audit.warnings.length>0&&
        <div className="panel" style={{marginTop:12,padding:12}}>
          <b>Pontos de atenção</b>
          {audit.warnings.map((w,i)=><p key={i} style={{margin:"6px 0"}}>• {w}</p>)}
          <p style={{margin:"10px 0 0",color:"var(--muted)"}}>
            Esses alertas não impedem a consulta histórica. O backup original permanece fora do banco operacional.
          </p>
        </div>
      }
      <div className="panel" style={{marginTop:12,padding:12}}>
        <b>Arquivar como legado somente leitura</b>
        <p style={{margin:"6px 0",color:"var(--muted)"}}>
          Cria apenas registros em LegacyRecord e um MigrationRun do tipo LEGACY_ONLY. Nenhum dado operacional é migrado.
        </p>
        <button className="primary" disabled={!records||busy||audit.duplicateKeys>0} onClick={archiveLegacy}>
          {busy?"Arquivando...":"Arquivar no Legado"}
        </button>
      </div>
    </div>}

    <div className="panel" style={{marginTop:16}}>
      <div className="panel-heading"><div><span className="eyebrow">INTEGRAÇÃO SELETIVA</span><h2>Produtos com estoque</h2><p>Somente produtos do BeepStart com saldo disponível. Selecione quais serão integrados ao MB Óptica.</p></div>
      <div style={{display:"flex",gap:8}}><button className="secondary" onClick={loadStockProducts} disabled={stockBusy}>{stockBusy?"Carregando...":"Carregar produtos em estoque"}</button><button className="primary" onClick={integrateStockProducts} disabled={stockBusy||selectedStock.length===0}>Integrar selecionados ({selectedStock.length})</button></div></div>
      {stockMessage&&<div style={{padding:10,borderRadius:8,background:"#f7f9fb",marginBottom:10}}>{stockMessage}</div>}
      {stockProducts.length>0&&<div className="table"><div className="row header"><span><input type="checkbox" aria-label="Selecionar todos" checked={stockProducts.length>0&&selectedStock.length===stockProducts.length} onChange={e=>setSelectedStock(e.target.checked?stockProducts.map(p=>p.id):[])}/></span><span>Código</span><span>Produto</span><span>Estoque</span><span>Preço</span><span>Origem</span></div>
      {stockProducts.map(p=><div className="row" key={p.id}><span><input type="checkbox" checked={selectedStock.includes(p.id)} onChange={e=>setSelectedStock(x=>e.target.checked?[...x,p.id]:x.filter(id=>id!==p.id))}/></span><strong>{p.code}</strong><span><b>{p.brand||""}</b>{p.brand?" · ":""}{p.model||p.description}</span><strong>{Number(p.stock||0).toLocaleString("pt-BR")}</strong><span>R$ {Number(p.salePrice||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}</span><small>BeepStart · ID {p.legacyId||"—"}</small></div>)}</div>}
      {!stockProducts.length&&!stockBusy&&<p style={{color:"var(--muted)"}}>Clique em “Carregar produtos em estoque” para montar a lista.</p>}
      <div style={{marginTop:12,padding:12,borderRadius:10,background:"#f7f9fb",fontSize:12,color:"var(--muted)"}}><b>Regra:</b> somente registros da coleção Produto com estoque maior que zero entram nesta lista. A integração cria o produto, registra o saldo como entrada de estoque e mantém o vínculo com o registro original do BeepStart. Produtos sem estoque não são integrados.</div>
    </div>

    <div className="panel">
      <div className="panel-heading">
        <div><h2>Consulta do legado</h2><p>Pesquise os registros arquivados sem alterar o histórico.</p></div>
        <button className="secondary" onClick={searchLegacy}>Pesquisar</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10}}>
        <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")searchLegacy()}} placeholder="Nome, CPF, código, descrição, ID ou qualquer texto..." />
        <input value={collection} onChange={e=>setCollection(e.target.value)} placeholder="Coleção (ex.: Cliente)" list="legacy-collections"/>
      </div>
      <datalist id="legacy-collections">{collections.map(c=><option key={c} value={c}/>)}</datalist>

      {results.length===0
        ? <p style={{color:"var(--muted)",marginTop:14}}>Nenhum registro encontrado para os critérios informados.</p>
        : <div className="table" style={{marginTop:14}}>
            <div className="row header"><span style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" aria-label="Selecionar produtos visíveis" checked={results.filter(r=>(r.collectionKey||"").toLowerCase().includes("produt")).length>0&&results.filter(r=>(r.collectionKey||"").toLowerCase().includes("produt")).every(r=>selectedLegacyProducts.includes(r.id))} onChange={e=>{const ids=results.filter(r=>(r.collectionKey||"").toLowerCase().includes("produt")).map(r=>r.id);setSelectedLegacyProducts(e.target.checked?ids:[])}}/><span>Selecionar / Informação encontrada</span></span><span>Documento / contato</span><span>ID legado</span><span>Ação</span></div>
            {results.map(row=>{
              const s=recordSummary(row);
              return <div className="row" key={row.id}>
                <span>
                  <strong>{s.name||row.collectionKey||"Registro legado"}</strong>
                  <small style={{display:"block",color:"var(--muted)"}}>{row.collectionKey||"—"}{s.code?` · Código ${s.code}`:""}</small>
                </span>
                <span>
                  {s.document||"—"}
                  {s.phone?<small style={{display:"block",color:"var(--muted)"}}>{s.phone}</small>:null}
                  {s.email?<small style={{display:"block",color:"var(--muted)"}}>{s.email}</small>:null}
                </span>
                <span><code>{row.legacyId||"—"}</code></span>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}><button className="secondary" onClick={()=>setSelected(row)}>Ver detalhes</button>{(row.collectionKey||"").toLowerCase()==="cliente"&&<button className="primary" disabled={busy} onClick={()=>importCustomer(row)}>Usar no cadastro</button>}</div>
              </div>;
            })}
          </div>
      }
    </div>

    {selected&&<div className="panel">
      <div className="panel-heading">
        <div><h2>Registro legado</h2><p>{selected.collectionKey} · {selected.legacyId||"sem ID"}</p></div>
        <button className="secondary" onClick={()=>setSelected(null)}>Fechar</button>
      </div>
      <pre style={{whiteSpace:"pre-wrap",overflow:"auto",maxHeight:520,margin:0,fontSize:12}}>
        {JSON.stringify(selected.payload,null,2)}
      </pre>
    </div>}

    <div className="panel">
      <div className="panel-heading"><div><h2>Arquivamentos</h2><p>Histórico das fontes preservadas.</p></div><button className="secondary" onClick={load}>Atualizar</button></div>
      {runs.length===0?<p style={{color:"var(--muted)"}}>Nenhum backup arquivado ainda.</p>:
        <div className="table">
          <div className="row header"><span>Status</span><span>Fonte</span><span>Total</span><span>Fingerprint</span><span>Data</span></div>
          {runs.map(r=><div className="row" key={r.id}>
            <strong>{r.status}</strong><span>{r.source}</span><span>{r.total.toLocaleString("pt-BR")}</span>
            <code style={{fontSize:10}}>{r.sourceFingerprint.slice(0,16)}…</code>
            <span>{new Date(r.startedAt).toLocaleString("pt-BR")}</span>
          </div>)}
        </div>}
    </div>
  </section>;
}
