"use client";
import {useEffect,useState} from "react";

type Customer={id:string;name:string;cpfCnpj?:string|null;phone?:string|null;email?:string|null};
type Rx=any;

const empty={customerId:"",professional:"",validUntil:"",odSphere:"",odCylinder:"",odAxis:"",odAdd:"",odPrism:"",odBase:"",odDnp:"",odHeight:"",oeSphere:"",oeCylinder:"",oeAxis:"",oeAdd:"",oePrism:"",oeBase:"",oeDnp:"",oeHeight:"",pdTotal:"",notes:""};
const nums=["odSphere","odCylinder","odAxis","odAdd","odPrism","odDnp","odHeight","oeSphere","oeCylinder","oeAxis","oeAdd","oePrism","oeDnp","oeHeight","pdTotal"];
const fieldLabels:Record<string,string>={sphere:"Esférico (ESF)",cylinder:"Cilíndrico (CIL)",axis:"Eixo (AX)",add:"Adição (ADD)",prism:"Prisma",dnp:"DNP",height:"Altura"};

function printOS(r:Rx,c?:Customer){
 if(!c)return;
 const esc=(v:any)=>String(v??"—").replace(/[&<>"]/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[x]!));
 const value=(side:"oe"|"od",key:string)=>r[side+key]??"—";
 const data=new Date(r.date||Date.now()).toLocaleDateString("pt-BR");
 const valid=r.validUntil?new Date(r.validUntil).toLocaleDateString("pt-BR"):"—";
 const win=window.open("","_blank","width=900,height=1000");
 if(!win){alert("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.");return;}
 win.document.write(`<!doctype html><html><head><title>O.S. Atendimento - ${esc(c.name)}</title><style>
 @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:12px}
 .top{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px}.brand{font-size:22px;font-weight:700}.title{font-size:18px;font-weight:700}
 .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;border:1px solid #bbb;padding:10px;margin-bottom:14px}
 .rx{display:grid;grid-template-columns:1fr 1fr;gap:12px}.eye{border:1px solid #999;padding:12px}.eye h2{text-align:center;margin:0 0 10px;font-size:16px}
 table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:7px;text-align:left}th{font-size:10px;text-transform:uppercase}
 .notes{border:1px solid #999;min-height:70px;padding:10px;margin-top:14px}.sign{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:55px}.line{border-top:1px solid #111;padding-top:7px;text-align:center}
 .footer{margin-top:25px;font-size:9px;color:#555;text-align:center}
 </style></head><body>
 <div class="top"><div><div class="brand">MB ÓPTICA</div><div>Gestão inteligente</div></div><div class="title">O.S. DE ATENDIMENTO</div></div>
 <div class="meta"><div><b>Cliente:</b> ${esc(c.name)}</div><div><b>CPF/CNPJ:</b> ${esc(c.cpfCnpj)}</div><div><b>Telefone:</b> ${esc(c.phone)}</div><div><b>Data da receita:</b> ${esc(data)}</div><div><b>Profissional:</b> ${esc(r.professional)}</div><div><b>Validade:</b> ${esc(valid)}</div></div>
 <div class="rx">
 <div class="eye"><h2>OE — OLHO ESQUERDO</h2><table><tr><th>Campo</th><th>Valor</th></tr>
 <tr><td>Esférico (ESF)</td><td>${esc(value("oe","Sphere"))}</td></tr><tr><td>Cilíndrico (CIL)</td><td>${esc(value("oe","Cylinder"))}</td></tr><tr><td>Eixo (AX)</td><td>${esc(value("oe","Axis"))}</td></tr><tr><td>Adição (ADD)</td><td>${esc(value("oe","Add"))}</td></tr><tr><td>Prisma</td><td>${esc(value("oe","Prism"))}</td></tr><tr><td>DNP</td><td>${esc(value("oe","Dnp"))}</td></tr><tr><td>Altura</td><td>${esc(value("oe","Height"))}</td></tr></table></div>
 <div class="eye"><h2>OD — OLHO DIREITO</h2><table><tr><th>Campo</th><th>Valor</th></tr>
 <tr><td>Esférico (ESF)</td><td>${esc(value("od","Sphere"))}</td></tr><tr><td>Cilíndrico (CIL)</td><td>${esc(value("od","Cylinder"))}</td></tr><tr><td>Eixo (AX)</td><td>${esc(value("od","Axis"))}</td></tr><tr><td>Adição (ADD)</td><td>${esc(value("od","Add"))}</td></tr><tr><td>Prisma</td><td>${esc(value("od","Prism"))}</td></tr><tr><td>DNP</td><td>${esc(value("od","Dnp"))}</td></tr><tr><td>Altura</td><td>${esc(value("od","Height"))}</td></tr></table></div></div>
 <div class="meta" style="margin-top:14px"><div><b>DP Total:</b> ${esc(r.pdTotal)}</div><div><b>Atendimento:</b> __________________________________</div></div>
 <div class="notes"><b>Observações / orientação para atendimento</b><br><br>${esc(r.notes||"")}</div>
 <div class="sign"><div class="line">Responsável pelo atendimento</div><div class="line">Cliente</div></div>
 <div class="footer">Documento de atendimento interno — MB Óptica — Emitido em ${esc(new Date().toLocaleString("pt-BR"))}</div>
 <script>window.onload=()=>{window.focus();window.print();}</script></body></html>`);
 win.document.close();
}

export default function Receitas(){
 const [rows,setRows]=useState<Rx[]>([]),[customers,setCustomers]=useState<Customer[]>([]),[form,setForm]=useState(empty),[open,setOpen]=useState(false),[search,setSearch]=useState(""),[message,setMessage]=useState(""),[loading,setLoading]=useState(true);
 const load=async()=>{setLoading(true);setMessage("");try{const [r,c]=await Promise.all([fetch("/api/prescriptions"),fetch("/api/customers")]);const rd=await r.json(),cd=await c.json();if(!r.ok)throw new Error(rd.error||"Não foi possível carregar as receitas.");if(!c.ok)throw new Error(cd.error||"Não foi possível carregar os clientes.");setRows(rd);setCustomers(cd)}catch(e){setMessage(e instanceof Error?e.message:"Erro ao carregar o módulo.");}finally{setLoading(false)}};
 useEffect(()=>{load()},[]);
 const save=async(e:React.FormEvent)=>{e.preventDefault();setMessage("");const r=await fetch("/api/prescriptions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});const d=await r.json();if(!r.ok){setMessage(d.error||"Não foi possível registrar a receita.");return}setMessage("Receita registrada com sucesso.");setForm(empty);setOpen(false);load()};
 const filtered=rows.filter(r=>{const c=customers.find(x=>x.id===r.customerId);return ((c?.name||"")+" "+(c?.cpfCnpj||"")+" "+(r.professional||"")).toLowerCase().includes(search.toLowerCase())});
 return <section className="page">
  <div className="page-heading"><div><span className="eyebrow">MB ÓPTICA</span><h1>Receitas ópticas</h1><p>Cadastro e histórico de receitas vinculadas aos clientes.</p></div><button className="primary" onClick={()=>setOpen(true)}>+ Nova receita</button></div>
  {message&&<div className="panel" style={{padding:12,marginBottom:12}}>{message}</div>}
  <div className="toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar cliente ou profissional..."/><button className="secondary" onClick={load}>Atualizar</button></div>
  {open&&<div className="panel" style={{padding:20,marginBottom:12}}>
   <div className="panel-heading" style={{padding:0,marginBottom:15}}><h2>Nova receita</h2><button className="secondary" onClick={()=>setOpen(false)}>Fechar</button></div>
   <form onSubmit={save}>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
     <div style={{display:"grid",gridTemplateColumns:"1.2fr 1fr 1fr",gap:8}}>
      <select required value={form.customerId} onChange={e=>setForm({...form,customerId:e.target.value})}><option value="">Selecione o cliente</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.cpfCnpj?" — "+c.cpfCnpj:""}</option>)}</select>
      <input placeholder="Profissional" value={form.professional} onChange={e=>setForm({...form,professional:e.target.value})}/>
      <input type="date" value={form.validUntil} onChange={e=>setForm({...form,validUntil:e.target.value})}/>
     </div>
     <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",fontSize:11,color:"var(--muted)"}}>Preencha os dois olhos e utilize a O.S. para o atendimento.</div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
     <div className="panel" style={{padding:14,border:"1px solid var(--line)"}}>
      <h3 style={{margin:"0 0 10px",textAlign:"center"}}>OE — Olho Esquerdo</h3>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
       {["oeSphere","oeCylinder","oeAxis","oeAdd","oePrism","oeBase","oeDnp","oeHeight"].map(k=><input key={k} placeholder={k.replace("oe","")} value={(form as any)[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/>)}
      </div>
     </div>
     <div className="panel" style={{padding:14,border:"1px solid var(--line)"}}>
      <h3 style={{margin:"0 0 10px",textAlign:"center"}}>OD — Olho Direito</h3>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
       {["odSphere","odCylinder","odAxis","odAdd","odPrism","odBase","odDnp","odHeight"].map(k=><input key={k} placeholder={k.replace("od","")} value={(form as any)[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/>)}
      </div>
     </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:8,marginTop:10}}>
     <input placeholder="DP Total" value={form.pdTotal} onChange={e=>setForm({...form,pdTotal:e.target.value})}/>
     <input placeholder="Observações" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/>
    </div>
    <button className="primary" type="submit" style={{marginTop:10}}>Registrar receita</button>
   </form>
  </div>}
  <div className="panel"><div className="table">
   <div className="row header"><span>Cliente</span><span>Data</span><span>Profissional</span><span>OD</span><span>OE</span><span>Validade</span><span>Atendimento</span></div>
   {loading?<div style={{padding:20}}>Carregando...</div>:filtered.map(r=>{const c=customers.find(x=>x.id===r.customerId);return <div className="row" key={r.id}>
    <strong>{c?.name||"Cliente"}</strong><span>{r.date?new Date(r.date).toLocaleDateString("pt-BR"):"—"}</span><span>{r.professional||"—"}</span>
    <span>{r.odSphere??"—"} / {r.odCylinder??"—"} / {r.odAxis??"—"}</span><span>{r.oeSphere??"—"} / {r.oeCylinder??"—"} / {r.oeAxis??"—"}</span><span>{r.validUntil?new Date(r.validUntil).toLocaleDateString("pt-BR"):"—"}</span>
    <button className="secondary" onClick={()=>printOS(r,c)}>Imprimir O.S.</button>
   </div>})}
   {!loading&&!filtered.length&&<div style={{padding:20,textAlign:"center",color:"var(--muted)"}}>Nenhuma receita encontrada.</div>}
  </div></div>
 </section>
}
