"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

type Account = { id: string; code: string; name: string; nature: string; accountType: string; description?: string | null; parentId?: string | null; active: boolean };
type Period = { id: string; year: number; month: number; status: string; startDate: string; endDate: string };
type Settings = { taxRegime: string; accountingStartDate?: string | null } | null;
type Entry = { id:string; description:string; entryDate:string; status:string; totalDebit:string|number; totalCredit:string|number; period:{year:number;month:number}; lines:{id:string;debit:string|number;credit:string|number;account:{code:string;name:string}}[]; reversedAt?:string|null };
const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const eventLabels: Record<string,string> = {
  SALE_RECOGNIZED: "Venda reconhecida",
  PAYMENT_RECEIVED: "Recebimento de venda",
  SALE_REFUNDED: "Devolução de venda",
  PAYMENT_REVERSED: "Estorno de recebimento",
  SUPPLIER_EXPENSE_RECOGNIZED: "Despesa de fornecedor reconhecida",
  SUPPLIER_PAYMENT_MADE: "Pagamento a fornecedor",
};
const sourceLabels: Record<string,string> = { SALE: "Venda", PAYMENT: "Pagamento", SUPPLIER: "Fornecedor", MANUAL: "Manual" };
const eventStatusLabels: Record<string,string> = {
  PENDENTE: "Pendente",
  PROCESSANDO: "Em processamento",
  PROCESSADO: "Processado",
  ERRO: "Erro",
};
const types = [{value:"ATIVO",label:"Ativo"},{value:"PASSIVO",label:"Passivo"},{value:"PATRIMONIO_LIQUIDO",label:"Patrimônio líquido"},{value:"RECEITA",label:"Receita"},{value:"DESPESA",label:"Despesa"},{value:"CUSTO",label:"Custo"}];

