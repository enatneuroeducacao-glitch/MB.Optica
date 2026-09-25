"use client";

import {useEffect,useMemo,useState} from "react";
import {StatusBadge} from "@/components/StatusBadge";

type Customer={id:string;name:string;cpfCnpj?:string|null;phone?:string|null;email?:string|null};
type Prescription={
 id:string; customerId:string; date?:string; professional?:string|null; validUntil?:string|null;
 odSphere?:number|null;odCylinder?:number|null;odAxis?:number|null;odAdd?:number|null;odPrism?:number|null;odBase?:string|null;odDnp?:number|null;odHeight?:number|null;
 oeSphere?:number|null;oeCylinder?:number|null;oeAxis?:number|null;oeAdd?:number|null;oePrism?:number|null;oeBase?:string|null;oeDnp?:number|null;oeHeight?:number|null;
 pdTotal?:number|null;notes?:string|null;
};
type Product={id:string;code:string;description:string;salePrice:number|string};
type Order=any;

const next:Record<string,string>={
 ORCAMENTO:"APROVADO",APROVADO:"PEDIDO",PEDIDO:"AGUARDANDO_LABORATORIO",
 AGUARDANDO_LABORATORIO:"EM_PRODUCAO",EM_PRODUCAO:"RECEBIDO",RECEBIDO:"CONFERENCIA",
 CONFERENCIA:"PRONTO",PRONTO:"ENTREGUE"
};

const emptyForm={
 customerId:"",prescriptionId:"",productId:"",quantity:"1",unitPrice:"",
 kind:"LENTE",laboratory:"",dueDate:"",notes:""
};

