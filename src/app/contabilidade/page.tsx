"use client";

import { useCallback, useEffect, useState } from "react";

type Account = { id: string; code: string; name: string; nature: string; accountType: string; description?: string | null; parentId?: string | null; active: boolean };
type Period = { id: string; year: number; month: number; status: string; startDate: string; endDate: string };
type Settings = { taxRegime: string; accountingStartDate?: string | null } | null;
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const types = [{value:"ATIVO",label:"Ativo"},{value:"PASSIVO",label:"Passivo"},{value:"PATRIMONIO_LIQUIDO",label:"Patrimônio líquido"},{value:"RECEITA",label:"Receita"},{value:"DESPESA",label:"Despesa"},{value:"CUSTO",label:"Custo"}];

export default function ContabilidadePage() {
  const [settings, setSettings] = useState<Settings>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"resumo"|"contas"|"periodos">("resumo");
  const [startDate, setStartDate] = useState("");
  const [account, setAccount] = useState({code:"",name:"",nature:"DEVEDORA",accountType:"ATIVO",description:"",parentId:""});
  const [period, setPeriod] = useState({year:String(new Date().getFullYear()),month:String(new Date().getMonth()+1)});

  const load = useCallback(async () => {
    const response = await fetch("/api/contabilidade", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível carregar a contabilidade.");
    setSettings(data.settings);
    setStartDate(data.settings?.accountingStartDate ? String(data.settings.accountingStartDate).slice(0,10) : "");
    setAccounts(data.accounts || []);
    setPeriods(data.periods || []);
  }, []);

  useEffect(() => { load().catch((e) => setMessage(e.message)); }, [load]);

  async function send(payload: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/contabilidade", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar.");
      setMessage("Alterações salvas.");
      await load();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro inesperado.");
      return false;
    } finally { setBusy(false); }
  }

  const field: React.CSSProperties = {width:"100%",padding:"10px 12px",border:"1px solid var(--line)",borderRadius:9,background:"var(--surface)",color:"var(--text)",marginTop:6};
  const card: React.CSSProperties = {background:"var(--surface)",border:"1px solid var(--line)",borderRadius:14,padding:20,boxShadow:"var(--shadow)"};
  const button: React.CSSProperties = {border:0,borderRadius:9,padding:"10px 14px",background:"var(--brand-dark)",color:"#fff",fontWeight:700,cursor:"pointer"};
  const secondary: React.CSSProperties = {border:"1px solid var(--line)",borderRadius:9,padding:"9px 13px",background:"var(--surface)",color:"var(--text)",cursor:"pointer"};

  return <section style={{padding:"28px 34px 44px",maxWidth:1400,margin:"0 auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap",marginBottom:22}}>
      <div><span className="eyebrow">ADMINISTRAÇÃO · ACESSO RESTRITO</span><h1 style={{margin:"4px 0 8px",fontSize:28}}>Contabilidade</h1><p style={{margin:0,color:"var(--muted)",maxWidth:760}}>Estrutura contábil da MB Óptica. Nesta fase, configure o período inicial, o plano de contas e os meses contábeis.</p></div>
      <span style={{padding:"8px 11px",borderRadius:20,background:"#e8f3e8",color:"#28643a",fontSize:12,fontWeight:700}}>Simples Nacional · configuração</span>
    </div>

    {message && <div role="status" style={{...card,marginBottom:16,padding:12,borderColor:message.includes("Erro")||message.includes("inválid")?"#c66":"var(--line)"}}>{message}</div>}

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14,marginBottom:20}}>
      <div style={card}><div style={{fontSize:12,color:"var(--muted)"}}>Contas cadastradas</div><strong style={{fontSize:30,display:"block",marginTop:8}}>{accounts.length}</strong><small style={{color:"var(--muted)"}}>Plano de contas</small></div>
      <div style={card}><div style={{fontSize:12,color:"var(--muted)"}}>Períodos criados</div><strong style={{fontSize:30,display:"block",marginTop:8}}>{periods.length}</strong><small style={{color:"var(--muted)"}}>Competências mensais</small></div>
      <div style={card}><div style={{fontSize:12,color:"var(--muted)"}}>Regime configurado</div><strong style={{fontSize:20,display:"block",marginTop:13}}>Simples Nacional</strong><small style={{color:"var(--muted)"}}>Confirme com a contabilidade responsável</small></div>
    </div>

    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>
      {([["resumo","Configuração"],["contas","Plano de contas"],["periodos","Períodos contábeis"]] as const).map(([key,label])=><button key={key} onClick={()=>setTab(key)} style={tab===key?button:secondary}>{label}</button>)}
    </div>

    {tab==="resumo" && <div style={{...card,maxWidth:800}}>
      <h2 style={{fontSize:18,marginTop:0}}>Configuração inicial</h2>
      <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.6}}>A escolha do regime nesta tela é uma configuração do sistema, não uma validação fiscal ou confirmação de enquadramento. Não há envio de declarações nem escrituração oficial nesta etapa.</p>
      <label style={{display:"block",marginTop:16,fontSize:13,fontWeight:700}}>Regime tributário<select value={settings?.taxRegime || "SIMPLES_NACIONAL"} onChange={(e)=>setSettings({taxRegime:e.target.value,accountingStartDate:settings?.accountingStartDate})} style={field}><option value="SIMPLES_NACIONAL">Simples Nacional</option></select></label>
      <label style={{display:"block",marginTop:16,fontSize:13,fontWeight:700}}>Data inicial para organização contábil<input type="date" value={startDate} onChange={(e)=>setStartDate(e.target.value)} style={field}/></label>
      <button disabled={busy} style={{...button,marginTop:18,opacity:busy ? 0.65 : 1}} onClick={()=>send({action:"SAVE_SETTINGS",taxRegime:settings?.taxRegime||"SIMPLES_NACIONAL",accountingStartDate:startDate||null})}>{busy?"Salvando…":"Salvar configuração"}</button>
    </div>}

    {tab==="contas" && <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:18,alignItems:"start"}}>
      <form style={card} onSubmit={async(e)=>{e.preventDefault();const ok=await send({action:"CREATE_ACCOUNT",...account});if(ok)setAccount({code:"",name:"",nature:"DEVEDORA",accountType:"ATIVO",description:"",parentId:""});}}>
        <h2 style={{fontSize:18,marginTop:0}}>Nova conta contábil</h2>
        <label style={{display:"block",fontSize:13,fontWeight:700}}>Código<input required value={account.code} onChange={e=>setAccount({...account,code:e.target.value})} placeholder="Ex.: 1.1.01" style={field}/></label>
        <label style={{display:"block",marginTop:12,fontSize:13,fontWeight:700}}>Nome<input required maxLength={120} value={account.name} onChange={e=>setAccount({...account,name:e.target.value})} placeholder="Ex.: Caixa" style={field}/></label>
        <label style={{display:"block",marginTop:12,fontSize:13,fontWeight:700}}>Tipo<select value={account.accountType} onChange={e=>setAccount({...account,accountType:e.target.value,nature:["ATIVO","DESPESA","CUSTO"].includes(e.target.value)?"DEVEDORA":"CREDORA"})} style={field}>{types.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
        <label style={{display:"block",marginTop:12,fontSize:13,fontWeight:700}}>Natureza<select value={account.nature} onChange={e=>setAccount({...account,nature:e.target.value})} style={field}><option value="DEVEDORA">Devedora</option><option value="CREDORA">Credora</option></select></label>
        <label style={{display:"block",marginTop:12,fontSize:13,fontWeight:700}}>Conta superior<select value={account.parentId} onChange={e=>setAccount({...account,parentId:e.target.value})} style={field}><option value="">Sem conta superior</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>
        <label style={{display:"block",marginTop:12,fontSize:13,fontWeight:700}}>Descrição<textarea value={account.description} onChange={e=>setAccount({...account,description:e.target.value})} style={{...field,minHeight:72}}/></label>
        <button disabled={busy} style={{...button,marginTop:16,opacity:busy ? 0.65 : 1}}>Cadastrar conta</button>
      </form>
      <div style={card}><h2 style={{fontSize:18,marginTop:0}}>Plano de contas</h2>{accounts.length===0?<p style={{color:"var(--muted)",fontSize:13}}>Nenhuma conta cadastrada. Adicione as contas que correspondem ao plano validado pela contabilidade responsável.</p>:<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Código","Conta","Tipo","Natureza"].map(x=><th key={x} style={{textAlign:"left",padding:"10px 8px",borderBottom:"1px solid var(--line)"}}>{x}</th>)}</tr></thead><tbody>{accounts.map(a=><tr key={a.id}><td style={{padding:"10px 8px",borderBottom:"1px solid var(--line)",whiteSpace:"nowrap"}}>{a.code}</td><td style={{padding:"10px 8px",borderBottom:"1px solid var(--line)"}}>{a.name}</td><td style={{padding:"10px 8px",borderBottom:"1px solid var(--line)"}}>{types.find(t=>t.value===a.accountType)?.label||a.accountType}</td><td style={{padding:"10px 8px",borderBottom:"1px solid var(--line)"}}>{a.nature==="DEVEDORA"?"Devedora":"Credora"}</td></tr>)}</tbody></table></div>}</div>
    </div>}

    {tab==="periodos" && <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:18,alignItems:"start"}}>
      <form style={card} onSubmit={async(e)=>{e.preventDefault();await send({action:"CREATE_PERIOD",year:Number(period.year),month:Number(period.month)});}}>
        <h2 style={{fontSize:18,marginTop:0}}>Abrir período mensal</h2>
        <label style={{display:"block",fontSize:13,fontWeight:700}}>Ano<input type="number" min="2000" max="2100" required value={period.year} onChange={e=>setPeriod({...period,year:e.target.value})} style={field}/></label>
        <label style={{display:"block",marginTop:12,fontSize:13,fontWeight:700}}>Mês<select value={period.month} onChange={e=>setPeriod({...period,month:e.target.value})} style={field}>{monthNames.map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select></label>
        <button disabled={busy} style={{...button,marginTop:16,opacity:busy ? 0.65 : 1}}>Criar período aberto</button>
      </form>
      <div style={card}><h2 style={{fontSize:18,marginTop:0}}>Períodos recentes</h2>{periods.length===0?<p style={{color:"var(--muted)",fontSize:13}}>Nenhum período criado.</p>:periods.map(p=><div key={p.id} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"12px 0",borderBottom:"1px solid var(--line)"}}><div><strong>{monthNames[p.month-1]} de {p.year}</strong><div style={{fontSize:12,color:"var(--muted)",marginTop:4}}>{new Date(p.startDate).toLocaleDateString("pt-BR")} – {new Date(p.endDate).toLocaleDateString("pt-BR")}</div></div><span style={{fontSize:12,fontWeight:700,color:p.status==="ABERTO"?"#28643a":"var(--muted)"}}>{p.status}</span></div>)}</div>
    </div>}
    <p style={{fontSize:12,color:"var(--muted)",marginTop:20}}>Nesta fase não são gerados lançamentos automáticos, balancetes oficiais nem declarações fiscais. Os dados serão integrados aos módulos operacionais após validação contábil.</p>
  </section>;
}
