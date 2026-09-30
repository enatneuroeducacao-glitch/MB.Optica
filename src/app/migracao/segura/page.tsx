"use client";

import { useState } from "react";

type Result = {
  totalRecords:number;
  customerSource:number;
  customerCreated:number;
  customerMatched:number;
  productSource:number;
  productCreated:number;
  productMatched:number;
  legacyCreated:number;\n  warnings?:string[];
  fingerprint:string;
};

export default function Page(){
  const [file,setFile]=useState<File|null>(null);
  const [records,setRecords]=useState<Record<string,unknown>[]|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [result,setResult]=useState<Result|null>(null);
  const [ready,setReady]=useState(false);

  async function processBackup(){
    if(!file)return;
    setBusy(true); setMessage(""); setResult(null);
    try{
      const raw=await file.text();
      const parsed=JSON.parse(raw);
      if(!Array.isArray(parsed)) throw new Error("O backup precisa ser uma lista JSON.");
      setRecords(parsed);
      setReady(true);
      setMessage("Backup carregado. Revise a quantidade de registros e confirme a reconciliação.");
      if(!ready) return;
      const r=await fetch("/api/migration/incremental",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({records:parsed})
      });
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||"Falha na reconciliação.");
      setResult(d.result);
      setMessage(d.alreadyProcessed
        ? "Este backup já havia sido processado. Nenhum registro foi duplicado."
        : "Reconciliação concluída com segurança.");
    }catch(e){
      setMessage(e instanceof Error?e.message:"Erro ao processar o backup.");
    }finally{
      setBusy(false);
    }
  }

  return <section className="page">
    <div className="page-heading">
      <div>
        <span className="eyebrow">ADMINISTRAÇÃO · PROTEÇÃO DE DADOS</span>
        <h1>Importação incremental segura</h1>
        <p>Insere somente clientes e produtos que ainda não existem no MB Óptica. Registros já existentes são preservados.</p>
      </div>
      <div className="settings-status"><b>● MODO SEGURO</b><span>Sem substituição de dados</span></div>
    </div>

    {message&&<div className="panel settings-message">{message}</div>}

    <div className="settings-grid">
      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>1. Selecionar novo backup</h2>
            <p>O arquivo é processado em memória e reconciliado contra os cadastros atuais.</p>
          </div>
        </div>
        <input type="file" accept=".json,.txt,application/json,text/plain"
          onChange={e=>{setFile(e.target.files?.[0]||null);setRecords(null);setResult(null);setReady(false);setMessage("");}}/>
        <button className="primary" disabled={!file||busy} onClick={processBackup} style={{marginTop:10}}>
          {busy?"Processando...":ready?"Confirmar reconciliação com o MB":"Preparar backup para reconciliação"}
        </button>
        {ready&&records&&<div style={{marginTop:12,padding:12,borderRadius:10,background:"#fff8e6",color:"var(--muted)",fontSize:13}}>
          <b>Confirmação necessária:</b> o primeiro clique não altera o banco. Ao clicar novamente, a reconciliação será executada e somente registros não encontrados serão acrescentados.
        </div>}
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <h2>2. Regras de preservação</h2>
            <p>O mecanismo não apaga nem substitui cadastros existentes.</p>
          </div>
        </div>
        <div className="settings-list">
          <div><b>Cliente por CPF/CNPJ</b><span>Correspondência</span></div>
          <div><b>Cliente por nome + telefone</b><span>Correspondência</span></div>
          <div><b>Produto por código</b><span>Correspondência</span></div>
          <div><b>Produto por código de barras</b><span>Correspondência</span></div>
          <div><b>Produto por identidade</b><span>Descrição + marca + modelo</span></div>
          <div><b>Histórico</b><span>Preservado em LegacyRecord</span></div>
        </div>
      </div>
    </div>

    {records&&<div className="panel">
      <div className="panel-heading">
        <div>
          <h2>{result?"Resultado da reconciliação":"Backup preparado"}</h2>
          <p>{result?"O backup não substitui os dados atuais; ele apenas acrescenta o que não foi localizado.":"Nenhuma alteração foi feita no banco. Confira o total e confirme acima para executar."}</p>
        </div>
      </div>

      {!result
        ? <div className="settings-list"><div><b>Registros carregados</b><span>{records?.length.toLocaleString("pt-BR")}</span></div><div><b>Status</b><span>Nenhuma alteração realizada</span></div></div>
        : <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10}}>
            {[
              ["Clientes novos",result.customerCreated],
              ["Clientes já existentes",result.customerMatched],
              ["Produtos novos",result.productCreated],
              ["Produtos já existentes",result.productMatched],
            ].map(([label,value])=>
              <div key={String(label)} style={{border:"1px solid var(--line)",borderRadius:12,padding:14}}>
                <small style={{display:"block",color:"var(--muted)",marginBottom:7}}>{String(label)}</small>
                <strong style={{fontSize:24}}>{Number(value).toLocaleString("pt-BR")}</strong>
              </div>
            )}
          </div>

          <div className="settings-list" style={{marginTop:14}}>
            <div><b>Registros analisados</b><span>{result.totalRecords.toLocaleString("pt-BR")}</span></div>
            <div><b>Clientes no backup</b><span>{result.customerSource.toLocaleString("pt-BR")}</span></div>
            <div><b>Produtos no backup</b><span>{result.productSource.toLocaleString("pt-BR")}</span></div>
            <div><b>Registros históricos preservados</b><span>{result.legacyCreated.toLocaleString("pt-BR")}</span></div>\n            <div><b>Alertas de validação</b><span>{(result.warnings?.length ?? 0).toLocaleString("pt-BR")}</span></div>
            <div><b>Fingerprint</b><code>{result.fingerprint}</code></div>
          </div>

          <div style={{marginTop:14,padding:12,borderRadius:10,background:"#f7f9fb",color:"var(--muted)",fontSize:12}}>
            <b>Importante:</b> nesta fase somente <code>Cliente</code> e <code>Produto</code> são incorporados ao cadastro operacional. As demais coleções do backup continuam preservadas como histórico, sem alterar vendas, estoque ou financeiro.
          </div>
        </>
      }
    </div>}
  </section>;
}