const money=(value:number|string|undefined|null)=>Number(value||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const dateBR=(value:any)=>value?new Date(value).toLocaleDateString("pt-BR"):"—";

function printLabAndOS(o:Order){
 const c=o.customer;
 if(!c){alert("O pedido não possui cliente vinculado.");return;}
 const r=o.prescription;
 const esc=(v:any)=>String(v??"—").replace(/[&<>"]/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[x]!));
 const eye=(side:"od"|"oe",key:string)=>r?.[side+key]??"—";
 const generatedAt=new Date().toLocaleString("pt-BR");
 const win=window.open("","_blank","width=950,height=1100");
 if(!win){alert("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.");return;}

 win.document.write(`<!doctype html><html><head><title>Laboratório + O.S. #${esc(o.number)} — MB Óptica</title>
 <style>
 @page{size:A4;margin:11mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:10.5px}
 .page{min-height:270mm;page-break-after:always}.page:last-child{page-break-after:auto}
 .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}
 .brand{font-size:20px;font-weight:700}.subtitle{font-size:9px;color:#555;margin-top:2px}.title{text-align:right;font-size:15px;font-weight:700}
 .meta{display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:6px;border:1px solid #777;padding:7px;margin-bottom:8px}
 .field{border-bottom:1px solid #777;min-height:22px;padding:3px 2px}.full{grid-column:1/-1}
 .section{border:1px solid #777;padding:7px;margin-bottom:8px}.section h2{font-size:10.5px;margin:0 0 6px;text-transform:uppercase}
 .rx{display:grid;grid-template-columns:1fr 1fr;gap:7px}.eye{border:1px solid #777;padding:7px}.eye h3{text-align:center;margin:0 0 5px;font-size:11px}
 table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:4px;text-align:left}th{font-size:8.5px;text-transform:uppercase}
 .items td,.items th{border:1px solid #bbb}.items th{background:#f2f2f2}
 .sign{display:grid;grid-template-columns:1fr 1fr;gap:45px;margin-top:35px}.sign div{border-top:1px solid #111;padding-top:4px;text-align:center}
 .note{border:1px solid #777;min-height:42px;padding:6px}.footer{text-align:center;font-size:7.5px;color:#555;margin-top:8px}
 .stamp{border:1px solid #111;padding:5px 10px;text-align:center;font-weight:700;display:inline-block}
 </style></head><body>
 <div class="page">
  <div class="top"><div><div class="brand">MB ÓPTICA</div><div class="subtitle">Gestão inteligente</div></div><div class="title">PEDIDO AO LABORATÓRIO<br><span style="font-size:10px">Pedido / O.S. Nº #${esc(o.number)}</span></div></div>
  <div class="meta">
   <div><b>Cliente</b><br>${esc(c.name)}</div><div><b>CPF/CNPJ</b><br>${esc(c.cpfCnpj)}</div><div><b>Telefone</b><br>${esc(c.phone)}</div>
   <div><b>Laboratório</b><br>${esc(o.laboratory||"Não informado")}</div><div><b>Pedido criado</b><br>${esc(dateBR(o.createdAt))}</div><div><b>Entrega prevista</b><br>${esc(dateBR(o.dueDate))}</div>
   <div class="full"><b>Receita / profissional</b><br>${esc(r?.professional||"—")} — Receita de ${esc(dateBR(r?.date))} — Validade: ${esc(dateBR(r?.validUntil))}</div>
  </div>
  <div class="section"><h2>Especificação óptica</h2><div class="rx">
   <div class="eye"><h3>OD — OLHO DIREITO</h3><table>
    <tr><td>Esférico (ESF)</td><td>${esc(eye("od","Sphere"))}</td></tr><tr><td>Cilíndrico (CIL)</td><td>${esc(eye("od","Cylinder"))}</td></tr><tr><td>Eixo (AX)</td><td>${esc(eye("od","Axis"))}</td></tr><tr><td>Adição (ADD)</td><td>${esc(eye("od","Add"))}</td></tr><tr><td>Prisma</td><td>${esc(eye("od","Prism"))}</td></tr><tr><td>Base</td><td>${esc(eye("od","Base"))}</td></tr><tr><td>DNP</td><td>${esc(eye("od","Dnp"))}</td></tr><tr><td>Altura</td><td>${esc(eye("od","Height"))}</td></tr>
   </table></div>
   <div class="eye"><h3>OE — OLHO ESQUERDO</h3><table>
    <tr><td>Esférico (ESF)</td><td>${esc(eye("oe","Sphere"))}</td></tr><tr><td>Cilíndrico (CIL)</td><td>${esc(eye("oe","Cylinder"))}</td></tr><tr><td>Eixo (AX)</td><td>${esc(eye("oe","Axis"))}</td></tr><tr><td>Adição (ADD)</td><td>${esc(eye("oe","Add"))}</td></tr><tr><td>Prisma</td><td>${esc(eye("oe","Prism"))}</td></tr><tr><td>Base</td><td>${esc(eye("oe","Base"))}</td></tr><tr><td>DNP</td><td>${esc(eye("oe","Dnp"))}</td></tr><tr><td>Altura</td><td>${esc(eye("oe","Height"))}</td></tr>
   </table></div>
  </div><div style="margin-top:6px"><b>DP Total:</b> ${esc(r?.pdTotal)}</div></div>
  <div class="section"><h2>Itens enviados ao laboratório</h2><table class="items"><tr><th>Descrição</th><th>Tipo</th><th>Olho</th><th>Qtd.</th><th>Valor</th></tr>
   ${(o.items||[]).map((i:any)=>`<tr><td>${esc(i.description)}</td><td>${esc(i.kind)}</td><td>${esc(i.eye)}</td><td>${esc(i.quantity)}</td><td>${esc(money(i.unitPrice))}</td></tr>`).join("")}
  </table></div>
  <div class="section"><h2>Observações / instruções ao laboratório</h2><div class="note">${esc(o.notes||r?.notes||"Sem observações.")}</div></div>
  <div style="text-align:right;margin-top:8px"><span class="stamp">STATUS: ${esc(String(o.status||"").replaceAll("_"," "))}</span></div>
  <div class="sign"><div>Responsável MB Óptica</div><div>Laboratório — recebimento</div></div>
  <div class="footer">Documento de produção — emitido em ${esc(generatedAt)}</div>
 </div>

 <div class="page">
  <div class="top"><div><div class="brand">MB ÓPTICA</div><div class="subtitle">Gestão inteligente</div></div><div class="title">O.S. DE ATENDIMENTO<br><span style="font-size:10px">Nº #${esc(o.number)}</span></div></div>
  <div class="meta">
   <div><b>Cliente</b><br>${esc(c.name)}</div><div><b>CPF/CNPJ</b><br>${esc(c.cpfCnpj)}</div><div><b>Telefone</b><br>${esc(c.phone)}</div>
   <div><b>Laboratório</b><br>${esc(o.laboratory||"—")}</div><div><b>Previsão</b><br>${esc(dateBR(o.dueDate))}</div><div><b>Status</b><br>${esc(String(o.status||"").replaceAll("_"," "))}</div>
  </div>
  <div class="section"><h2>Receita / medidas</h2><div class="rx">
   <div class="eye"><h3>OD — OLHO DIREITO</h3><table><tr><th>Campo</th><th>Valor</th></tr>
    <tr><td>ESF</td><td>${esc(eye("od","Sphere"))}</td></tr><tr><td>CIL</td><td>${esc(eye("od","Cylinder"))}</td></tr><tr><td>AX</td><td>${esc(eye("od","Axis"))}</td></tr><tr><td>ADD</td><td>${esc(eye("od","Add"))}</td></tr><tr><td>PRISMA</td><td>${esc(eye("od","Prism"))}</td></tr><tr><td>BASE</td><td>${esc(eye("od","Base"))}</td></tr><tr><td>DNP</td><td>${esc(eye("od","Dnp"))}</td></tr><tr><td>ALTURA</td><td>${esc(eye("od","Height"))}</td></tr>
   </table></div>
   <div class="eye"><h3>OE — OLHO ESQUERDO</h3><table><tr><th>Campo</th><th>Valor</th></tr>
    <tr><td>ESF</td><td>${esc(eye("oe","Sphere"))}</td></tr><tr><td>CIL</td><td>${esc(eye("oe","Cylinder"))}</td></tr><tr><td>AX</td><td>${esc(eye("oe","Axis"))}</td></tr><tr><td>ADD</td><td>${esc(eye("oe","Add"))}</td></tr><tr><td>PRISMA</td><td>${esc(eye("oe","Prism"))}</td></tr><tr><td>BASE</td><td>${esc(eye("oe","Base"))}</td></tr><tr><td>DNP</td><td>${esc(eye("oe","Dnp"))}</td></tr><tr><td>ALTURA</td><td>${esc(eye("oe","Height"))}</td></tr>
   </table></div>
  </div><div style="margin-top:6px"><b>DP Total:</b> ${esc(r?.pdTotal)} &nbsp;&nbsp; <b>Profissional:</b> ${esc(r?.professional)}</div></div>
  <div class="section"><h2>Produtos / serviço</h2><table class="items"><tr><th>Descrição</th><th>Tipo</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr>
   ${(o.items||[]).map((i:any)=>`<tr><td>${esc(i.description)}</td><td>${esc(i.kind)}</td><td>${esc(i.quantity)}</td><td>${esc(money(i.unitPrice))}</td><td>${esc(money(Number(i.quantity)*Number(i.unitPrice)))}</td></tr>`).join("")}
   <tr><td colspan="4" style="text-align:right"><b>TOTAL</b></td><td><b>${esc(money(o.total))}</b></td></tr>
  </table></div>
  <div class="section"><h2>Conferência e atendimento</h2><div class="note"><b>Observações:</b><br>${esc(o.notes||"")}<br><br><b>Conferência da montagem:</b> ________________________________________________________________________</div></div>
  <div class="sign"><div>Responsável pelo atendimento</div><div>Cliente</div></div>
  <div class="footer">O.S./Pedido #${esc(o.number)} — MB Óptica — emitido em ${esc(generatedAt)}</div>
 </div>
 <script>window.onload=()=>{window.focus();window.print();}</script></body></html>`);
 win.document.close();
}

export default function Pedidos(){
 const [rows,setRows]=useState<Order[]>([]);
 const [customers,setCustomers]=useState<Customer[]>([]);
 const [prescriptions,setPrescriptions]=useState<Prescription[]>([]);
 const [products,setProducts]=useState<Product[]>([]);
 const [form,setForm]=useState(emptyForm);
 const [open,setOpen]=useState(false);
 const [selected,setSelected]=useState<Order|null>(null);
 const [msg,setMsg]=useState("");
 const [search,setSearch]=useState("");

 const load=async()=>{
  const [o,c,p,rx]=await Promise.all([fetch("/api/orders"),fetch("/api/customers"),fetch("/api/products"),fetch("/api/prescriptions")]);
  const od=await o.json(),cd=await c.json(),pd=await p.json(),rd=await rx.json();
  if(o.ok)setRows(od); if(c.ok)setCustomers(cd); if(p.ok)setProducts(pd); if(rx.ok)setPrescriptions(rd);
 };
 useEffect(()=>{load()},[]);

 const customerPrescriptions=useMemo(
  ()=>prescriptions.filter(r=>r.customerId===form.customerId),
  [prescriptions,form.customerId]
 );

 const save=async(e:React.FormEvent)=>{
  e.preventDefault();setMsg("");
  const p=products.find(x=>x.id===form.productId);
  const me=await fetch("/api/auth/me").then(r=>r.json());
  const sellerId=me.user?.id||me.id;
  if(!sellerId){setMsg("Sessão administrativa não identificada.");return}
  const r=await fetch("/api/orders",{
   method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({
    customerId:form.customerId,prescriptionId:form.prescriptionId||undefined,sellerId,
    laboratory:form.laboratory,dueDate:form.dueDate||undefined,notes:form.notes,
    items:[{productId:form.productId||undefined,description:p?.description||"Item óptico",kind:form.kind,quantity:Number(form.quantity),unitPrice:Number(form.unitPrice||p?.salePrice||0)}]
   })
  });
  const d=await r.json();
  if(!r.ok){setMsg(d.error+" "+(d.detail||""));return}
  setMsg("Pedido criado.");setOpen(false);setForm(emptyForm);load();
 };

 const advance=async(o:Order)=>{
  const status=next[o.status];if(!status)return;
  const r=await fetch("/api/orders/"+o.id+"/status",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status,message:"Atualização operacional"})});
  const d=await r.json();if(!r.ok)setMsg(d.error+" "+(d.detail||""));else setMsg("Pedido atualizado.");
  const refreshed=await fetch("/api/orders").then(x=>x.json());
  if(Array.isArray(refreshed))setRows(refreshed);
  if(selected?.id===o.id)setSelected(refreshed.find((x:Order)=>x.id===o.id)||o);
 };

 const filtered=rows.filter(o=>((o.customer?.name||"")+" "+(o.number||"")+" "+(o.laboratory||"")).toLowerCase().includes(search.toLowerCase()));

 return <section className="page">
  <div className="page-heading">
   <div><span className="eyebrow">OPERAÇÃO</span><h1>Pedidos</h1><p>Transforme o orçamento em produção, acompanhe o laboratório e finalize a entrega.</p></div>
   <button className="primary" onClick={()=>setOpen(true)}>+ Novo pedido</button>
  </div>
  {msg&&<div className="panel" style={{padding:12,marginBottom:12}}>{msg}</div>}

  <div className="status-strip">{Object.keys(next).map(s=><div key={s}><span className="dot"></span><b>{s.replaceAll("_"," ")}</b></div>)}</div>

  {open&&<div className="panel" style={{padding:20,marginTop:12}}>
   <div className="panel-heading" style={{padding:0,marginBottom:16}}><div><h2>Novo pedido óptico</h2><p>Selecione o cliente, a receita e os itens que serão enviados ao laboratório.</p></div><button className="secondary" onClick={()=>setOpen(false)}>Fechar</button></div>
   <form onSubmit={save}>
    <div style={{display:"grid",gridTemplateColumns:"1.5fr 1fr 1fr",gap:12}}>
     <label>Cliente<select required value={form.customerId} onChange={e=>setForm({...form,customerId:e.target.value,prescriptionId:""})}><option value="">Selecione o cliente</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.cpfCnpj?" — "+c.cpfCnpj:""}</option>)}</select></label>
     <label>Receita vinculada<select disabled={!form.customerId} value={form.prescriptionId} onChange={e=>setForm({...form,prescriptionId:e.target.value})}><option value="">{form.customerId?(customerPrescriptions.length?"Selecione a receita":"Nenhuma receita cadastrada"):"Selecione o cliente primeiro"}</option>{customerPrescriptions.map(r=><option key={r.id} value={r.id}>{dateBR(r.date)}{r.professional?" — "+r.professional:""}</option>)}</select></label>
     <label>Laboratório<input value={form.laboratory} onChange={e=>setForm({...form,laboratory:e.target.value})} placeholder="Ex.: Laboratório parceiro"/></label>
     <label>Prazo de entrega<input type="date" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/></label>
     <label>Produto<select required value={form.productId} onChange={e=>{const p=products.find(x=>x.id===e.target.value);setForm({...form,productId:e.target.value,unitPrice:p?String(p.salePrice):""})}}><option value="">Selecione o produto</option>{products.map(p=><option key={p.id} value={p.id}>{p.code} — {p.description}</option>)}</select></label>
     <label>Tipo<select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}><option value="LENTE">Lente</option><option value="ARMAÇÃO">Armação</option><option value="TRATAMENTO">Tratamento</option><option value="SERVIÇO">Serviço</option><option value="OUTRO">Outro</option></select></label>
     <label>Quantidade<input required type="number" min="1" step="1" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label>
     <label>Preço unitário<input required type="number" min="0" step="0.01" value={form.unitPrice} onChange={e=>setForm({...form,unitPrice:e.target.value})} placeholder="0,00"/></label>
    </div>
    <label style={{display:"block",marginTop:16}}>
     <span style={{display:"block",fontWeight:600,marginBottom:7}}>Observações / instruções ao laboratório</span>
     <textarea rows={5} style={{width:"100%",minHeight:130,resize:"vertical"}} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Material, tratamento, montagem, observações de conferência..."/>
    </label>
    <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:12}}><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancelar</button><button className="primary" type="submit">Criar pedido</button></div>
   </form>
  </div>}

  <div className="toolbar" style={{marginTop:12}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar cliente, nº do pedido ou laboratório..."/><button className="secondary" onClick={load}>Atualizar</button></div>

  <div className="panel"><div className="table">
   <div className="row header"><span>Pedido</span><span>Cliente</span><span>Status</span><span>Entrega</span><span>Total</span><span>Ação</span></div>
   {filtered.map(o=><div className="row" key={o.id}><strong>#{o.number}</strong><span>{o.customer?.name}</span><span><StatusBadge status={o.status}/></span><span>{dateBR(o.dueDate)}</span><strong>{money(o.total)}</strong><button className="link-button" onClick={()=>setSelected(o)}>Detalhes</button></div>)}
   {!filtered.length&&<div style={{padding:20,textAlign:"center",color:"var(--muted)"}}>Nenhum pedido encontrado.</div>}
  </div></div>

  {selected&&<div className="panel" style={{padding:20,marginTop:12}}>
   <div className="panel-heading" style={{padding:0,marginBottom:12}}>
    <div><span className="eyebrow">PEDIDO #{selected.number}</span><h2>{selected.customer?.name}</h2><p>{selected.laboratory||"Laboratório não informado"} · Entrega: {dateBR(selected.dueDate)}</p></div>
    <div style={{display:"flex",gap:8}}><button className="secondary" onClick={()=>printLabAndOS(selected)}>🖨 Laboratório + O.S.</button><button className="secondary" onClick={()=>setSelected(null)}>Fechar</button></div>
   </div>
   <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
    <div className="panel" style={{padding:10}}><small>Status</small><div><StatusBadge status={selected.status}/></div></div>
    <div className="panel" style={{padding:10}}><small>Receita</small><div>{selected.prescription?dateBR(selected.prescription.date):"Não vinculada"}</div></div>
    <div className="panel" style={{padding:10}}><small>Total</small><div style={{fontWeight:700}}>{money(selected.total)}</div></div>
   </div>
   <div className="panel" style={{padding:12,marginBottom:12}}><b>Itens</b>{selected.items?.map((i:any)=><div key={i.id} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:8,padding:"8px 0",borderTop:"1px solid var(--line)"}}><span>{i.description}</span><span>{i.kind}</span><span>Qtd. {i.quantity}</span><span>{money(i.unitPrice)}</span></div>)}</div>
   <p><b>Observações:</b> {selected.notes||"—"}</p>
   <p><b>Histórico</b></p>
   {selected.events?.map((e:any)=><div key={e.id} style={{fontSize:11,padding:6,borderTop:"1px solid var(--line)"}}>{new Date(e.createdAt).toLocaleString("pt-BR")} · {e.status} · {e.message}</div>)}
   {next[selected.status]&&<button className="primary" style={{marginTop:12}} onClick={()=>advance(selected)}>Avançar para {next[selected.status]}</button>}
  </div>}
 </section>
}