export default function ContabilidadePage() {
  const [settings, setSettings] = useState<Settings>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [journal, setJournal] = useState({entryDate:new Date().toISOString().slice(0,10),competenceDate:new Date().toISOString().slice(0,10),description:"",periodId:"",debitAccountId:"",creditAccountId:"",amount:""});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"resumo"|"contas"|"periodos"|"lancamentos"|"relatorios"|"mapeamentos"|"eventos">("resumo");
  const [mappingData, setMappingData] = useState<any>({mappings:[],events:[],accounts:[],supportedEventTypes:[],integrationDiagnostics:null});
  const [mappingForm, setMappingForm] = useState({eventType:"SALE_RECOGNIZED",paymentMethodId:"",debitAccountId:"",creditAccountId:"",description:""});
  const [reportType, setReportType] = useState<"balancete"|"diario"|"razao"|"reconciliacao">("balancete");
  const [reportPeriodId, setReportPeriodId] = useState("");
  const [reportAccountId, setReportAccountId] = useState("");
  const [reportData, setReportData] = useState<any>(null);
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
    const journalResponse = await fetch("/api/contabilidade/lancamentos", { cache: "no-store" });
    const journalData = await journalResponse.json();
    if (!journalResponse.ok) throw new Error(journalData.error || "Não foi possível carregar o diário.");
    setEntries(journalData.entries || []);
    const mappingResponse = await fetch("/api/contabilidade/mapeamentos", { cache: "no-store" });
    const mappingJson = await mappingResponse.json();
    if (!mappingResponse.ok) throw new Error(mappingJson.error || "Não foi possível carregar os mapeamentos.");
    setMappingData(mappingJson);
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

  const field: CSSProperties = {width:"100%",padding:"10px 12px",border:"1px solid var(--line)",borderRadius:9,background:"var(--surface)",color:"var(--text)",marginTop:6};
  const card: CSSProperties = {background:"var(--surface)",border:"1px solid var(--line)",borderRadius:14,padding:20,boxShadow:"var(--shadow)"};
  const button: CSSProperties = {border:0,borderRadius:9,padding:"10px 14px",background:"var(--brand-dark)",color:"#fff",fontWeight:700,cursor:"pointer"};
  const secondary: CSSProperties = {border:"1px solid var(--line)",borderRadius:9,padding:"9px 13px",background:"var(--surface)",color:"var(--text)",cursor:"pointer"};

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
      {([["resumo","Configuração"],["contas","Plano de contas"],["periodos","Períodos contábeis"],["lancamentos","Lançamentos"],["relatorios","Relatórios"],["mapeamentos","Integração contábil"],["eventos","Eventos contábeis"]] as const).map(([key,label])=><button key={key} onClick={()=>setTab(key)} style={tab===key?button:secondary}>{label}</button>)}
    </div>

    {tab==="resumo" && <div style={{...card,maxWidth:800}}>
      <h2 style={{fontSize:18,marginTop:0}}>Configuração inicial</h2>
      <div style={{border:"1px solid var(--line)",borderRadius:10,padding:14,marginBottom:16}}>
        <strong>Preparar estrutura contábil</strong>
        <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.6}}>Cria um plano de contas inicial sugerido e abre o período do mês atual, somente se ainda não houver plano cadastrado. Não cria lançamentos nem processa eventos. As contas devem ser revisadas pela contabilidade responsável antes de configurar os mapeamentos.</p>
        <button type="button" disabled={busy||accounts.length>0} style={{...button,opacity:busy||accounts.length>0?0.55:1}} onClick={async()=>{if(!window.confirm("Preparar o plano de contas inicial e o período atual? Isso não cria lançamentos financeiros e não poderá ser executado se já houver contas cadastradas."))return;await send({action:"PREPARE_INITIAL_STRUCTURE"});}}>{accounts.length>0?"Plano de contas já iniciado":"Preparar estrutura inicial"}</button>
      </div>
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
    {tab==="lancamentos" && <div style={{display:"grid",gap:18}}>
      <form style={card} onSubmit={async(e)=>{e.preventDefault();setBusy(true);setMessage("");try{const amount=Number(journal.amount);const response=await fetch("/api/contabilidade/lancamentos",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"POST_ENTRY",entryDate:journal.entryDate,competenceDate:journal.competenceDate,description:journal.description,periodId:journal.periodId,lines:[{accountId:journal.debitAccountId,debit:amount,credit:0},{accountId:journal.creditAccountId,debit:0,credit:amount}]})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Falha ao contabilizar");setMessage("Lançamento contabilizado com sucesso.");setJournal({...journal,description:"",amount:""});await load();}catch(err){setMessage(err instanceof Error?err.message:"Falha no lançamento");}finally{setBusy(false);}}}>
        <h2 style={{fontSize:18,marginTop:0}}>Novo lançamento manual</h2>
        <p style={{fontSize:13,color:"var(--muted)"}}>Nesta primeira versão, cada lançamento usa uma conta de débito e uma de crédito pelo mesmo valor. O registro é definitivo; correções devem ser feitas por estorno.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
          <label style={{fontSize:13,fontWeight:700}}>Data do lançamento<input required type="date" value={journal.entryDate} onChange={e=>setJournal({...journal,entryDate:e.target.value})} style={field}/></label>
          <label style={{fontSize:13,fontWeight:700}}>Competência<input required type="date" value={journal.competenceDate} onChange={e=>setJournal({...journal,competenceDate:e.target.value})} style={field}/></label>
          <label style={{fontSize:13,fontWeight:700}}>Período contábil<select required value={journal.periodId} onChange={e=>setJournal({...journal,periodId:e.target.value})} style={field}><option value="">Selecione período aberto</option>{periods.filter(p=>p.status==="ABERTO").map(p=><option key={p.id} value={p.id}>{monthNames[p.month-1]} de {p.year}</option>)}</select></label>
          <label style={{fontSize:13,fontWeight:700}}>Valor (R$)<input required type="number" min="0.01" step="0.01" value={journal.amount} onChange={e=>setJournal({...journal,amount:e.target.value})} style={field}/></label>
          <label style={{fontSize:13,fontWeight:700}}>Meio de pagamento{mappingForm.eventType==="PAYMENT_RECEIVED"?<select required style={field} value={mappingForm.paymentMethodId} onChange={e=>setMappingForm({...mappingForm,paymentMethodId:e.target.value})}><option value="">Selecione</option>{(mappingData.paymentMethods||[]).map((m:any)=><option key={m.id} value={m.id}>{m.name}</option>)}</select>:<div style={{...field,color:"var(--muted)"}}>Não se aplica a este evento</div>}</label>
      <label style={{fontSize:13,fontWeight:700}}>Conta de débito<select required value={journal.debitAccountId} onChange={e=>setJournal({...journal,debitAccountId:e.target.value})} style={field}><option value="">Selecione</option>{accounts.filter(a=>a.active).map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>
          <label style={{fontSize:13,fontWeight:700}}>Conta de crédito<select required value={journal.creditAccountId} onChange={e=>setJournal({...journal,creditAccountId:e.target.value})} style={field}><option value="">Selecione</option>{accounts.filter(a=>a.active).map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>
        </div>
        <label style={{display:"block",marginTop:12,fontSize:13,fontWeight:700}}>Histórico / descrição<input required maxLength={240} value={journal.description} onChange={e=>setJournal({...journal,description:e.target.value})} style={field}/></label>
        <button disabled={busy||accounts.length<2||periods.filter(p=>p.status==="ABERTO").length===0} style={{...button,marginTop:16,opacity:busy?0.65:1}}>{busy?"Processando…":"Validar e contabilizar"}</button>
      </form>
      <div style={card}><h2 style={{fontSize:18,marginTop:0}}>Diário contábil recente</h2>{entries.length===0?<p style={{color:"var(--muted)",fontSize:13}}>Nenhum lançamento registrado. Cadastre contas e abra um período antes de lançar.</p>:<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Data","Histórico","Período","Débitos","Créditos","Estado"].map(x=><th key={x} style={{textAlign:"left",padding:9,borderBottom:"1px solid var(--line)"}}>{x}</th>)}</tr></thead><tbody>{entries.map(en=><tr key={en.id}><td style={{padding:9,borderBottom:"1px solid var(--line)",whiteSpace:"nowrap"}}>{new Date(en.entryDate).toLocaleDateString("pt-BR")}</td><td style={{padding:9,borderBottom:"1px solid var(--line)"}}>{en.description}<div style={{fontSize:11,color:"var(--muted)"}}>{en.lines.map(l=>l.account.code+" "+l.account.name+" (D "+Number(l.debit).toFixed(2)+" / C "+Number(l.credit).toFixed(2)+")").join(" · ")}</div></td><td style={{padding:9,borderBottom:"1px solid var(--line)"}}>{String(en.period.month).padStart(2,"0")}/{en.period.year}</td><td style={{padding:9,borderBottom:"1px solid var(--line)"}}>{Number(en.totalDebit).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td><td style={{padding:9,borderBottom:"1px solid var(--line)"}}>{Number(en.totalCredit).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td><td style={{padding:9,borderBottom:"1px solid var(--line)"}}>{en.status}</td></tr>)}</tbody></table></div>}</div>
    </div>}
    {tab==="relatorios" && <div style={{display:"grid",gap:18}}>
      <div style={card}>
        <h2 style={{fontSize:18,marginTop:0}}>Relatórios contábeis internos</h2>
        <p style={{fontSize:13,color:"var(--muted)"}}>Relatórios gerenciais baseados nos lançamentos contabilizados. Não substituem livros oficiais revisados pela contabilidade responsável.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12}}>
          <label style={{fontSize:13,fontWeight:700}}>Relatório<select value={reportType} onChange={e=>{setReportType(e.target.value as typeof reportType);setReportData(null);}} style={field}><option value="balancete">Balancete de verificação</option><option value="diario">Livro Diário</option><option value="razao">Livro Razão</option><option value="reconciliacao">Reconciliação</option></select></label>
          <label style={{fontSize:13,fontWeight:700}}>Período contábil<select value={reportPeriodId} onChange={e=>{setReportPeriodId(e.target.value);setReportData(null);}} style={field}><option value="">Selecione</option>{periods.map(p=><option key={p.id} value={p.id}>{monthNames[p.month-1]} de {p.year}</option>)}</select></label>
          {reportType==="razao" && <label style={{fontSize:13,fontWeight:700}}>Conta<select value={reportAccountId} onChange={e=>{setReportAccountId(e.target.value);setReportData(null);}} style={field}><option value="">Selecione</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>}
        </div>
        <button disabled={busy||!reportPeriodId||(reportType==="razao"&&!reportAccountId)} style={{...button,marginTop:14,opacity:busy?0.65:1}} onClick={async()=>{setBusy(true);setMessage("");try{const params=new URLSearchParams({periodId:reportPeriodId,report:reportType});if(reportType==="razao")params.set("accountId",reportAccountId);const response=await fetch("/api/contabilidade/relatorios?"+params.toString(),{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"Falha ao gerar relatório.");setReportData(data);}catch(err){setMessage(err instanceof Error?err.message:"Falha ao gerar relatório.");}finally{setBusy(false);}}}>{busy?"Gerando…":"Gerar relatório"}</button>
      </div>
      {reportData && <div style={card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><h2 style={{fontSize:18,marginTop:0}}>{reportType==="balancete"?"Balancete de verificação":reportType==="diario"?"Livro Diário":reportType==="razao"?"Livro Razão":"Reconciliação contábil"}</h2><button style={secondary} onClick={()=>window.print()}>Imprimir / salvar PDF</button></div>
        {reportType==="reconciliacao" ? <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12,marginBottom:16}}>
            {[
              ["Eventos encontrados",reportData.summary.events],
              ["Eventos pendentes",reportData.summary.pendingEvents],
              ["Processados sem lançamento no período",reportData.summary.processedWithoutEntry],
              ["Lançamentos desequilibrados",reportData.summary.unbalancedEntries],
              ["Evento × lançamento divergente",reportData.summary.eventEntryMismatches ?? 0],
              ["Lançamentos sem evento de origem",reportData.summary.orphanEntries ?? 0],
            ].map(([label,value]:any)=><div key={label} style={{padding:14,border:"1px solid var(--line)",borderRadius:10}}>
              <div style={{fontSize:12,color:"var(--muted)"}}>{label}</div><strong style={{fontSize:24,display:"block",marginTop:6}}>{value}</strong>
            </div>)}
          </div>
          <p role="status" style={{fontWeight:700,color:reportData.summary.balanced?"#28643a":"var(--danger)"}}>
            {reportData.summary.balanced ? "Verificação concluída: nenhum problema identificado nos itens verificados." : "Atenção: há itens que precisam de análise antes de considerar o período conciliado."}
          </p>
          {reportData.unbalancedEntries.length>0 && <div style={{overflowX:"auto",marginBottom:18}}><h3>Lançamentos com divergência</h3><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Lançamento","Débito cabeçalho","Crédito cabeçalho","Débito das linhas","Crédito das linhas"].map(x=><th key={x} style={{textAlign:"left",padding:8,borderBottom:"1px solid var(--line)"}}>{x}</th>)}</tr></thead><tbody>{reportData.unbalancedEntries.map((entry:any)=><tr key={entry.entryId}><td style={{padding:8,borderBottom:"1px solid var(--line)"}}>{entry.description}</td>{[entry.headerDebit,entry.headerCredit,entry.lineDebit,entry.lineCredit].map((v:number,i:number)=><td key={i} style={{padding:8,borderBottom:"1px solid var(--line)"}}>{Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>)}</tr>)}</tbody></table></div>}
          {reportData.events.length===0 ? <p style={{color:"var(--muted)"}}>Nenhum evento localizado para as datas deste período.</p> : <div style={{overflowX:"auto"}}><h3>Eventos operacionais</h3><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Tipo","Origem","Status","Chave de prevenção de duplicidade","Lançamento vinculado","Erro"].map(x=><th key={x} style={{textAlign:"left",padding:8,borderBottom:"1px solid var(--line)"}}>{x}</th>)}</tr></thead><tbody>{reportData.events.map((event:any)=><tr key={event.id}><td style={{padding:8,borderBottom:"1px solid var(--line)"}}>{eventLabels[event.eventType]||"Evento não identificado"}</td><td style={{padding:8,borderBottom:"1px solid var(--line)"}}>{sourceLabels[event.sourceType]||"Origem operacional"} · {event.sourceId}</td><td style={{padding:8,borderBottom:"1px solid var(--line)"}}>{eventStatusLabels[event.status]||event.status}</td><td style={{padding:8,borderBottom:"1px solid var(--line)",wordBreak:"break-word"}}>{event.idempotencyKey}</td><td style={{padding:8,borderBottom:"1px solid var(--line)"}}>{event.processedEntryInPeriod?"Encontrado":event.entryId?"Fora do período ou não encontrado":"Não vinculado"}</td><td style={{padding:8,borderBottom:"1px solid var(--line)"}}>{event.errorMessage||"—"}</td></tr>)}</tbody></table></div>}
          <p style={{fontSize:12,color:"var(--muted)"}}>A verificação é diagnóstica: não altera nem processa eventos automaticamente. Eventos são associados ao período pela data contábil do conteúdo (ou, na ausência dele, pela data de criação); revise divergências com a contabilidade responsável.</p>
        </div> : reportType==="balancete" ? <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Conta","Débitos","Créditos","Saldo devedor","Saldo credor"].map(x=><th key={x} style={{textAlign:"right",padding:9,borderBottom:"1px solid var(--line)"}}>{x}</th>)}</tr></thead><tbody>{reportData.accounts.map((a:any)=><tr key={a.accountId}><td style={{textAlign:"left",padding:9,borderBottom:"1px solid var(--line)"}}>{a.code} — {a.name}</td>{[a.debit,a.credit,a.debitBalance,a.creditBalance].map((v:number,i:number)=><td key={i} style={{textAlign:"right",padding:9,borderBottom:"1px solid var(--line)"}}>{Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>)}</tr>)}</tbody><tfoot><tr>{["Totais",reportData.totalDebit,reportData.totalCredit,reportData.totalDebitBalance,reportData.totalCreditBalance].map((v:any,i:number)=><td key={i} style={{textAlign:i===0?"left":"right",padding:9,fontWeight:800,borderTop:"2px solid var(--line)"}}>{i===0?v:Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>)}</tr></tfoot></table></div> :
        <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Data","Conta","Histórico","Débito","Crédito",...(reportType==="razao"?["Saldo acumulado"]:[])].map(x=><th key={x} style={{textAlign:"left",padding:9,borderBottom:"1px solid var(--line)"}}>{x}</th>)}</tr></thead><tbody>{reportData.rows.map((r:any,i:number)=><tr key={r.entryId+"-"+r.lineNumber+"-"+i}><td style={{padding:9,borderBottom:"1px solid var(--line)"}}>{new Date(r.entryDate).toLocaleDateString("pt-BR")}</td><td style={{padding:9,borderBottom:"1px solid var(--line)"}}>{r.accountCode} — {r.accountName}</td><td style={{padding:9,borderBottom:"1px solid var(--line)"}}>{r.description}</td><td style={{padding:9,borderBottom:"1px solid var(--line)"}}>{Number(r.debit).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td><td style={{padding:9,borderBottom:"1px solid var(--line)"}}>{Number(r.credit).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>{reportType==="razao"&&<td style={{padding:9,borderBottom:"1px solid var(--line)"}}>{Number(r.runningBalance).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>}</tr>)}</tbody><tfoot><tr><td colSpan={3} style={{padding:9,fontWeight:800}}>Totais</td><td style={{padding:9,fontWeight:800}}>{Number(reportData.totalDebit).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td><td style={{padding:9,fontWeight:800}}>{Number(reportData.totalCredit).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>{reportType==="razao"&&<td style={{padding:9,fontWeight:800}}>{Number(reportData.finalBalance).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>}</tr></tfoot></table></div>}
      </div>}
    </div>}
    {tab==="mapeamentos" && <div style={{display:"grid",gap:18}}>
      <div style={card}><h2 style={{fontSize:18,marginTop:0}}>Mapeamento de eventos contábeis</h2>
      <div style={{border:"1px solid var(--line)",borderRadius:10,padding:14,marginBottom:16}}>
        <strong>Preparar sugestões iniciais (inativas)</strong>
        <p style={{fontSize:13,color:"var(--muted)",lineHeight:1.6}}>Cria apenas duas sugestões: venda reconhecida e despesa operacional de fornecedor. Elas ficam inativas e não geram lançamentos. Recebimentos, cartões, estornos e pagamentos ficam pendentes porque exigem regras específicas para evitar duplicidade ou classificar incorretamente dinheiro, bancos e valores a receber.</p>
        <button type="button" disabled={busy||mappingData.accounts.length<4} style={{...button,opacity:busy||mappingData.accounts.length<4?0.55:1}} onClick={async()=>{if(!window.confirm("Criar as duas sugestões contábeis inativas? Elas não serão usadas até revisão e ativação manual."))return;setBusy(true);setMessage("");try{const response=await fetch("/api/contabilidade/mapeamentos",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"CREATE_SAFE_BASE_MAPPINGS"})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Não foi possível preparar sugestões.");setMessage("Sugestões criadas inativas. Revise cada conta antes de ativar.");await load();}catch(err){setMessage(err instanceof Error?err.message:"Falha ao preparar sugestões.");}finally{setBusy(false);}}}>Preparar sugestões inativas</button>
      </div>
      <p style={{fontSize:13,color:"var(--muted)"}}>Defina quais contas serão usadas para cada tipo de evento. O cadastro do mapeamento não ativa a contabilização automática; a integração só será habilitada após homologação das regras com a contabilidade responsável.</p>
      <form onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage("");try{const response=await fetch("/api/contabilidade/mapeamentos",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"CREATE_MAPPING",...mappingForm,paymentMethodId:mappingForm.eventType==="PAYMENT_RECEIVED"?mappingForm.paymentMethodId:null})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Não foi possível salvar o mapeamento.");setMessage("Mapeamento cadastrado.");setMappingForm({...mappingForm,paymentMethodId:"",description:""});await load();}catch(err){setMessage(err instanceof Error?err.message:"Falha ao salvar mapeamento.");}finally{setBusy(false);}}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
      <label style={{fontSize:13,fontWeight:700}}>Evento<select style={field} value={mappingForm.eventType} onChange={e=>setMappingForm({...mappingForm,eventType:e.target.value})}>{mappingData.supportedEventTypes.map((v:string)=><option key={v} value={v}>{({SALE_RECOGNIZED:"Venda reconhecida",PAYMENT_RECEIVED:"Recebimento de venda",SALE_REFUNDED:"Devolução de venda",PAYMENT_REVERSED:"Estorno de recebimento",SUPPLIER_EXPENSE_RECOGNIZED:"Despesa de fornecedor",SUPPLIER_PAYMENT_MADE:"Pagamento a fornecedor"} as Record<string,string>)[v]||v}</option>)}</select></label>
      <label style={{fontSize:13,fontWeight:700}}>Conta de débito<select required style={field} value={mappingForm.debitAccountId} onChange={e=>setMappingForm({...mappingForm,debitAccountId:e.target.value})}><option value="">Selecione</option>{mappingData.accounts.map((a:any)=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>
      <label style={{fontSize:13,fontWeight:700}}>Conta de crédito<select required style={field} value={mappingForm.creditAccountId} onChange={e=>setMappingForm({...mappingForm,creditAccountId:e.target.value})}><option value="">Selecione</option>{mappingData.accounts.map((a:any)=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</select></label>
      </div>
      <label style={{display:"block",fontSize:13,fontWeight:700,marginTop:12}}>Observação<input maxLength={240} style={field} value={mappingForm.description} onChange={e=>setMappingForm({...mappingForm,description:e.target.value})}/></label>
      <button disabled={busy||mappingData.accounts.length<2} style={{...button,marginTop:14,opacity:busy?0.65:1}}>{busy?"Salvando…":"Cadastrar mapeamento"}</button>
      </form></div>
      {mappingData.integrationDiagnostics&&<div style={card}><h2 style={{fontSize:18,marginTop:0}}>Diagnóstico da integração</h2><p style={{fontSize:13,color:"var(--muted)"}}>Contagens históricas somente para leitura. Elas ajudam a verificar se existem operações registradas e eventos contábeis; não comprovam, isoladamente, falhas de integração.</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>{[{label:"Vendas registradas",value:mappingData.integrationDiagnostics.salesCount},{label:"Recebimentos registrados",value:mappingData.integrationDiagnostics.paymentsCount},{label:"Eventos de venda",value:mappingData.integrationDiagnostics.saleEventsCount},{label:"Eventos de recebimento",value:mappingData.integrationDiagnostics.paymentEventsCount},{label:"Eventos pendentes/erro",value:mappingData.integrationDiagnostics.pendingEventsCount}].map((item:any)=><div key={item.label} style={{border:"1px solid var(--line)",borderRadius:8,padding:12}}><div style={{fontSize:12,color:"var(--muted)"}}>{item.label}</div><strong style={{fontSize:22}}>{item.value}</strong></div>)}</div><p style={{fontSize:12,color:"var(--muted)",marginBottom:0}}>Para testar o fluxo, compare uma operação nova feita após a publicação com os eventos gerados. Não crie operações fictícias em produção.</p></div>}
      <div style={card}><h2 style={{fontSize:18,marginTop:0}}>Mapeamentos cadastrados</h2>{mappingData.mappings.length===0?<p style={{fontSize:13,color:"var(--muted)"}}>Nenhum mapeamento cadastrado.</p>:<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Evento","Débito","Crédito","Estado","Ação"].map(v=><th key={v} style={{textAlign:"left",padding:9,borderBottom:"1px solid var(--line)"}}>{v}</th>)}</tr></thead><tbody>{mappingData.mappings.map((m:any)=><tr key={m.id}><td style={{padding:9,borderBottom:"1px solid var(--line)"}}>{eventLabels[m.eventType]||m.eventType}{m.paymentMethod?.name?<div style={{fontSize:12,fontWeight:700}}>Meio: {m.paymentMethod.name}</div>:null}<div style={{fontSize:11,color:"var(--muted)"}}>{m.description}</div></td><td style={{padding:9,borderBottom:"1px solid var(--line)"}}>{m.debitAccount.code} — {m.debitAccount.name}</td><td style={{padding:9,borderBottom:"1px solid var(--line)"}}>{m.creditAccount.code} — {m.creditAccount.name}</td><td style={{padding:9,borderBottom:"1px solid var(--line)"}}>{m.active?"Ativo":"Inativo"}</td><td style={{padding:9,borderBottom:"1px solid var(--line)"}}><button style={secondary} onClick={async()=>{setBusy(true);try{const response=await fetch("/api/contabilidade/mapeamentos",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"SET_MAPPING_ACTIVE",id:m.id,active:!m.active})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Falha ao atualizar.");setMessage("Mapeamento atualizado.");await load();}catch(err){setMessage(err instanceof Error?err.message:"Falha ao atualizar.");}finally{setBusy(false);}}}>{m.active?"Desativar":"Ativar"}</button></td></tr>)}</tbody></table></div>}</div>
      <div style={card}><h2 style={{fontSize:18,marginTop:0}}>Fila de eventos</h2><p style={{fontSize:13,color:"var(--muted)"}}>O processamento é manual e exige confirmação. Cada evento usa uma chave idempotente para impedir lançamentos duplicados; confirme o mapeamento e a data antes de processar.</p>{mappingData.events.length===0?<p style={{fontSize:13,color:"var(--muted)"}}>Nenhum evento recebido.</p>:mappingData.events.map((ev:any)=><div key={ev.id} style={{padding:"10px 0",borderBottom:"1px solid var(--line)",display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><div><strong>{eventLabels[ev.eventType]||ev.eventType}</strong> · {ev.sourceType} #{ev.sourceId} · {eventStatusLabels[ev.status]||ev.status}{ev.errorMessage&&<div style={{color:"var(--danger)",fontSize:12}}>{ev.errorMessage}</div>}</div>{ev.status!=="PROCESSADO"&&<button disabled={busy} style={secondary} onClick={async()=>{if(!window.confirm("Processar este evento e gerar um lançamento contábil definitivo?"))return;setBusy(true);setMessage("");try{const response=await fetch("/api/contabilidade/eventos/processar",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({eventId:ev.id})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Falha ao processar evento.");setMessage(data.alreadyProcessed?"Evento já estava contabilizado; nenhuma duplicidade foi criada.":"Evento contabilizado com sucesso.");await load();}catch(err){setMessage(err instanceof Error?err.message:"Falha ao processar evento.");}finally{setBusy(false);}}}>Processar evento</button>}</div>)}</div>
    </div>}
    {tab==="eventos" && <div style={{display:"grid",gap:18}}>
      <div style={card}>
        <h2 style={{fontSize:18,marginTop:0}}>Fila de eventos contábeis</h2>
        <p style={{fontSize:13,color:"var(--muted)"}}>Confira o estado e os erros dos eventos. O processamento é manual e gera um lançamento contábil definitivo; revise antes o mapeamento e as contas.</p>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
          <span style={{...secondary,cursor:"default"}}>Total: {mappingData.events.length}</span>
          <span style={{...secondary,cursor:"default"}}>Pendentes: {mappingData.events.filter((ev:any)=>ev.status==="PENDENTE").length}</span>
          <span style={{...secondary,cursor:"default"}}>Com erro: {mappingData.events.filter((ev:any)=>ev.status==="ERRO").length}</span>
          <span style={{...secondary,cursor:"default"}}>Processados: {mappingData.events.filter((ev:any)=>ev.status==="PROCESSADO").length}</span>
          <button disabled={busy} style={secondary} onClick={()=>load().catch((e)=>setMessage(e.message))}>Atualizar fila</button>
        </div>
        {mappingData.events.length===0 ? <p style={{fontSize:13,color:"var(--muted)"}}>Nenhum evento contábil encontrado.</p> : <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Evento","Origem","Estado","Erro / detalhe","Ação"].map(v=><th key={v} style={{textAlign:"left",padding:9,borderBottom:"1px solid var(--line)"}}>{v}</th>)}</tr></thead><tbody>{mappingData.events.map((ev:any)=><tr key={ev.id}><td style={{padding:9,borderBottom:"1px solid var(--line)"}}><strong>{eventLabels[ev.eventType]||ev.eventType}</strong><div style={{fontSize:11,color:"var(--muted)",wordBreak:"break-word"}}>{ev.idempotencyKey}</div></td><td style={{padding:9,borderBottom:"1px solid var(--line)"}}>{sourceLabels[ev.sourceType]||ev.sourceType} · {ev.sourceId}</td><td style={{padding:9,borderBottom:"1px solid var(--line)"}}>{eventStatusLabels[ev.status]||ev.status}</td><td style={{padding:9,borderBottom:"1px solid var(--line)",color:ev.errorMessage?"var(--danger)":"var(--muted)"}}>{ev.errorMessage||"Nenhum erro registrado"}</td><td style={{padding:9,borderBottom:"1px solid var(--line)"}}>{ev.status!=="PROCESSADO" ? <button disabled={busy} style={secondary} onClick={async()=>{if(!window.confirm("Processar este evento e gerar um lançamento contábil definitivo? Confira se o mapeamento e as contas estão corretos."))return;setBusy(true);setMessage("");try{const response=await fetch("/api/contabilidade/eventos/processar",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({eventId:ev.id})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Falha ao processar evento.");setMessage(data.alreadyProcessed?"Evento já estava contabilizado; nenhuma duplicidade foi criada.":"Evento contabilizado com sucesso.");await load();}catch(err){setMessage(err instanceof Error?err.message:"Falha ao processar evento.");}finally{setBusy(false);}}}>Processar evento</button> : "Concluído"}</td></tr>)}</tbody></table></div>}
      </div>
    </div>}
    <p style={{fontSize:12,color:"var(--muted)",marginTop:20}}>Nesta fase não são gerados lançamentos automáticos, balancetes oficiais nem declarações fiscais. Os dados serão integrados aos módulos operacionais após validação contábil.</p>
  </section>;
}
