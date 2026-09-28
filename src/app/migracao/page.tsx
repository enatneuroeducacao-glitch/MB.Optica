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
  mappingAudit?:{categories:{sourceIds:number;uniqueNames:number;collapsedAliasGroups:number;productRefs:number;productsWithoutCategory:number};suppliers:{sourceIds:number;uniqueNames:number;collapsedAliasGroups:number;productRefs:number;productsWithoutSupplier:number};preservedOnlyCollections:string[];duplicateBarcodeGroups:{barcode:string;productIds:string[]}[];unresolvedPayableCreditors:number;duplicateCustomerCpfGroups:number;itemReferences:{totalChecked:number;missingProductRefs:number;missingProductRefDetails:{source:string;recordId:string;productId:string}[]}};
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


  function printAuditReport(){
    if(!audit)return;
    window.print();
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
      <div className="panel-heading"><div><h2>Resultado do dry-run</h2><p>Fingerprint: <code>{dryRun.fingerprint}</code></p></div><div style={{display:"flex",gap:8,alignItems:"center"}}><button className="secondary" onClick={printAuditReport}>Gerar relatório de auditoria</button><b>{dryRun.safe?"✓ SOMENTE LEITURA":"⚠ REVISAR"}</b></div></div>
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
      {dryRun.mappingAudit&&<div className="panel" style={{marginTop:12,padding:12}}>
        <b>Auditoria dos mapeamentos</b>
        <div className="settings-list" style={{marginTop:8}}>
          <div><b>Categorias</b><span>{dryRun.mappingAudit.categories.sourceIds} IDs · {dryRun.mappingAudit.categories.uniqueNames} nomes · {dryRun.mappingAudit.categories.collapsedAliasGroups} grupos consolidados · {dryRun.mappingAudit.categories.productRefs} produtos vinculados · {dryRun.mappingAudit.categories.productsWithoutCategory} sem categoria</span></div>
          <div><b>Fornecedores</b><span>{dryRun.mappingAudit.suppliers.sourceIds} IDs · {dryRun.mappingAudit.suppliers.uniqueNames} nomes · {dryRun.mappingAudit.suppliers.collapsedAliasGroups} grupos consolidados · {dryRun.mappingAudit.suppliers.productRefs} produtos vinculados · {dryRun.mappingAudit.suppliers.productsWithoutSupplier} sem fornecedor</span></div>
          <div><b>Itens de venda/pedido</b><span>{dryRun.mappingAudit.itemReferences.totalChecked} referências · {dryRun.mappingAudit.itemReferences.missingProductRefs} sem produto correspondente</span></div>
          <div><b>Códigos de barras</b><span>{dryRun.mappingAudit.duplicateBarcodeGroups.length} grupos duplicados — importação bloqueada até decisão</span></div>
          <div><b>Contas a pagar</b><span>{dryRun.mappingAudit.unresolvedPayableCreditors} credores sem vínculo com fornecedor</span></div>
          <div><b>Clientes</b><span>{dryRun.mappingAudit.duplicateCustomerCpfGroups} grupos com CPF duplicado no legado — registros serão preservados separadamente</span></div>
          <div><b>Coleções preservadas somente no legado</b><span>{dryRun.mappingAudit.preservedOnlyCollections.join(", ")||"Nenhuma"}</span></div>
        </div>
      </div>}
      <div className="panel" style={{marginTop:12,padding:12}}><b>04 · Importação definitiva</b><p style={{margin:"6px 0",color:"var(--muted)"}}>{dryRun.note}</p><p style={{margin:"6px 0",color:"var(--muted)"}}>Só é liberada quando o dry-run estiver seguro, sem conflitos com o legado e sem alertas.</p><button className="primary" disabled={!dryRun.safe||busy} onClick={executeImport} style={{marginTop:8}}>{busy?"Importando...":"Executar importação definitiva"}</button>{!dryRun.safe&&<p style={{margin:"8px 0 0",color:"var(--muted)",fontSize:12}}>Importação bloqueada até que todas as validações estejam sem alertas.</p>}</div>
    </div>}

    {audit&&<div className="audit-report-print">
      <div className="audit-report-header">
        <h1>RELATÓRIO DE AUDITORIA DE MIGRAÇÃO</h1>
        <h2>BeepStart → MB Óptica</h2>
        <p>Gerado em {new Date().toLocaleString("pt-BR")}</p>
        <p><strong>Fingerprint:</strong> {audit.fingerprint}</p>
      </div>
      <h3>1. Identificação do backup</h3>
      <table><tbody>
        <tr><td>Fonte</td><td>{audit.source}</td></tr>
        <tr><td>Registros</td><td>{audit.total.toLocaleString("pt-BR")} / {EXPECTED_TOTAL.toLocaleString("pt-BR")}</td></tr>
        <tr><td>Coleções</td><td>{audit.collections} / {EXPECTED_COLLECTIONS}</td></tr>
        <tr><td>Chaves duplicadas</td><td>{audit.duplicateKeys}</td></tr>
        <tr><td>Status da auditoria</td><td>{audit.readyForDryRun?"APTO PARA DRY-RUN":"REVISAR"}</td></tr>
      </tbody></table>
      <h3>2. Registros por coleção</h3>
      <table><thead><tr><th>Coleção</th><th>Quantidade</th></tr></thead><tbody>
        {Object.entries(audit.collectionCounts).map(([name,count])=><tr key={name}><td>{name}</td><td>{count.toLocaleString("pt-BR")}</td></tr>)}
      </tbody></table>
      {dryRun&&<><h3>3. Resultado do dry-run</h3>
      <table><tbody>
        <tr><td>Conflitos com LegacyRecord</td><td>{dryRun.legacyConflicts}</td></tr>
        <tr><td>Registros preservados</td><td>{dryRun.plan.preservedLegacyRecords.toLocaleString("pt-BR")}</td></tr>
        <tr><td>Categorias</td><td>{dryRun.plan.categories.existing} existentes · {dryRun.plan.categories.create} novas</td></tr>
        <tr><td>Fornecedores</td><td>{dryRun.plan.suppliers.existing} existentes · {dryRun.plan.suppliers.create} novos</td></tr>
        <tr><td>Clientes</td><td>{dryRun.plan.customers.existing} encontrados · {dryRun.plan.customers.create} novos</td></tr>
        <tr><td>Produtos</td><td>{dryRun.plan.products.existing} encontrados · {dryRun.plan.products.create} novos</td></tr>
        <tr><td>Pedidos</td><td>{dryRun.plan.orders}</td></tr>
        <tr><td>Vendas</td><td>{dryRun.plan.sales}</td></tr>
        <tr><td>Contas a receber</td><td>{dryRun.plan.receivableAccounts}</td></tr>
        <tr><td>Contas a pagar</td><td>{dryRun.plan.payableAccounts}</td></tr>
        <tr><td>Lotes</td><td>{dryRun.plan.lots}</td></tr>
        <tr><td>Movimentações</td><td>{dryRun.plan.movements}</td></tr>
      </tbody></table>
      {dryRun.mappingAudit&&<><h3>4. Auditoria dos vínculos</h3>
      <table><tbody>
        <tr><td>Categorias</td><td>{dryRun.mappingAudit.categories.sourceIds} IDs · {dryRun.mappingAudit.categories.uniqueNames} nomes · {dryRun.mappingAudit.categories.collapsedAliasGroups} grupos consolidados</td></tr>
        <tr><td>Produtos → Categoria</td><td>{dryRun.mappingAudit.categories.productRefs} vinculados · {dryRun.mappingAudit.categories.productsWithoutCategory} sem categoria</td></tr>
        <tr><td>Fornecedores</td><td>{dryRun.mappingAudit.suppliers.sourceIds} IDs · {dryRun.mappingAudit.suppliers.uniqueNames} nomes · {dryRun.mappingAudit.suppliers.collapsedAliasGroups} grupos consolidados</td></tr>
        <tr><td>Produtos → Fornecedor</td><td>{dryRun.mappingAudit.suppliers.productRefs} vinculados · {dryRun.mappingAudit.suppliers.productsWithoutSupplier} sem fornecedor</td></tr>
        <tr><td>Itens de venda/pedido</td><td>{dryRun.mappingAudit.itemReferences.totalChecked} referências · {dryRun.mappingAudit.itemReferences.missingProductRefs} sem produto correspondente</td></tr>
        <tr><td>Códigos de barras duplicados</td><td>{dryRun.mappingAudit.duplicateBarcodeGroups.length} grupos</td></tr>
        <tr><td>Credores sem fornecedor</td><td>{dryRun.mappingAudit.unresolvedPayableCreditors}</td></tr>
        <tr><td>CPFs duplicados</td><td>{dryRun.mappingAudit.duplicateCustomerCpfGroups} grupos</td></tr>
        <tr><td>Coleções somente no legado</td><td>{dryRun.mappingAudit.preservedOnlyCollections.join(", ")||"Nenhuma"}</td></tr>
      </tbody></table></>}
      <h3>5. Pontos de atenção</h3>
      {(dryRun.warnings.length?dryRun.warnings:["Nenhum alerta registrado."]).map((w,i)=><p key={i}>• {w}</p>)}
      <p><strong>Conclusão técnica:</strong> {dryRun.safe?"Dry-run sem conflitos detectados nas validações executadas.":"A migração definitiva permanece bloqueada enquanto existirem alertas ou conflitos."}</p>
      </>}
      <div className="audit-report-footer">Documento gerado pela Central de Migração · MB Óptica · Auditoria de preservação do legado</div>
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
  <style jsx global>{`
    .audit-report-print{display:none}
    @media print{
      body *{visibility:hidden!important}
      .audit-report-print,.audit-report-print *{visibility:visible!important}
      .audit-report-print{display:block!important;position:absolute;left:0;top:0;width:100%;padding:24px;background:#fff;color:#111;font-family:Arial,sans-serif}
      .audit-report-print h1{font-size:22px;margin:0 0 6px}
      .audit-report-print h2{font-size:16px;margin:0 0 4px}
      .audit-report-print h3{font-size:14px;margin:22px 0 8px;border-bottom:1px solid #ccc;padding-bottom:4px}
      .audit-report-print p{font-size:11px;line-height:1.45}
      .audit-report-print table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:12px}
      .audit-report-print th,.audit-report-print td{border:1px solid #ccc;padding:5px;text-align:left}
      .audit-report-print th:last-child,.audit-report-print td:last-child{text-align:right}
      .audit-report-footer{margin-top:28px;border-top:1px solid #ccc;padding-top:8px;font-size:9px;color:#666}
    }
  `}</style>
  </section>
}
