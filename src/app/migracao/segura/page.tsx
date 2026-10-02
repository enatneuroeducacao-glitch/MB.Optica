"use client";
import { useMemo, useState } from "react";

type Candidate={legacyKey:string;legacyId:string|null;name?:string;document?:string;phone?:string;description?:string;brand?:string;model?:string;code?:string;barcode?:string;status:"MATCHED"|"NEW"|"REVIEW"|"RECONCILED";method:string;reason:string;matchedName?:string|null};
type Preview={fingerprint:string;totalRecords:number;customerSource:number;productSource:number;otherRecords:number;customers:Candidate[];products:Candidate[];customerCounts:Record<string,number>;productCounts:Record<string,number>};
type Result={fingerprint:string;backupFingerprint?:string;selectionFingerprint?:string;totalRecords:number;customerSource:number;customerCreated:number;customerMatched:number;productSource:number;productCreated:number;productMatched:number;legacyCreated:number};

const statusLabel=(s:string)=>s==="RECONCILED"?"✓ Já reconciliado":s==="MATCHED"?"Correspondência segura":s==="REVIEW"?"Revisar":"Sem correspondência";
const statusTone=(s:string)=>s==="RECONCILED"?"#0b6b57":s==="MATCHED"?"#087f73":s==="REVIEW"?"#9a6500":"#17324d";

