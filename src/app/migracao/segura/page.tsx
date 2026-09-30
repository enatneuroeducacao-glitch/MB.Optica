"use client";

import { useState } from "react";

type Preview = {
  fingerprint:string;
  totalRecords:number;
  customerSource:number;
  customerMatched:number;
  customerNew:number;
  productSource:number;
  productMatched:number;
  productNew:number;
  otherRecords:number;
  alreadyProcessed:boolean;
};

type Result = Preview & {
  customerCreated:number;
  productCreated:number;
  legacyCreated:number;
};

export default function Page(){
  const [file,setFile]=useState<File|null>(null);
  const [records,setRecords]=useState<Record<string,unknown>[]|null>(null);
  const [preview,setPreview]=useState<Preview|null>(null);
  const [result,setResult]=useState<Result|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function readFile(){
    if(!file)return;
    setBusy(true); setMessage(""); setPreview(null); setResult(null);
    try{
      const parsed=JSON.parse(await file.text());
      if(!Array.isArray(parsed)) throw new Error("O backup precisa ser uma lista JSON.");
      setRecords(parsed);
      const r=await fetch("/api/migration/incremental/preview",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({records:parsed})
      });
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Falha ao preparar a prévia.");
      setPreview(d.preview);
      setMessage("Prévia concluída. Nenhum dado operacional foi alterado.");
    }catch(e){
      setMessage(e instanceof Error?e.message:"Erro ao preparar a prévia.");
    }finally{setBusy(false);}
  }

  async function confirmReconciliation(){
    if(!records||!preview)return;
    if(preview.alreadyProcessed){
      setMessage("Este backup já possui uma execução concluída. Nenhuma nova gravação será feita.");
      return;
    }
    if(!window.confirm(
      "CONFIRMAR RECONCILIAÇÃO INCREMENTAL\n\n"+
      "Clientes novos: "+preview.customerNew+"\n"+
      "Produtos novos: "+preview.productNew+"\n"+
      "Registros históricos: "+preview.otherRecords+"\n\n"+
      "Os registros existentes serão preservados. As demais coleções permanecerão como histórico.\n\nContinuar?"
    )) return;

    setBusy(true); setMessage("");
    try{
      const r=await fetch("/api/migration/incremental",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({records})
      });
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Falha na reconciliação.");
      setResult(d.result);
      setMessage(d.alreadyProcessed
        ? "Este backup já havia sido processado. Nenhum registro foi duplicado."
        : "Reconciliação concluída.");
    }catch(e){
      setMessage(e instanceof Error?e.message:"Erro ao processar o backup.");
    }finally{setBusy(false);}
  }

  return <section className="page">
    <div className="page-heading">
      <div>
        <span className="eyebrow">ADMINISTRAÇÃO · PROTEÇÃO DE DADOS</span>
        <h1>Central Segura de Reconciliação</h1>
        <p>Primeiro analisamos o novo backup sem gravar nada. A gravação só acontece após a confirmação explícita.</p>
      </div>
      <div className="settings-status"><b>● MODO SEGURO</b><span>Prévia antes da gravação</span></div>
    </div>

    {message&&<div className="panel settings-message">{message}</div>}

    <div className="settings-grid">
      <div className="panel">
        <div className="panel-heading">
          <div><span className="eyebrow">ETAPA 1</span><h2>Analisar novo backup</h2><p>O arquivo é lido em memória e comparado com os cadastros atuais.</p></div>
        </div>
        <input type="file" accept=".json,.txt,application/json,text/plain"
          onChange={e=>{setFile(e.target.files?.[0]||null);setRecords(null);setPreview(null);setResult(null);setMessage("");}}/>
        <button className="primary" disabled={!file||busy} onClick={readFile} style={{marginTop:10}}>
          {busy?"Analisando...":"Gerar prévia segura"}
        </button>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div><span className="eyebrow">ETAPA 2</span><h2>Regras de preservação</h2><p>O processo não substitui cadastros existentes.</p></div>
        </div>
        <div className="settings-list">
          <div><b>Cliente</b><span>CPF/CNPJ → nome + telefone</span></div>
          <div><b>Produto</b><span>código → código de barras → identidade</span></div>
          <div><b>Histórico</b><span>Preservado no legado</span></div>
          <div><b>Duplicidade do backup</b><span>Fingerprint SHA-256</span></div>
        </div>
      </div>
    </div>

    {preview&&<div className="panel">
      <div className="panel-heading">
        <div><span className="eyebrow">PRÉVIA · SEM GRAVAÇÃO</span><h2>Resultado da análise</h2><p>Esta tela mostra o que seria incorporado antes de qualquer alteração no banco.</p></div>
        <b>{preview.alreadyProcessed?"⚠ JÁ PROCESSADO":"✓ PRONTO PARA CONFIRMAÇÃO"}</b>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10}}>
        {[
          ["Clientes no backup",preview.customerSource],
          ["Clientes já existentes",preview.customerMatched],
          ["Clientes novos",preview.customerNew],
          ["Produtos novos",preview.productNew],
        ].map(([label,value])=>
          <div key={String(label)} style={{border:"1px solid var(--line)",borderRadius:12,padding:14,background:"#fff"}}>
            <small style={{display:"block",color:"var(--muted)",marginBottom:7}}>{String(label)}</small>
            <strong style={{fontSize:24}}>{Number(value).toLocaleString("pt-BR")}</strong>
          </div>
        )}
      </div>

      <div className="settings-list" style={{marginTop:14}}>
        <div><b>Produtos no backup</b><span>{preview.productSource.toLocaleString("pt-BR")}</span></div>
        <div><b>Produtos já existentes</b><span>{preview.productMatched.toLocaleString("pt-BR")}</span></div>
        <div><b>Registros históricos</b><span>{preview.otherRecords.toLocaleString("pt-BR")}</span></div>
        <div><b>Total analisado</b><span>{preview.totalRecords.toLocaleString("pt-BR")}</span></div>
        <div><b>Fingerprint</b><code>{preview.fingerprint}</code></div>
      </div>

      <div style={{marginTop:14,padding:12,borderRadius:10,background:"#f7f9fb",color:"var(--muted)",fontSize:12}}>
        <b>Importante:</b> até este ponto não houve alteração no banco operacional.
      </div>

      {!preview.alreadyProcessed&&
        <button className="primary" disabled={busy} onClick={confirmReconciliation} style={{marginTop:14}}>
          {busy?"Gravando...":"Confirmar e executar reconciliação"}
        </button>
      }
    </div>}

    {result&&<div className="panel">
      <div className="panel-heading">
        <div><span className="eyebrow">RESULTADO FINAL</span><h2>Reconciliação concluída</h2><p>Os registros existentes foram preservados.</p></div>
        <b>✓ CONCLUÍDA</b>
      </div>
      <div className="settings-list">
        <div><b>Clientes criados</b><span>{result.customerCreated}</span></div>
        <div><b>Clientes correspondentes</b><span>{result.customerMatched}</span></div>
        <div><b>Produtos criados</b><span>{result.productCreated}</span></div>
        <div><b>Produtos correspondentes</b><span>{result.productMatched}</span></div>
        <div><b>Registros históricos preservados</b><span>{result.legacyCreated}</span></div>
        <div><b>Fingerprint</b><code>{result.fingerprint}</code></div>
      </div>
    </div>}
  </section>;
}
