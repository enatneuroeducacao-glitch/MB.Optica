"use client";
import {useEffect,useState} from "react";
import {useRealtimeRefresh} from "@/lib/use-realtime-refresh";
type Customer={id:string;name:string;cpfCnpj?:string|null;phone?:string|null;whatsapp?:string|null;email?:string|null;birthDate?:string|null;notes?:string|null;addresses:any[];prescriptions?:any[];orders?:any[];sales?:any[];accounts?:any[];_count:any};
const empty={name:"",cpfCnpj:"",phone:"",whatsapp:"",email:"",birthDate:"",notes:""};
const rxEmpty={professional:"",validUntil:"",odSphere:"",odCylinder:"",odAxis:"",odAdd:"",odDnp:"",odHeight:"",oeSphere:"",oeCylinder:"",oeAxis:"",oeAdd:"",oeDnp:"",oeHeight:"",pdTotal:"",notes:""};
const fieldLabels:Record<string,string>={name:"Nome",cpfCnpj:"CPF/CNPJ",phone:"Telefone",whatsapp:"WhatsApp",email:"E-mail",birthDate:"Data de nascimento",notes:"Observações",label:"Identificação",street:"Rua",number:"Número",complement:"Complemento",district:"Bairro",city:"Cidade",state:"Estado",postalCode:"CEP",professional:"Profissional",validUntil:"Validade da receita",odSphere:"OD — Esférico (ESF)",odCylinder:"OD — Cilíndrico (CIL)",odAxis:"OD — Eixo (AX)",odAdd:"OD — Adição (ADD)",odDnp:"OD — DNP",odHeight:"OD — Altura",oeSphere:"OE — Esférico (ESF)",oeCylinder:"OE — Cilíndrico (CIL)",oeAxis:"OE — Eixo (AX)",oeAdd:"OE — Adição (ADD)",oeDnp:"OE — DNP",oeHeight:"OE — Altura",pdTotal:"DP Total (Distância pupilar)"};
export default function Clientes(){
 const [rows,setRows]=useState<Customer[]>([]),[selected,setSelected]=useState<Customer|null>(null),[form,setForm]=useState(empty),[address,setAddress]=useState({label:"",street:"",number:"",complement:"",district:"",city:"",state:"SC",postalCode:""}),[rx,setRx]=useState(rxEmpty),[search,setSearch]=useState(""),[open,setOpen]=useState(false),[msg,setMsg]=useState(""),[fieldErrors,setFieldErrors]=useState<Record<string,string>>({});
 const load=async()=>{const r=await fetch("/api/customers",{cache:"no-store"});const d=await r.json();if(r.status===401){window.location.href="/login";return}if(r.ok)setRows(d);else setMsg(d.error||"Erro ao carregar clientes.")};
 useEffect(()=>{load()},[]);
 useRealtimeRefresh(load,20000);
 const detail=async(id:string)=>{const r=await fetch("/api/customers/"+id);const d=await r.json();if(r.ok){setSelected(d);setFieldErrors({});setForm({name:d.name,cpfCnpj:d.cpfCnpj||"",phone:d.phone||"",whatsapp:d.whatsapp||"",email:d.email||"",birthDate:d.birthDate?d.birthDate.slice(0,10):"",notes:d.notes||""})}else setMsg(d.error||"Erro ao abrir cliente.")};
 const save=async(e:React.FormEvent)=>{e.preventDefault();setMsg("");setFieldErrors({});const r=await fetch(selected?"/api/customers/"+selected.id:"/api/customers",{method:selected?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(form)});const d=await r.json();if(r.status===401){window.location.href="/login";return}if(!r.ok){if(d.fields&&typeof d.fields==="object")setFieldErrors(d.fields);setMsg(d.error||"Verifique os campos destacados.");return}setOpen(false);setSelected(null);setForm(empty);await load();await detail(d.id)};
 const deleteCustomer=async()=>{
   if(!selected)return;
   if(!window.confirm(`Excluir o cliente "${selected.name}"? O cadastro será retirado da lista ativa, mas o histórico será preservado.`))return;
   const id=selected.id;
   const r=await fetch("/api/customers/"+id,{method:"DELETE"});
   const d=await r.json();
   if(!r.ok){setMsg(d.error||"Não foi possível excluir o cliente.");return}
   setMsg("Cliente excluído.");
   setSelected(null);
   setOpen(false);
   setForm(empty);
   await load();
 };
 const addAddress=async()=>{if(!selected)return;const r=await fetch("/api/customers/"+selected.id+"/addresses",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(address)});if(r.ok){setAddress({label:"",street:"",number:"",complement:"",district:"",city:"",state:"SC",postalCode:""});await detail(selected.id);await load()}else setMsg((await r.json()).error||"Erro ao salvar endereço.")};
 const addRx=async(e:React.FormEvent)=>{e.preventDefault();if(!selected)return;const r=await fetch("/api/prescriptions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...rx,customerId:selected.id})});const d=await r.json();if(!r.ok){setMsg(d.error||"Erro ao registrar receita.");return}setRx(rxEmpty);await detail(selected.id);setMsg("Receita registrada.")};
 const filtered=rows.filter(c=>(c.name+" "+(c.cpfCnpj||"")+" "+(c.phone||"")+" "+(c.whatsapp||"")).toLowerCase().includes(search.toLowerCase()));
 const fields=(obj:any,exclude:string[]=[])=>(Object.entries(obj).filter(([k])=>!exclude.includes(k)));
 return <section className="page">
 <div className="page-heading"><div><span className="eyebrow">CADASTRO</span><h1>Clientes</h1><p>Cadastro, contatos, endereços, receitas e histórico comercial.</p></div></div>
 <div style={{display:"flex",justifyContent:"flex-end",marginTop:-6}}><button className="primary" onClick={()=>{setSelected(null);setForm(empty);setFieldErrors({});setMsg("");setOpen(true)}}>+ Novo cliente</button></div>
 {msg&&<div className="panel" style={{padding:12,color:"#a33"}}>{msg}</div>}
 <div className="panel" style={{padding:20,marginTop:12}}><div className="panel-heading" style={{padding:0,marginBottom:15}}><div><h2>{selected?"Editar cliente":"Cadastro de cliente"}</h2><p style={{fontSize:11,color:"var(--muted)"}}>{selected?"Altere os dados e salve a atualização.":"Preencha os dados para adicionar um novo cliente à lista."}</p></div><button className="secondary" onClick={()=>{setOpen(false);setSelected(null)}}>Fechar</button></div><form onSubmit={save} style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>{fields(form).map(([k,v])=><label key={k} style={{fontSize:10,display:"grid",gap:5}}>{fieldLabels[k]||k}<input aria-invalid={!!fieldErrors[k]} type={k==="birthDate"?"date":k==="email"?"email":"text"} value={String(v)} onChange={e=>{setForm({...form,[k]:e.target.value});if(fieldErrors[k])setFieldErrors({...fieldErrors,[k]:""})}} style={{padding:9,border:"1px solid "+(fieldErrors[k]?"#c33":"var(--line)"),borderRadius:7}} />{fieldErrors[k]&&<small style={{color:"#c33",fontWeight:600}}>{fieldErrors[k]}</small>}</label>)}<button className="primary" type="submit">Salvar cliente</button></form></div>
 <div className="toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome, CPF/CNPJ ou telefone..."/></div>
 <div className="panel"><div className="table"><div className="row header"><span>Cliente</span><span>Documento</span><span>Telefone</span><span>Pedidos</span><span>Receitas</span><span></span></div>{filtered.map(c=><div className="row" key={c.id}><strong>{c.name}</strong><span>{c.cpfCnpj||"—"}</span><span>{c.whatsapp||c.phone||"—"}</span><span>{c._count?.orders??0}</span><span>{c._count?.prescriptions??0}</span><button className="link-button" onClick={()=>detail(c.id)}>Abrir</button></div>)}</div></div>
 {selected&&<div className="panel" style={{padding:20,marginTop:12}}><div className="panel-heading" style={{padding:0,marginBottom:15}}><div><h2>{selected.name}</h2><p style={{fontSize:10,color:"var(--muted)"}}>{selected.cpfCnpj||"Sem CPF/CNPJ"} · {selected.phone||selected.whatsapp||"Sem telefone"}</p></div><div style={{display:"flex",gap:8}}><button className="secondary" onClick={()=>setOpen(true)}>Editar</button><button className="secondary" onClick={()=>setSelected(null)}>Fechar</button></div></div>
 <h3 style={{fontSize:12}}>Endereços</h3>{selected.addresses.map(a=><div key={a.id} style={{fontSize:10,padding:"8px 0",borderTop:"1px solid var(--line)"}}>{[a.label,a.street,a.number,a.complement,a.district,a.city,a.state,a.postalCode].filter(Boolean).join(", ")}</div>)}<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginTop:10}}>{fields(address).map(([k,v])=><input key={k} aria-label={fieldLabels[k]||k} placeholder={fieldLabels[k]||k} value={String(v)} onChange={e=>setAddress({...address,[k]:e.target.value})} style={{padding:8,border:"1px solid var(--line)",borderRadius:7}}/>)}<button className="secondary" onClick={addAddress}>Adicionar endereço</button></div>
 <h3 style={{fontSize:12,marginTop:25}}>Receitas</h3>
 {(selected.prescriptions||[]).map((p:any)=><div key={p.id} style={{fontSize:10,padding:"10px 0",borderTop:"1px solid var(--line)"}}>
   <div style={{fontWeight:700,marginBottom:7}}>Receita de {new Date(p.date).toLocaleDateString("pt-BR")} · {p.professional||"Profissional não informado"}</div>
   <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
     <div style={{border:"1px solid var(--line)",borderRadius:7,padding:10}}>
       <div style={{fontWeight:700,marginBottom:7}}>OD — Olho Direito</div>
       <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
         <span>ESF: {p.odSphere??"—"}</span><span>CIL: {p.odCylinder??"—"}</span><span>AX: {p.odAxis??"—"}</span>
         <span>ADD: {p.odAdd??"—"}</span><span>DNP: {p.odDnp??"—"}</span><span>Altura: {p.odHeight??"—"}</span>
       </div>
     </div>
     <div style={{border:"1px solid var(--line)",borderRadius:7,padding:10}}>
       <div style={{fontWeight:700,marginBottom:7}}>OE — Olho Esquerdo</div>
       <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
         <span>ESF: {p.oeSphere??"—"}</span><span>CIL: {p.oeCylinder??"—"}</span><span>AX: {p.oeAxis??"—"}</span>
         <span>ADD: {p.oeAdd??"—"}</span><span>DNP: {p.oeDnp??"—"}</span><span>Altura: {p.oeHeight??"—"}</span>
       </div>
     </div>
   </div>
   <div style={{marginTop:7}}>DP Total: {p.pdTotal??"—"}{p.validUntil?" · Válida até "+new Date(p.validUntil).toLocaleDateString("pt-BR"):""}</div>
 </div>)}
 <form onSubmit={addRx} style={{marginTop:12}}>
   <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8,marginBottom:10}}>
     <input placeholder="Profissional" aria-label="Profissional" value={rx.professional} onChange={e=>setRx({...rx,professional:e.target.value})}/>
     <input type="date" aria-label="Validade da receita" value={rx.validUntil} onChange={e=>setRx({...rx,validUntil:e.target.value})}/>
   </div>
   <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:8,width:"100%",boxSizing:"border-box"}}>
     <div style={{border:"1px solid var(--line)",borderRadius:7,padding:8,minWidth:0,boxSizing:"border-box",overflow:"hidden"}}>
       <div style={{fontWeight:700,fontSize:11,marginBottom:7}}>OD — Olho Direito</div>
       <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:5,minWidth:0}}>
         <input style={{width:"100%",minWidth:0,boxSizing:"border-box",padding:"6px 7px",fontSize:11}} placeholder="ESF" aria-label="OD — Esférico (ESF)" value={rx.odSphere} onChange={e=>setRx({...rx,odSphere:e.target.value})}/>
         <input style={{width:"100%",minWidth:0,boxSizing:"border-box",padding:"6px 7px",fontSize:11}} placeholder="CIL" aria-label="OD — Cilíndrico (CIL)" value={rx.odCylinder} onChange={e=>setRx({...rx,odCylinder:e.target.value})}/>
         <input style={{width:"100%",minWidth:0,boxSizing:"border-box",padding:"6px 7px",fontSize:11}} placeholder="AX" aria-label="OD — Eixo (AX)" value={rx.odAxis} onChange={e=>setRx({...rx,odAxis:e.target.value})}/>
         <input style={{width:"100%",minWidth:0,boxSizing:"border-box",padding:"6px 7px",fontSize:11}} placeholder="ADD" aria-label="OD — Adição (ADD)" value={rx.odAdd} onChange={e=>setRx({...rx,odAdd:e.target.value})}/>
         <input style={{width:"100%",minWidth:0,boxSizing:"border-box",padding:"6px 7px",fontSize:11}} placeholder="DNP" aria-label="OD — DNP" value={rx.odDnp} onChange={e=>setRx({...rx,odDnp:e.target.value})}/>
         <input style={{width:"100%",minWidth:0,boxSizing:"border-box",padding:"6px 7px",fontSize:11}} placeholder="Altura" aria-label="OD — Altura" value={rx.odHeight} onChange={e=>setRx({...rx,odHeight:e.target.value})}/>
       </div>
     </div>
     <div style={{border:"1px solid var(--line)",borderRadius:7,padding:8,minWidth:0,boxSizing:"border-box",overflow:"hidden"}}>
       <div style={{fontWeight:700,fontSize:11,marginBottom:7}}>OE — Olho Esquerdo</div>
       <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:5,minWidth:0}}>
         <input style={{width:"100%",minWidth:0,boxSizing:"border-box",padding:"6px 7px",fontSize:11}} placeholder="ESF" aria-label="OE — Esférico (ESF)" value={rx.oeSphere} onChange={e=>setRx({...rx,oeSphere:e.target.value})}/>
         <input style={{width:"100%",minWidth:0,boxSizing:"border-box",padding:"6px 7px",fontSize:11}} placeholder="CIL" aria-label="OE — Cilíndrico (CIL)" value={rx.oeCylinder} onChange={e=>setRx({...rx,oeCylinder:e.target.value})}/>
         <input style={{width:"100%",minWidth:0,boxSizing:"border-box",padding:"6px 7px",fontSize:11}} placeholder="AX" aria-label="OE — Eixo (AX)" value={rx.oeAxis} onChange={e=>setRx({...rx,oeAxis:e.target.value})}/>
         <input style={{width:"100%",minWidth:0,boxSizing:"border-box",padding:"6px 7px",fontSize:11}} placeholder="ADD" aria-label="OE — Adição (ADD)" value={rx.oeAdd} onChange={e=>setRx({...rx,oeAdd:e.target.value})}/>
         <input style={{width:"100%",minWidth:0,boxSizing:"border-box",padding:"6px 7px",fontSize:11}} placeholder="DNP" aria-label="OE — DNP" value={rx.oeDnp} onChange={e=>setRx({...rx,oeDnp:e.target.value})}/>
         <input style={{width:"100%",minWidth:0,boxSizing:"border-box",padding:"6px 7px",fontSize:11}} placeholder="Altura" aria-label="OE — Altura" value={rx.oeHeight} onChange={e=>setRx({...rx,oeHeight:e.target.value})}/>
       </div>
     </div>
   </div>
   <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:8,marginTop:10}}>
     <input placeholder="DP Total (Distância pupilar)" aria-label="DP Total (Distância pupilar)" value={rx.pdTotal} onChange={e=>setRx({...rx,pdTotal:e.target.value})}/>
     <input placeholder="Observações" aria-label="Observações" value={rx.notes} onChange={e=>setRx({...rx,notes:e.target.value})}/>
   </div>
   <button className="primary" type="submit" style={{marginTop:10}}>Registrar receita</button>
 </form>
 <h3 style={{fontSize:12,marginTop:25}}>Histórico comercial</h3><p style={{fontSize:10,color:"var(--muted)"}}>Pedidos: {selected.orders?.length??0} · Vendas: {selected.sales?.length??0} · Contas: {selected.accounts?.length??0}</p>
 {(selected.orders||[]).slice(0,10).map((o:any)=><div key={o.id} style={{fontSize:10,padding:"8px 0",borderTop:"1px solid var(--line)"}}>Pedido #{o.number} · {o.status} · R$ {Number(o.total).toFixed(2)} · {new Date(o.createdAt).toLocaleDateString("pt-BR")}</div>)}
 {(selected.sales||[]).slice(0,10).map((s:any)=><div key={s.id} style={{fontSize:10,padding:"8px 0",borderTop:"1px solid var(--line)"}}>Venda #{s.number} · R$ {Number(s.total).toFixed(2)} · {new Date(s.createdAt).toLocaleDateString("pt-BR")}</div>)}
 {(selected.accounts||[]).slice(0,10).map((a:any)=><div key={a.id} style={{fontSize:10,padding:"8px 0",borderTop:"1px solid var(--line)"}}>Conta {a.type==="RECEBER"?"a receber":"a pagar"} · {a.description} · R$ {Number(a.amount-a.paidAmount).toFixed(2)} · {a.status}</div>)}
 <div style={{marginTop:28,paddingTop:18,borderTop:"1px solid var(--line)",display:"flex",justifyContent:"flex-end"}}>
   <button type="button" className="secondary" onClick={deleteCustomer} style={{color:"#b42318",borderColor:"#f2b8b5"}}>Excluir cliente</button>
 </div>
 </div>}</section>
}