export default function Page(){
  const [file,setFile]=useState<File|null>(null);
  const [records,setRecords]=useState<Record<string,unknown>[]|null>(null);
  const [preview,setPreview]=useState<Preview|null>(null);
  const [result,setResult]=useState<Result|null>(null);
  const [selected,setSelected]=useState<Set<string>>(new Set());
  const [nonStockProducts,setNonStockProducts]=useState<Set<string>>(new Set());
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [kind,setKind]=useState<"Cliente"|"Produto">("Cliente");
  const [status,setStatus]=useState<"ALL"|"NEW"|"REVIEW"|"MATCHED"|"RECONCILED">("NEW");
  const [query,setQuery]=useState("");
  const [page,setPage]=useState(1);

  const candidates=kind==="Cliente"?(preview?.customers??[]):(preview?.products??[]);
  const filtered=useMemo(()=>candidates.filter(x=>{
    const statusOk=status==="ALL"||x.status===status;
    const q=query.trim().toLowerCase();
    if(!q)return statusOk;
    const hay=[x.name,x.document,x.phone,x.description,x.brand,x.model,x.code,x.barcode,x.legacyId,x.matchedName].filter(Boolean).join(" ").toLowerCase();
    return statusOk&&hay.includes(q);
  }),[candidates,status,query]);
  const pageSize=40;
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const visible=filtered.slice((page-1)*pageSize,page*pageSize);

  function toggle(key:string){setSelected(prev=>{const next=new Set(prev);if(next.has(key))next.delete(key);else next.add(key);return next;});}
  function selectStatus(target:"NEW"|"REVIEW"){setSelected(prev=>{const next=new Set(prev);candidates.filter(x=>x.status===target).forEach(x=>next.add(x.legacyKey));return next;});}
  function clearSelection(){setSelected(new Set());setNonStockProducts(new Set());}
  function toggleNonStock(key:string){setSelected(prev=>{const next=new Set(prev);next.add(key);return next;});setNonStockProducts(prev=>{const next=new Set(prev);if(next.has(key))next.delete(key);else next.add(key);return next;});}

  async function analyze(){
    if(!file)return;
    setBusy(true);setMessage("");setPreview(null);setResult(null);setSelected(new Set());
    try{
      const parsed=JSON.parse(await file.text());
      if(!Array.isArray(parsed))throw new Error("O backup precisa ser uma lista JSON.");
      setRecords(parsed);
      const r=await fetch("/api/migration/incremental/preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records:parsed})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Falha na pesquisa de reconciliação.");
      setPreview(d.preview);setMessage("Pesquisa concluída. Nenhum dado operacional foi alterado.");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao pesquisar o backup.");}
    finally{setBusy(false);}
  }

  async function confirm(){
    if(!records||!preview||selected.size===0)return;
    if(!window.confirm("CONFIRMAR RECONCILIAÇÃO SELETIVA\\n\\nRegistros selecionados: "+selected.size+"\\n\\nSomente os registros marcados serão considerados para inclusão. Correspondências existentes não serão substituídas.\\n\\nContinuar?"))return;
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/migration/incremental",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({records,selectedKeys:[...selected],nonStockProductKeys:[...nonStockProducts]})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Falha na reconciliação seletiva.");
      setResult(d.result);setMessage("Reconciliação seletiva concluída. Nenhum registro fora da seleção foi incorporado.");
    }catch(e){setMessage(e instanceof Error?e.message:"Erro ao executar a reconciliação.");}
    finally{setBusy(false);}
  }

  return <section className="page">
    <div className="page-heading">
      <div><span className="eyebrow">ADMINISTRAÇÃO · PESQUISA E RECONCILIAÇÃO</span><h1>Reconciliação seletiva do BeepStart</h1><p>Primeiro pesquisamos cada Cliente e Produto. Só depois você escolhe exatamente o que precisa entrar no MB Óptica.</p></div>
      <div className="settings-status"><b>● MODO SEGURO</b><span>Pesquisa sem gravação</span></div>
    </div>
    {message&&<div className="panel settings-message">{message}</div>}

    <div className="settings-grid">
      <div className="panel">
        <div className="panel-heading"><div><span className="eyebrow">ETAPA 1</span><h2>Pesquisar o novo backup</h2><p>A análise compara documentos, nomes, telefones, códigos, barras e identidade dos produtos.</p></div></div>
        <input type="file" accept=".json,.txt,application/json,text/plain" onChange={e=>{setFile(e.target.files?.[0]||null);setPreview(null);setResult(null);setRecords(null);setSelected(new Set());setNonStockProducts(new Set());setMessage("");}}/>
        <button className="primary" disabled={!file||busy} onClick={analyze} style={{marginTop:10}}>{busy?"Pesquisando...":"Pesquisar e gerar reconciliação"}</button>
      </div>
      <div className="panel">
        <div className="panel-heading"><div><span className="eyebrow">CRITÉRIO</span><h2>O que é considerado seguro</h2><p>Não fazemos correspondência agressiva apenas por nome.</p></div></div>
        <div className="settings-list">
          <div><b>Cliente</b><span>CPF/CNPJ exato</span></div>
          <div><b>Cliente sem documento</b><span>Nome + telefone exatos</span></div>
          <div><b>Produto</b><span>Código de barras / código exato</span></div>
          <div><b>Produto</b><span>Descrição + marca + modelo</span></div>
          <div><b>Ambíguos</b><span>Revisão manual</span></div>
        </div>
      </div>
    </div>

    {preview&&<div className="panel" style={{marginTop:16}}>
      <div className="panel-heading"><div><span className="eyebrow">ETAPA 2 · PESQUISA CONCLUÍDA</span><h2>O que realmente precisa ser reconciliado</h2><p>Correspondências seguras não precisam ser importadas. Registros já reconciliados ficam identificados e bloqueados para evitar nova inclusão. Novos registros e casos ambíguos podem ser selecionados individualmente.</p></div></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10}}>
        {[["Clientes",preview.customerSource,preview.customerCounts.NEW,preview.customerCounts.REVIEW],["Produtos",preview.productSource,preview.productCounts.NEW,preview.productCounts.REVIEW]].map(([label,total,news,reviews])=><div key={String(label)} style={{border:"1px solid var(--line)",borderRadius:12,padding:14}}><small style={{display:"block",color:"var(--muted)"}}>{label}</small><strong style={{fontSize:25,display:"block"}}>{Number(total).toLocaleString("pt-BR")}</strong><span style={{fontSize:12}}>novos: {Number(news).toLocaleString("pt-BR")} · revisar: {Number(reviews).toLocaleString("pt-BR")}</span></div>)}
        <div style={{border:"1px solid var(--line)",borderRadius:12,padding:14}}><small style={{display:"block",color:"var(--muted)"}}>Registros do backup</small><strong style={{fontSize:25,display:"block"}}>{preview.totalRecords.toLocaleString("pt-BR")}</strong><span style={{fontSize:12}}>demais coleções: {preview.otherRecords.toLocaleString("pt-BR")}</span></div>
        <div style={{border:"1px solid var(--line)",borderRadius:12,padding:14}}><small style={{display:"block",color:"var(--muted)"}}>Selecionados</small><strong style={{fontSize:25,display:"block"}}>{selected.size.toLocaleString("pt-BR")}</strong><span style={{fontSize:12}}>somente estes serão enviados</span></div><div style={{border:"1px solid var(--line)",borderRadius:12,padding:14}}><small style={{display:"block",color:"var(--muted)"}}>Lentes selecionadas</small><strong style={{fontSize:25,display:"block"}}>{nonStockProducts.size.toLocaleString("pt-BR")}</strong><span style={{fontSize:12}}>entram sem controle de estoque físico</span></div>
      </div>

      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:18}}>
        <button className={kind==="Cliente"?"primary":"secondary"} onClick={()=>{setKind("Cliente");setPage(1);}} >Clientes ({preview.customerCounts.NEW+preview.customerCounts.REVIEW})</button>
        <button className={kind==="Produto"?"primary":"secondary"} onClick={()=>{setKind("Produto");setPage(1);}}>Produtos ({preview.productCounts.NEW+preview.productCounts.REVIEW})</button>
        <button className={status==="NEW"?"primary":"secondary"} onClick={()=>{setStatus("NEW");setPage(1);}}>Novos ({(kind==="Cliente"?preview.customerCounts.NEW:preview.productCounts.NEW)})</button>
        <button className={status==="REVIEW"?"primary":"secondary"} onClick={()=>{setStatus("REVIEW");setPage(1);}}>Revisar ({(kind==="Cliente"?preview.customerCounts.REVIEW:preview.productCounts.REVIEW)})</button>
        <button className={status==="MATCHED"?"primary":"secondary"} onClick={()=>{setStatus("MATCHED");setPage(1);}}>Já encontrados ({(kind==="Cliente"?preview.customerCounts.MATCHED:preview.productCounts.MATCHED)})</button>
        <button className={status==="RECONCILED"?"primary":"secondary"} onClick={()=>{setStatus("RECONCILED");setPage(1);}}>Já reconciliados ({(kind==="Cliente"?preview.customerCounts.RECONCILED??0:preview.productCounts.RECONCILED??0)})</button>
        <button className="secondary" onClick={()=>setStatus("ALL")}>Todos</button>
        <button className="secondary" onClick={()=>selectStatus("NEW")}>Selecionar todos os novos</button>
        <button className="secondary" onClick={()=>selectStatus("REVIEW")}>Selecionar revisões</button>
        <button className="secondary" onClick={clearSelection}>Limpar seleção</button>
      </div>

      <div style={{marginTop:12}}><input value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder={kind==="Cliente"?"Pesquisar cliente por nome, CPF ou telefone...":"Pesquisar produto por descrição, marca, código ou código de barras..."}/></div>

      <div className="table" style={{marginTop:14}}>
        <div className="row header"><span>Selecionar</span><span>Registro</span><span>{kind==="Produto"?"Lente / estoque":"Correspondência"}</span><span>Critério</span></div>
        {visible.map(item=><div className="row" key={item.legacyKey}>
          <span>{item.status==="RECONCILED"?<small style={{color:"#0b6b57",fontWeight:700}}>✓ Já reconciliado</small>:item.status==="MATCHED"&&kind==="Cliente"?<small style={{color:"#087f73"}}>✓ Já cadastrado</small>:<input type="checkbox" checked={selected.has(item.legacyKey)} onChange={()=>toggle(item.legacyKey)}/>}</span>
          <span><strong>{kind==="Cliente"?item.name:item.description}</strong><small style={{display:"block",color:"var(--muted)"}}>{kind==="Cliente"?(item.document||"sem CPF/CNPJ")+" · "+(item.phone||"sem telefone"):[item.brand,item.model,item.code].filter(Boolean).join(" · ")||"sem identificação completa"}</small></span>
          <span style={{color:statusTone(item.status)}}>{kind==="Produto"&&<label style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,cursor:"pointer"}}><input type="checkbox" checked={nonStockProducts.has(item.legacyKey)} onChange={()=>toggleNonStock(item.legacyKey)}/><b>Lente · não controla estoque</b></label>}<b>{statusLabel(item.status)}</b><small style={{display:"block",color:"var(--muted)"}}>{item.matchedName||"Nenhum cadastro atual localizado"}</small></span>
          <span><b>{item.method||"—"}</b><small style={{display:"block",color:"var(--muted)"}}>{item.reason}</small></span>
        </div>)}
      </div>
      {filtered.length===0&&<p style={{color:"var(--muted)",marginTop:14}}>Nenhum registro para este filtro.</p>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12}}><span style={{fontSize:12,color:"var(--muted)"}}>Exibindo {visible.length} de {filtered.length}</span><div style={{display:"flex",gap:6}}><button className="secondary" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Anterior</button><span style={{padding:"8px 10px",fontSize:12}}>Página {page} / {pages}</span><button className="secondary" disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>Próxima</button></div></div>

      <div style={{marginTop:16,padding:14,borderRadius:10,background:"#f7f9fb",color:"var(--muted)",fontSize:12}}><b>Regra:</b> os itens marcados serão os únicos enviados à reconciliação. Em Produtos, você pode marcar manualmente <b>Lente · não controla estoque</b>; essa classificação é individual e não depende do nome da lente. Os já encontrados não são substituídos. Casos de revisão só entram se você selecioná-los.</div>
      <button className="primary" disabled={busy||selected.size===0} onClick={confirm} style={{marginTop:12}}>{busy?"Processando...":"Confirmar reconciliação de "+selected.size+" selecionados"}</button>
    </div>}

    {result&&<div className="panel" style={{marginTop:16}}><div className="panel-heading"><div><span className="eyebrow">ETAPA 3 · CONCLUÍDA</span><h2>Reconciliação seletiva concluída</h2><p>Nenhum registro fora da seleção foi incorporado.</p></div><b>✓ CONCLUÍDA</b></div><div className="settings-list"><div><b>Clientes criados</b><span>{result.customerCreated}</span></div><div><b>Clientes correspondentes</b><span>{result.customerMatched}</span></div><div><b>Produtos criados</b><span>{result.productCreated}</span></div><div><b>Produtos correspondentes</b><span>{result.productMatched}</span></div><div><b>Registros históricos</b><span>{result.legacyCreated}</span></div><div><b>Fingerprint do backup</b><code>{result.backupFingerprint||"—"}</code></div></div></div>}
  </section>;
}
