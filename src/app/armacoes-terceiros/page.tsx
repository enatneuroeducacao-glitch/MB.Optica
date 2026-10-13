"use client";
import { useEffect, useState } from "react";

type FrameRecord = {
  id:string; customerName:string; customerId?:string|null; brand?:string|null; model?:string|null;
  source:string; purchaseDate?:string|null; condition:string; risks?:string|null; serviceRequested:string;
  inspectionNotes?:string|null; photoReferences?:string|null; customerAcknowledged:boolean;
  status:string; createdAt:string; servicePrice?:string|number|null;
};
const statuses:Record<string,string>={RECEBIDA:"Recebida",EM_AVALIACAO:"Em avaliação",AGUARDANDO_CLIENTE:"Aguardando cliente",AUTORIZADA:"Autorizada",RECUSADA:"Recusada",CONCLUIDA:"Concluída"};
export default function ArmacoesTerceirosPage(){
 const [records,setRecords]=useState<FrameRecord[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
 const [filter,setFilter]=useState("TODAS");
 const [form,setForm]=useState({customerName:"",customerId:"",brand:"",model:"",source:"MARKETPLACE",purchaseDate:"",condition:"SEM_AVARIAS_APARENTES",risks:"",serviceRequested:"MONTAGEM_DE_LENTES",inspectionNotes:"",photoReferences:"",customerAcknowledged:false,servicePrice:""});
 const load=async()=>{setLoading(true);try{const r=await fetch("/api/third-party-frames",{cache:"no-store",credentials:"same-origin"});const d=await r.json();if(!r.ok)throw new Error(d.detail||d.error||"Falha ao carregar registros");setRecords(Array.isArray(d)?d:[])}catch(e){setMessage(e instanceof Error?e.message:"Erro ao carregar")}finally{setLoading(false)}};
 useEffect(()=>{void load()},[]);
 const update=(key:string,value:string|boolean)=>setForm(p=>({...p,[key]:value}));
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setSaving(true);setMessage("");try{const r=await fetch("/api/third-party-frames",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify(form)});const d=await r.json();if(!r.ok)throw new Error(d.detail||d.error||"Não foi possível registrar");setMessage("Armação de terceiro registrada com sucesso.");setForm({customerName:"",customerId:"",brand:"",model:"",source:"MARKETPLACE",purchaseDate:"",condition:"SEM_AVARIAS_APARENTES",risks:"",serviceRequested:"MONTAGEM_DE_LENTES",inspectionNotes:"",photoReferences:"",customerAcknowledged:false,servicePrice:""});await load()}catch(e){setMessage(e instanceof Error?e.message:"Erro ao salvar")}finally{setSaving(false)}};
 const changeStatus=async(id:string,status:string)=>{try{const r=await fetch("/api/third-party-frames/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({status})});const d=await r.json();if(!r.ok)throw new Error(d.detail||d.error||"Falha ao atualizar");setMessage("Status atualizado.");await load()}catch(e){setMessage(e instanceof Error?e.message:"Erro ao atualizar")}};
 const visible=filter==="TODAS"?records:records.filter(r=>r.status===filter);
 return <section className="page">
  <div className="page-heading"><div><span className="eyebrow">ÓPTICA · CONTROLE DE SERVIÇOS</span><h1>Armações de terceiros</h1><p>Inspeção, montagem, ciência do cliente e acompanhamento de garantia.</p></div><button className="secondary" type="button" onClick={()=>void load()}>↻ Atualizar</button></div>
  {message&&<div className="panel" role="status" style={{padding:12,marginBottom:14}}>{message}</div>}
  <div className="panel" style={{padding:18,marginBottom:18}}><div className="panel-heading" style={{padding:0,marginBottom:14}}><div><h2>Registrar recebimento</h2><p>Documente as condições antes de iniciar a montagem.</p></div></div>
   <form onSubmit={submit} className="sales-form"><div className="sales-form-grid">
    <label>Nome do cliente *<input required value={form.customerName} onChange={e=>update("customerName",e.target.value)} /></label>
    <label>Identificador do cliente (opcional)<input value={form.customerId} onChange={e=>update("customerId",e.target.value)} placeholder="ID do cadastro, se disponível"/></label>
    <label>Marca<input value={form.brand} onChange={e=>update("brand",e.target.value)}/></label><label>Modelo<input value={form.model} onChange={e=>update("model",e.target.value)}/></label>
    <label>Origem<select value={form.source} onChange={e=>update("source",e.target.value)}><option value="MARKETPLACE">Marketplace / plataforma</option><option value="OUTRA_OTICA">Outra ótica</option><option value="PRESENTE">Presente / terceiro</option><option value="OUTRA">Outra origem</option></select></label>
    <label>Data da compra<input type="date" value={form.purchaseDate} onChange={e=>update("purchaseDate",e.target.value)}/></label>
    <label>Condição no recebimento<select value={form.condition} onChange={e=>update("condition",e.target.value)}><option value="SEM_AVARIAS_APARENTES">Sem avarias aparentes</option><option value="DESGASTE">Desgaste / folgas</option><option value="TRINCA_OU_DANO">Trinca ou dano identificado</option><option value="AVALIACAO_NECESSARIA">Necessita avaliação complementar</option></select></label>
    <label>Serviço solicitado<select value={form.serviceRequested} onChange={e=>update("serviceRequested",e.target.value)}><option value="MONTAGEM_DE_LENTES">Montagem de lentes</option><option value="AJUSTE">Ajuste</option><option value="REPARO">Reparo</option><option value="AVALIACAO">Somente avaliação</option></select></label>
    <label>Preço do serviço (R$)<input type="number" min="0" step="0.01" value={form.servicePrice} onChange={e=>update("servicePrice",e.target.value)}/></label>
   </div>
   <label className="sales-wide">Riscos específicos explicados ao cliente<textarea rows={2} value={form.risks} onChange={e=>update("risks",e.target.value)} placeholder="Ex.: material ressecado, aro delicado, parafusos com folga..."/></label>
   <label className="sales-wide">Inspeção e observações<textarea rows={3} value={form.inspectionNotes} onChange={e=>update("inspectionNotes",e.target.value)} placeholder="Registre avarias, alinhamento, dobradiças e resultado da avaliação."/></label>
   <label className="sales-wide">Referências das fotos (opcional)<input value={form.photoReferences} onChange={e=>update("photoReferences",e.target.value)} placeholder="Nomes/links internos das fotos de entrada"/></label>
   <label style={{display:"flex",gap:10,alignItems:"flex-start"}}><input type="checkbox" checked={form.customerAcknowledged} onChange={e=>update("customerAcknowledged",e.target.checked)} required style={{width:18,marginTop:3}}/><span>Registrei que as condições e os riscos específicos foram explicados ao cliente. Estou ciente de que esta ciência não exclui a responsabilidade legal da ótica.</span></label>
   <div className="sales-actions"><button className="primary" type="submit" disabled={saving}>{saving?"Salvando...":"Registrar armação e ciência do cliente"}</button></div>
   </form>
  </div>
  <div className="panel"><div className="panel-heading"><div><h2>Registros e acompanhamento</h2><p>Histórico de recebimento e situação do serviço.</p></div><select aria-label="Filtrar por situação" value={filter} onChange={e=>setFilter(e.target.value)}><option value="TODAS">Todas as situações</option>{Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
   {loading?<p style={{padding:18}}>Carregando registros...</p>:visible.length===0?<p style={{padding:18}}>Nenhum registro encontrado.</p>:<div style={{display:"grid",gap:12,padding:14}}>{visible.map(r=><article key={r.id} className="panel" style={{padding:14,border:"1px solid var(--border)"}}><div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><strong>{r.customerName}</strong><p style={{margin:"4px 0",color:"var(--muted)"}}>{[r.brand,r.model].filter(Boolean).join(" · ")||"Armação sem marca/modelo"} · {new Date(r.createdAt).toLocaleDateString("pt-BR")}</p></div><label>Situação<select value={r.status} onChange={e=>void changeStatus(r.id,e.target.value)}>{Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div><div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"8px 0"}}><span className="version-badge">{r.condition.replaceAll("_"," ")}</span><span className="version-badge">{r.serviceRequested.replaceAll("_"," ")}</span><span className="version-badge">{r.customerAcknowledged?"Ciência registrada":"Ciência pendente"}</span></div>{r.risks&&<p><b>Riscos informados:</b> {r.risks}</p>}{r.inspectionNotes&&<p><b>Inspeção:</b> {r.inspectionNotes}</p>}{r.servicePrice!=null&&<p><b>Serviço:</b> {Number(r.servicePrice).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</p>}</article>)}</div>}
  </div>
 </section>
}
