"use client";

import {useEffect,useMemo,useState} from "react";

type Supplier={id:string;name:string;document?:string|null;phone?:string|null;email?:string|null;notes?:string|null;_count?:{products:number;accounts:number}};
type Form={name:string;document:string;phone:string;email:string;notes:string};

const empty:Form={name:"",document:"",phone:"",email:"",notes:""};

export default function Fornecedores(){
 const [rows,setRows]=useState<Supplier[]>([]);
 const [form,setForm]=useState<Form>(empty);
 const [selected,setSelected]=useState<any>(null);
 const [search,setSearch]=useState("");
 const [msg,setMsg]=useState("");
 const [loading,setLoading]=useState(false);
 const [backupInfo,setBackupInfo]=useState<{records:any[];total:number;active:number;archived:number;fileName:string}|null>(null);
 const [reconciling,setReconciling]=useState(false);

 const load=async()=>{
  const r=await fetch("/api/suppliers",{cache:"no-store"});
  const d=await r.json();
  if(r.ok)setRows(Array.isArray(d)?d:[]);
  else setMsg(d.error||"Erro ao carregar fornecedores.");
 };

 useEffect(()=>{load()},[]);

 const save=async(e:React.FormEvent)=>{
  e.preventDefault();setMsg("");setLoading(true);
  try{
   const r=await fetch(selected?"/api/suppliers/"+selected.id:"/api/suppliers",{
    method:selected?"PATCH":"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify(form)
   });
   const d=await r.json();
   if(!r.ok){setMsg(d.error||"Erro ao salvar fornecedor.");return}
   setMsg(selected?"Fornecedor atualizado com sucesso.":"Fornecedor cadastrado com sucesso.");
   setSelected(null);setForm(empty);await load();
  }finally{setLoading(false)}
 };

 const edit=async(s:Supplier)=>{
  setMsg("");
  const r=await fetch("/api/suppliers/"+s.id,{cache:"no-store"});
  const d=await r.json();
  if(!r.ok){setMsg(d.error||"Não foi possível abrir o fornecedor.");return}
  setSelected(d);
  setForm({name:d.name||"",document:d.document||"",phone:d.phone||"",email:d.email||"",notes:d.notes||""});
  window.scrollTo({top:0,behavior:"smooth"});
 };

 const archive=async()=>{
  if(!selected)return;
  if(!window.confirm("Arquivar este fornecedor? Ele deixará de aparecer na lista de fornecedores ativos."))return;
  const r=await fetch("/api/suppliers/"+selected.id,{method:"DELETE"});
  const d=await r.json();
  if(!r.ok){setMsg(d.error||"Não foi possível arquivar o fornecedor.");return}
  setMsg("Fornecedor arquivado com sucesso.");setSelected(null);setForm(empty);await load();
 };

 const chooseBackup=async(e:React.ChangeEvent<HTMLInputElement>)=>{
  const file=e.target.files?.[0]; e.target.value="";
  if(!file)return;
  try{
   const text=await file.text();
   const data=JSON.parse(text);
   if(!Array.isArray(data))throw new Error("O backup precisa ser uma lista JSON.");
   const suppliers=data.filter((r:any)=>String(r.collection_key??"")==="Fornecedor");
   if(!suppliers.length)throw new Error("Nenhum fornecedor foi encontrado neste backup.");
   const active=suppliers.filter((r:any)=>!Boolean(r.archived)).length;
   const archived=suppliers.length-active;
   setBackupInfo({records:suppliers,total:suppliers.length,active,archived,fileName:file.name});
   setMsg(`Backup carregado: ${suppliers.length} fornecedores (${active} ativos e ${archived} arquivados). Revise e confirme a reconciliação.`);
  }catch(err){setBackupInfo(null);setMsg(err instanceof Error?err.message:"Não foi possível ler o backup.");}
 };
 const reconcileBackup=async()=>{
  if(!backupInfo)return;
  if(!window.confirm(`Reconciliar ${backupInfo.active} fornecedores ativos deste backup? Fornecedores arquivados serão preservados apenas como histórico. Nenhum fornecedor atual será excluído.`))return;
  setReconciling(true);setMsg("");
  try{
   const r=await fetch("/api/migration/legacy/suppliers/reconcile",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({records:backupInfo.records})});
   const d=await r.json();
   if(!r.ok)throw new Error(d?.error||"Não foi possível reconciliar os fornecedores.");
   const x=d.result||{};
   setMsg(d.alreadyProcessed?"Este backup de fornecedores já foi reconciliado anteriormente.":`Reconciliação concluída: ${x.created||0} novos, ${x.matched||0} já existentes e ${x.preserved||0} arquivados preservados como histórico.`);
   setBackupInfo(null);await load();
  }catch(err){setMsg(err instanceof Error?err.message:"Não foi possível reconciliar os fornecedores.");}
  finally{setReconciling(false);}
 };
 const filtered=useMemo(()=>{
  const q=search.toLowerCase().trim();
  if(!q)return rows;
  return rows.filter(s=>(s.name+" "+(s.document||"")+" "+(s.phone||"")+" "+(s.email||"")).toLowerCase().includes(q));
 },[rows,search]);

 const totalProducts=rows.reduce((n,s)=>n+(s._count?.products||0),0);
 const totalAccounts=rows.reduce((n,s)=>n+(s._count?.accounts||0),0);

 return <section className="page">
  <div className="page-heading">
   <div><span className="eyebrow">CADASTRO</span><h1>Fornecedores</h1><p>Cadastre fornecedores, contatos, produtos vinculados e contas a pagar.</p></div>
   <div style={{display:"flex",gap:8}}>
   <label className="secondary" style={{display:"inline-flex",alignItems:"center",cursor:"pointer"}}>↻ Carregar backup de fornecedores<input type="file" accept=".json,.txt,application/json,text/plain" onChange={chooseBackup} style={{display:"none"}}/></label>
   <button className="primary" onClick={()=>{setSelected(null);setForm(empty);setMsg("");window.scrollTo({top:0,behavior:"smooth"})}}>+ Novo fornecedor</button>
  </div>
  </div>

  {msg&&<div className="panel" style={{padding:12,marginBottom:12}}>{msg}</div>}
  {backupInfo&&<div className="panel" style={{padding:16,marginBottom:12,border:"1px solid var(--line)"}}>
   <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}>
    <div><span className="eyebrow">RECONCILIAÇÃO</span><h3 style={{margin:"3px 0"}}>Backup pronto para reconciliação</h3><div style={{fontSize:12,color:"var(--muted)"}}>{backupInfo.fileName} · {backupInfo.total} fornecedores · {backupInfo.active} ativos · {backupInfo.archived} arquivados</div></div>
    <div style={{display:"flex",gap:8}}><button className="secondary" onClick={()=>setBackupInfo(null)} disabled={reconciling}>Cancelar</button><button className="primary" onClick={reconcileBackup} disabled={reconciling}>{reconciling?"Reconciliando...":"Confirmar reconciliação"}</button></div>
   </div>
   <p style={{margin:"10px 0 0",fontSize:12,color:"var(--muted)"}}>A reconciliação compara documento, nome + telefone e nome. Não exclui fornecedores atuais. Os registros arquivados do backup ficam preservados no histórico.</p>
  </div>}

  <div className="stats" style={{marginBottom:12}}>
   <div className="stat-card"><b>{rows.length}</b><span>FORNECEDORES ATIVOS</span></div>
   <div className="stat-card"><b>{totalProducts}</b><span>PRODUTOS VINCULADOS</span></div>
   <div className="stat-card"><b>{totalAccounts}</b><span>CONTAS A PAGAR</span></div>
  </div>

  <div className="panel" style={{padding:20,marginBottom:12}}>
   <div className="panel-heading" style={{padding:0,marginBottom:15}}>
    <div><span className="eyebrow">{selected?"EDIÇÃO":"CADASTRO"}</span><h2>{selected?"Editar fornecedor":"Novo fornecedor"}</h2><p style={{margin:0,color:"var(--muted)"}}>{selected?"Atualize os dados cadastrais do fornecedor.":"Preencha os dados principais para cadastrar um novo fornecedor."}</p></div>
    {selected&&<button className="secondary" type="button" onClick={()=>{setSelected(null);setForm(empty)}}>Cancelar edição</button>}
   </div>
   <form onSubmit={save} style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
    <label style={{display:"grid",gap:5}}>Nome / razão social<input required placeholder="Ex.: Laboratório ABC" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
    <label style={{display:"grid",gap:5}}>CNPJ / CPF<input placeholder="Documento" value={form.document} onChange={e=>setForm({...form,document:e.target.value})}/></label>
    <label style={{display:"grid",gap:5}}>Telefone<input placeholder="Telefone / WhatsApp" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
    <label style={{display:"grid",gap:5}}>E-mail<input type="email" placeholder="E-mail comercial" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
    <label style={{display:"grid",gap:5,gridColumn:"1 / -1"}}>Observações<textarea rows={3} placeholder="Prazo, condições comerciais, contato, observações..." value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
    <div style={{display:"flex",gap:8,gridColumn:"1 / -1"}}>
     <button className="primary" type="submit" disabled={loading}>{loading?(selected?"Salvando...":"Cadastrando..."):(selected?"Salvar alterações":"Cadastrar fornecedor")}</button>
     {selected&&<button className="secondary" type="button" onClick={archive}>Arquivar fornecedor</button>}
    </div>
   </form>
  </div>

  {selected&&<div className="panel" style={{padding:20,marginBottom:12}}>
   <div className="panel-heading" style={{padding:0,marginBottom:12}}><div><b>{selected.name}</b><div style={{fontSize:12,color:"var(--muted)"}}>Detalhes vinculados</div></div></div>
   <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
    <div><h3 style={{fontSize:13,margin:"0 0 8px"}}>Produtos vinculados ({selected.products?.length||0})</h3>{selected.products?.length?selected.products.map((p:any)=><div key={p.id} style={{fontSize:12,padding:"8px 0",borderTop:"1px solid var(--line)"}}>{p.code} — {p.description}<span style={{float:"right"}}>R$ {Number(p.salePrice).toFixed(2)}</span></div>):<div style={{fontSize:12,color:"var(--muted)"}}>Nenhum produto vinculado.</div>}</div>
    <div><h3 style={{fontSize:13,margin:"0 0 8px"}}>Contas a pagar em aberto</h3>{selected.accounts?.filter((a:any)=>a.status!=="PAGO"&&a.status!=="CANCELADO").length?selected.accounts.filter((a:any)=>a.status!=="PAGO"&&a.status!=="CANCELADO").map((a:any)=><div key={a.id} style={{fontSize:12,padding:"8px 0",borderTop:"1px solid var(--line)"}}>{a.description} — {new Date(a.dueDate).toLocaleDateString("pt-BR")}<span style={{float:"right"}}>R$ {(Number(a.amount)-Number(a.paidAmount||0)).toFixed(2)}</span></div>):<div style={{fontSize:12,color:"var(--muted)"}}>Nenhuma conta em aberto.</div>}</div>
   </div>
  </div>}

  <div className="toolbar" style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8,marginBottom:12}}>
   <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar fornecedor, CNPJ/CPF, telefone ou e-mail..." />
   <button className="secondary" onClick={()=>setSearch("")}>Limpar</button>
  </div>

  <div className="panel">
   <div style={{padding:"12px 14px",borderBottom:"1px solid var(--line)"}}><b>Fornecedores cadastrados</b><div style={{fontSize:12,color:"var(--muted)"}}>{filtered.length} fornecedor(es) exibido(s)</div></div>
   <div className="table">
    <div className="row header"><span>Fornecedor</span><span>Documento</span><span>Telefone</span><span>Produtos</span><span>Contas</span><span></span></div>
    {filtered.map(s=><div className="row" key={s.id}><strong>{s.name}</strong><span>{s.document||"—"}</span><span>{s.phone||"—"}</span><span>{s._count?.products??0}</span><span>{s._count?.accounts??0}</span><button className="link-button" onClick={()=>edit(s)}>Abrir</button></div>)}
    {!filtered.length&&<div style={{padding:22,textAlign:"center",color:"var(--muted)"}}>Nenhum fornecedor encontrado.</div>}
   </div>
  </div>
 </section>;
}
