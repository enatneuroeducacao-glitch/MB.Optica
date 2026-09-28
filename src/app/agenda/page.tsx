"use client";
import {useEffect,useMemo,useState} from "react";
import {useRealtimeRefresh} from "@/lib/use-realtime-refresh";

type Customer={id:string;name:string;cpfCnpj?:string|null;phone?:string|null;email?:string|null};
type Appointment={id:string;type:string;professionalType:string;professionalName:string;scheduledAt:string;status:string;notes?:string|null;customer:Customer};

const empty={customerId:"",type:"EXAME",professionalType:"OFTALMOLOGISTA",professionalName:"",scheduledAt:"",status:"AGENDADO",notes:""};

export default function Agenda(){
 const [customers,setCustomers]=useState<Customer[]>([]);
 const [rows,setRows]=useState<Appointment[]>([]);
 const [form,setForm]=useState(empty);
 const [search,setSearch]=useState("");
 const [customerSearch,setCustomerSearch]=useState("");
 const [open,setOpen]=useState(false);
 const [msg,setMsg]=useState("");
 const load=async()=>{
  const [cr,ar]=await Promise.all([fetch("/api/customers",{cache:"no-store"}),fetch("/api/appointments",{cache:"no-store"})]);
  if(cr.status===401||ar.status===401){window.location.href="/login";return}
  const cd=await cr.json();const ad=await ar.json();
  if(cr.ok)setCustomers(cd);else setMsg(cd.error||"Erro ao carregar clientes.");
  if(ar.ok)setRows(ad);else setMsg(ad.error||"Erro ao carregar agenda.");
 };
 useEffect(()=>{load()},[]);
 useRealtimeRefresh(load,15000);
 const filtered=useMemo(()=>rows.filter(a=>(a.customer.name+" "+a.professionalName+" "+a.professionalType+" "+a.type).toLowerCase().includes(search.toLowerCase())),[rows,search]);
 const customerOptions=customers.filter(c=>(c.name+" "+(c.cpfCnpj||"")+" "+(c.phone||"")).toLowerCase().includes(customerSearch.toLowerCase())).slice(0,20);
 const save=async(e:React.FormEvent)=>{e.preventDefault();setMsg("");const r=await fetch("/api/appointments",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(form)});const d=await r.json();if(r.status===401){window.location.href="/login";return}if(!r.ok){setMsg(d.error||"Não foi possível agendar.");return}setMsg("Agendamento realizado com sucesso.");setForm(empty);setCustomerSearch("");setOpen(false);await load()};
 const remove=async(id:string)=>{if(!confirm("Excluir este agendamento?"))return;const r=await fetch("/api/appointments/"+id,{method:"DELETE"});const d=await r.json();if(!r.ok){setMsg(d.error||"Não foi possível excluir.");return}await load()};
 return <section className="page">
  <div className="page-heading"><div><span className="eyebrow">MB ÓPTICA</span><h1>Agenda</h1><p>Agende exames, atendimentos, retiradas, provas e entregas.</p></div><button className="primary" onClick={()=>{setForm(empty);setCustomerSearch("");setOpen(true);setMsg("")}}>+ Novo</button></div>
  {msg&&<div className="panel" style={{padding:12,color:msg.includes("sucesso")?"#18794e":"#a33"}}>{msg}</div>}
  {open&&<div className="panel" style={{padding:20,marginTop:12}}><div className="panel-heading" style={{padding:0,marginBottom:15}}><div><h2>Novo agendamento</h2><p style={{fontSize:11,color:"var(--muted)"}}>Selecione o cliente já cadastrado e informe o profissional.</p></div><button className="secondary" onClick={()=>setOpen(false)}>Fechar</button></div>
   <form onSubmit={save} style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
    <label style={{fontSize:10,display:"grid",gap:5}}>Cliente
     <input required placeholder="Buscar cliente por nome, CPF/CNPJ ou telefone..." value={customerSearch} onChange={e=>{setCustomerSearch(e.target.value);setForm({...form,customerId:""})}} />
     {customerSearch&&<div style={{border:"1px solid var(--line)",borderRadius:7,maxHeight:180,overflowY:"auto",background:"#fff"}}>{customerOptions.map(c=><button type="button" key={c.id} onClick={()=>{setForm({...form,customerId:c.id});setCustomerSearch(c.name)}} style={{display:"block",width:"100%",textAlign:"left",padding:9,border:0,borderBottom:"1px solid var(--line)",background:"#fff"}}><b>{c.name}</b><span style={{display:"block",fontSize:9,color:"var(--muted)"}}>{c.cpfCnpj||c.phone||c.email||""}</span></button>)}</div>}
     {form.customerId&&<span style={{fontSize:9,color:"#18794e"}}>Cliente selecionado.</span>}
    </label>
    <label style={{fontSize:10,display:"grid",gap:5}}>Tipo
     <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} style={{padding:9,border:"1px solid var(--line)",borderRadius:7}}><option value="EXAME">Exame de visão</option><option value="ATENDIMENTO">Atendimento</option><option value="RETIRADA">Retirada</option><option value="PROVA">Prova de lentes</option><option value="ENTREGA">Entrega</option><option value="RETORNO">Retorno</option></select>
    </label>
    <label style={{fontSize:10,display:"grid",gap:5}}>Profissional
     <select value={form.professionalType} onChange={e=>setForm({...form,professionalType:e.target.value})} style={{padding:9,border:"1px solid var(--line)",borderRadius:7}}><option value="OFTALMOLOGISTA">Oftalmologista</option><option value="OPTOMETRISTA">Optometrista</option><option value="OUTRO">Outro profissional</option></select>
    </label>
    <label style={{fontSize:10,display:"grid",gap:5}}>Nome do profissional<input required value={form.professionalName} onChange={e=>setForm({...form,professionalName:e.target.value})}/></label>
    <label style={{fontSize:10,display:"grid",gap:5}}>Data e hora<input required type="datetime-local" value={form.scheduledAt} onChange={e=>setForm({...form,scheduledAt:e.target.value})}/></label>
    <label style={{fontSize:10,display:"grid",gap:5}}>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={{padding:9,border:"1px solid var(--line)",borderRadius:7}}><option value="AGENDADO">Agendado</option><option value="CONFIRMADO">Confirmado</option><option value="REALIZADO">Realizado</option><option value="CANCELADO">Cancelado</option><option value="NAO_COMPARECEU">Não compareceu</option></select></label>
    <label style={{fontSize:10,display:"grid",gap:5,gridColumn:"1 / -1"}}>Observações<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} rows={3}/></label>
    <button className="primary" type="submit" disabled={!form.customerId}>Salvar agendamento</button>
   </form>
  </div>}
  <div className="toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar na agenda por cliente, profissional ou tipo..."/></div>
  <div className="panel"><div className="table"><div className="row header"><span>Data/hora</span><span>Cliente</span><span>Tipo</span><span>Profissional</span><span>Status</span><span></span></div>
   {filtered.map(a=><div className="row" key={a.id}><strong>{new Date(a.scheduledAt).toLocaleString("pt-BR")}</strong><span>{a.customer.name}</span><span>{a.type}</span><span>{a.professionalType==="OFTALMOLOGISTA"?"Oftalmologista":a.professionalType==="OPTOMETRISTA"?"Optometrista":"Outro"} · {a.professionalName}</span><span>{a.status}</span><button className="link-button" onClick={()=>remove(a.id)}>Excluir</button></div>)}
   {!filtered.length&&<div style={{padding:25,textAlign:"center",color:"var(--muted)"}}>Nenhum agendamento encontrado.</div>}
  </div></div>
 </section>
}
