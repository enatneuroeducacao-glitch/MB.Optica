"use client";

import { useMemo, useState } from "react";

type MonthRow = { mes: string; faturamento: number };
type Payload = {
  schema: string; origem: string; arquivo_origem?: string; gerado_em?: string;
  granularidade: string; somente_agregados: boolean; inclui_registros_individuais_de_venda: boolean;
  resumo: { faturamento_total_reconhecido: number; faturamento_total_detectado_pela_C2_incluindo_canceladas?: number; valor_cancelado_excluido?: number; vendas_canceladas_excluidas?: number; quantidade_meses: number };
  mensal: MonthRow[];
};
const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const monthLabel = (s: string) => { const [y,m]=s.split("-").map(Number); return new Date(y,m-1,1).toLocaleDateString("pt-BR",{month:"long",year:"numeric"}); };

export default function Page() {
  const [file,setFile] = useState<File|null>(null);
  const [data,setData] = useState<Payload|null>(null);
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);
  const [result,setResult] = useState<any>(null);
  const total = useMemo(()=>data?.mensal.reduce((s,r)=>s+Number(r.faturamento||0),0)||0,[data]);

  async function readFile() {
    if (!file) return;
    setBusy(true); setMessage(""); setData(null); setResult(null);
    try {
      const parsed = JSON.parse(await file.text()) as Payload;
      if (parsed.schema !== "mb-gestao.faturamento-agregado.v1" || !Array.isArray(parsed.mensal)) {
        throw new Error("Este não é o JSON de faturamento agregado. Selecione MB-Gestao-Faturamento-Agregado-Mensal.json, não o backup completo do BeepStart nem o CSV.");
      }
      const months = new Set<string>();
      for (const row of parsed.mensal) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.mes) || !Number.isFinite(Number(row.faturamento)) || Number(row.faturamento)<0) throw new Error("O arquivo contém uma competência ou valor inválido.");
        if (months.has(row.mes)) throw new Error("Há competência duplicada no arquivo: "+row.mes);
        months.add(row.mes);
      }
      const sum = Math.round(parsed.mensal.reduce((s,r)=>s+Number(r.faturamento),0)*100)/100;
      if (Math.abs(sum-Number(parsed.resumo?.faturamento_total_reconhecido))>0.01) throw new Error("A soma mensal não confere com o total declarado. Importação bloqueada.");
      setData(parsed); setMessage("Arquivo validado. Nenhum dado foi gravado. Confira o resumo antes de importar.");
    } catch(e) { setMessage(e instanceof Error?e.message:"Não foi possível ler o JSON."); }
    finally { setBusy(false); }
  }

  async function importData() {
    if (!data) return;
    setBusy(true); setMessage(""); setResult(null);
    try {
      const r=await fetch("/api/migration/faturamento-agregado",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
      const d=await r.json();
      if (!r.ok) throw new Error(d.error||"Falha na importação.");
      setResult(d); setMessage(d.message||"Importação concluída.");
    } catch(e) { setMessage(e instanceof Error?e.message:"Não foi possível importar o faturamento."); }
    finally { setBusy(false); }
  }

  return <section className="page">
    <div className="page-heading">
      <div><span className="eyebrow">FASE C3 · FATURAMENTO AGREGADO</span><h1>Importar faturamento histórico mensal</h1><p>Importa somente totais por competência. Não cria vendas, clientes, produtos, pagamentos individuais, movimentos de caixa ou lançamentos contábeis.</p></div>
      <div className="settings-status"><b>● IMPORTAÇÃO CONTROLADA</b><span>Administrador</span></div>
    </div>
    {message&&<div className="panel settings-message">{message}</div>}
    <div className="panel" style={{marginBottom:16,borderLeft:"4px solid #087f73"}}>
      <div className="panel-heading"><div><span className="eyebrow">ARQUIVO AGREGADO</span><h2>Selecionar JSON de faturamento</h2><p>Use o arquivo MB-Gestao-Faturamento-Agregado-Mensal.json. Este leitor é separado da C1/C2 do backup completo.</p></div><a className="secondary" href="/migracao/faturamento">Voltar para C1/C2</a></div>
      <input type="file" accept=".json,application/json" onChange={e=>{setFile(e.target.files?.[0]||null);setData(null);setResult(null);setMessage("");}} />
      <button className="primary" disabled={!file||busy} onClick={readFile} style={{marginTop:10}}>{busy?"Validando...":"Validar faturamento agregado"}</button>
    </div>
    {data&&<div className="panel">
      <div className="panel-heading"><div><span className="eyebrow">PRÉ-VALIDAÇÃO</span><h2>Conferência antes da gravação</h2><p>Origem: {data.origem} · Arquivo: {data.arquivo_origem||"não informado"} · {data.mensal.length} competências</p></div><b>✓ SEM VENDAS INDIVIDUAIS</b></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10,marginBottom:16}}>
        {[["Faturamento reconhecido",money(total)],["Cancelamentos excluídos",money(Number(data.resumo.valor_cancelado_excluido||0))],["Vendas canceladas excluídas",String(data.resumo.vendas_canceladas_excluidas||0)]].map(([label,value])=><div key={label} style={{border:"1px solid var(--line)",borderRadius:12,padding:14}}><small style={{display:"block",color:"var(--muted)"}}>{label}</small><strong style={{fontSize:21}}>{value}</strong></div>)}
      </div>
      <div className="table" style={{marginTop:10}}>
        <div className="row header"><span>Competência</span><span>Faturamento histórico</span></div>
        {data.mensal.map(r=><div className="row" key={r.mes}><span>{monthLabel(r.mes)}</span><strong>{money(Number(r.faturamento))}</strong></div>)}
        <div className="row"><strong>Total</strong><strong>{money(total)}</strong></div>
      </div>
      <div style={{marginTop:16,padding:14,border:"1px solid var(--line)",borderRadius:12}}><b>Proteções</b><p>Importação idempotente por mês e origem. Se já existir valor diferente para uma competência, a operação será bloqueada sem substituir dados. Não serão gerados eventos contábeis automaticamente.</p></div>
      <button className="primary" disabled={busy||Boolean(result)} onClick={importData} style={{marginTop:14}}>{busy?"Importando...":"Confirmar importação do faturamento mensal"}</button>
    </div>}
    {result&&<div className="panel" style={{marginTop:16}}><h2>Resultado da importação</h2><p>{result.message}</p><div className="settings-list"><div><b>Competências no arquivo</b><span>{result.months}</span></div><div><b>Competências gravadas agora</b><span>{result.importedMonths}</span></div><div><b>Já existentes sem duplicação</b><span>{result.alreadyPresentMonths}</span></div><div><b>Total histórico</b><span>{money(result.total)}</span></div></div><p>O sistema não criou vendas nem movimentações financeiras. A integração exibida no Financeiro depende da publicação desta versão.</p></div>}
  </section>;
}
