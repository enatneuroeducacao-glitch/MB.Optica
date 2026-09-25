"use client";

import {useEffect,useMemo,useState} from "react";
import {StatusBadge} from "@/components/StatusBadge";

type Order=any;

const stages=["AGUARDANDO_LABORATORIO","EM_PRODUCAO","RECEBIDO","CONFERENCIA","RETORNO_GARANTIA","PRONTO"];
const labels:Record<string,string>={
 PEDIDO:"PEDIDO",
 AGUARDANDO_LABORATORIO:"AGUARDANDO LABORATÓRIO",
 EM_PRODUCAO:"EM PRODUÇÃO",
 RECEBIDO:"RECEBIDO",
 CONFERENCIA:"CONFERÊNCIA",
 RETORNO_GARANTIA:"RETORNO EM GARANTIA",
 PRONTO:"PRONTO",
 ENTREGUE:"ENTREGUE"
};
const next:Record<string,string>={
 PEDIDO:"AGUARDANDO_LABORATORIO",
 AGUARDANDO_LABORATORIO:"EM_PRODUCAO",
 EM_PRODUCAO:"RECEBIDO",
 RECEBIDO:"CONFERENCIA",
 CONFERENCIA:"PRONTO",
 PRONTO:"ENTREGUE"
};

const dateBR=(v:any)=>v?new Date(v).toLocaleDateString("pt-BR"):"—";
const dateTimeBR=(v:any)=>v?new Date(v).toLocaleString("pt-BR"):"—";
const money=(v:any)=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const overdue=(v:any)=>!!v&&new Date(v).getTime()<Date.now();

function printLaboratory(o:Order){
 const esc=(v:any)=>String(v??"—").replace(/[&<>"]/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[x]!));
 const r=o.prescription;
 const eye=(s:"od"|"oe",k:string)=>r?.[s+k]??"—";
 const win=window.open("","_blank","width=950,height=1100");
 if(!win){alert("Permita pop-ups para imprimir o documento.");return;}
 win.document.write(`<!doctype html><html><head><title>Laboratório - Pedido #${esc(o.number)}</title><style>
 @page{size:A4;margin:11mm}*{box-sizing:border-box}body{font-family:Arial;color:#111;font-size:10.5px;margin:0}
 .top{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}.brand{font-size:20px;font-weight:700}.title{font-size:15px;font-weight:700;text-align:right}
 .meta{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:6px;border:1px solid #777;padding:7px;margin-bottom:8px}.section{border:1px solid #777;padding:7px;margin-bottom:8px}.section h2{font-size:10px;margin:0 0 6px;text-transform:uppercase}
 .rx{display:grid;grid-template-columns:1fr 1fr;gap:7px}.eye{border:1px solid #777;padding:7px}.eye h3{text-align:center;margin:0 0 5px;font-size:11px}
 table{width:100%;border-collapse:collapse}td,th{border:1px solid #bbb;padding:4px;text-align:left}th{font-size:8px}.note{border:1px solid #777;min-height:55px;padding:6px}.sign{display:grid;grid-template-columns:1fr 1fr;gap:45px;margin-top:35px}.sign div{border-top:1px solid #111;text-align:center;padding-top:4px}.footer{text-align:center;font-size:7.5px;margin-top:8px}
 </style></head><body>
 <div class="top"><div><div class="brand">MB ÓPTICA</div><div>Gestão inteligente</div></div><div class="title">PEDIDO AO LABORATÓRIO<br><span style="font-size:10px">#${esc(o.number)}</span></div></div>
 <div class="meta"><div><b>Cliente</b><br>${esc(o.customer?.name)}</div><div><b>CPF/CNPJ</b><br>${esc(o.customer?.cpfCnpj)}</div><div><b>Telefone</b><br>${esc(o.customer?.phone)}</div><div><b>Laboratório</b><br>${esc(o.laboratory)}</div><div><b>Envio</b><br>${esc(dateBR(o.laboratorySentAt))}</div><div><b>Prazo</b><br>${esc(dateBR(o.dueDate))}</div></div>
 <div class="section"><h2>Receita / especificação</h2><div class="rx">
 <div class="eye"><h3>OD — OLHO DIREITO</h3><table><tr><td>ESF</td><td>${esc(eye("od","Sphere"))}</td></tr><tr><td>CIL</td><td>${esc(eye("od","Cylinder"))}</td></tr><tr><td>AX</td><td>${esc(eye("od","Axis"))}</td></tr><tr><td>ADD</td><td>${esc(eye("od","Add"))}</td></tr><tr><td>PRISMA</td><td>${esc(eye("od","Prism"))}</td></tr><tr><td>BASE</td><td>${esc(eye("od","Base"))}</td></tr><tr><td>DNP</td><td>${esc(eye("od","Dnp"))}</td></tr><tr><td>ALTURA</td><td>${esc(eye("od","Height"))}</td></tr></table></div>
 <div class="eye"><h3>OE — OLHO ESQUERDO</h3><table><tr><td>ESF</td><td>${esc(eye("oe","Sphere"))}</td></tr><tr><td>CIL</td><td>${esc(eye("oe","Cylinder"))}</td></tr><tr><td>AX</td><td>${esc(eye("oe","Axis"))}</td></tr><tr><td>ADD</td><td>${esc(eye("oe","Add"))}</td></tr><tr><td>PRISMA</td><td>${esc(eye("oe","Prism"))}</td></tr><tr><td>BASE</td><td>${esc(eye("oe","Base"))}</td></tr><tr><td>DNP</td><td>${esc(eye("oe","Dnp"))}</td></tr><tr><td>ALTURA</td><td>${esc(eye("oe","Height"))}</td></tr></table></div></div>
 <div style="margin-top:6px"><b>DP Total:</b> ${esc(r?.pdTotal)} &nbsp; <b>Profissional:</b> ${esc(r?.professional)}</div></div>
 <div class="section"><h2>Itens</h2><table><tr><th>Descrição</th><th>Tipo</th><th>Qtd.</th><th>Valor</th></tr>${(o.items||[]).map((i:any)=>`<tr><td>${esc(i.description)}</td><td>${esc(i.kind)}</td><td>${esc(i.quantity)}</td><td>${esc(money(i.unitPrice))}</td></tr>`).join("")}</table></div>
 <div class="section"><h2>Instruções ao laboratório</h2><div class="note">${esc(o.notes||r?.notes||"Sem observações.")}</div></div>
 <div class="sign"><div>Responsável MB Óptica</div><div>Laboratório — recebimento</div></div>
 <div class="footer">Pedido #${esc(o.number)} · Emitido em ${esc(new Date().toLocaleString("pt-BR"))}</div>
 <script>window.onload=()=>{window.focus();window.print()}</script></body></html>`);
 win.document.close();
}

export default function Laboratorio(){
 const [rows,setRows]=useState<Order[]>([]),[msg,setMsg]=useState(""),[selected,setSelected]=useState<Order|null>(null),[search,setSearch]=useState(""),[filter,setFilter]=useState("TODOS"),[check,setCheck]=useState<Record<string,boolean>>({}),[showWarrantyForm,setShowWarrantyForm]=useState(false),[warranty,setWarranty]=useState({reason:"",originalFiscalNumber:"",originalFiscalKey:"",notes:""});
 const load=async()=>{const r=await fetch("/api/orders");const d=await r.json();if(r.ok)setRows(d.filter((o:any)=>["PEDIDO",...stages,"ENTREGUE"].includes(o.status)));else setMsg(d.error||"Erro ao carregar pedidos.")};
 useEffect(()=>{load()},[]);
 const filtered=useMemo(()=>rows.filter(o=>{const q=(o.customer?.name+" "+o.number+" "+(o.laboratory||"")).toLowerCase();return (!search||q.includes(search.toLowerCase()))&&(filter==="TODOS"||o.status===filter)}),[rows,search,filter]);
 const counts=Object.fromEntries(stages.map(s=>[s,rows.filter(o=>o.status===s).length]));
 const late=rows.filter(o=>!["ENTREGUE"].includes(o.status)&&overdue(o.dueDate)).length;
 const update=async(o:Order,status:string,message:string)=>{const r=await fetch("/api/orders/"+o.id+"/status",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status,message})});const d=await r.json();if(!r.ok)setMsg(d.error+(d.detail?" — "+d.detail:""));else{setMsg("Pedido atualizado.");await load();const fresh=await fetch("/api/orders").then(x=>x.json());setSelected(fresh.find((x:Order)=>x.id===o.id)||null)}};
 const approve=async()=>{if(!selected)return;const required=["cliente","receita","od","oe","dnp","produto","tratamento","montagem"].every(k=>check[k]);if(!required){setMsg("Conclua todos os itens da conferência antes de liberar o pedido.");return}await update(selected,"PRONTO","Conferência aprovada e montagem liberada.");};
 const reject=async()=>{if(!selected)return;const reason=window.prompt("Informe o motivo da devolução ao laboratório:");if(!reason?.trim())return;await update(selected,"AGUARDANDO_LABORATORIO","Retorno ao laboratório: "+reason.trim());};
 const openWarranty=()=>{setWarranty({reason:"",originalFiscalNumber:"",originalFiscalKey:"",notes:""});setShowWarrantyForm(true);setMsg("")};
 const createWarrantyReturn=async()=>{if(!selected)return;if(!warranty.reason.trim()){setMsg("Informe o motivo do retorno em garantia.");return}const r=await fetch("/api/orders/"+selected.id+"/status",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status:"RETORNO_GARANTIA",message:"Retorno em garantia — "+warranty.reason.trim(),warranty})});const d=await r.json();if(!r.ok){setMsg(d.error+(d.detail?" — "+d.detail:""));return}setMsg("Retorno em garantia registrado. Revise os dados fiscais antes da emissão da NF-e.");setWarranty({reason:"",originalFiscalNumber:"",originalFiscalKey:"",notes:""});setShowWarrantyForm(false);await load();const fresh=await fetch("/api/orders").then(x=>x.json());setSelected(fresh.find((x:Order)=>x.id===selected.id)||null)};
 const advance=async(o:Order)=>{const n=next[o.status];if(!n)return;await update(o,n,n==="AGUARDANDO_LABORATORIO"?"Pedido enviado ao laboratório":"Atualização pelo laboratório");};
 const openDetail=(o:Order)=>{setSelected(o);setCheck({})};
 const checklist=[["cliente","Cliente correto"],["receita","Receita conferida"],["od","OD conferido"],["oe","OE conferido"],["dnp","DNP conferida"],["produto","Lente/produto correto"],["tratamento","Tratamento correto"],["montagem","Montagem sem danos e ajuste"]];

 return <section className="page">
  <div className="page-heading"><div><span className="eyebrow">PRODUÇÃO</span><h1>Laboratório</h1><p>Controle de envio, produção, recebimento, conferência e liberação.</p></div><button className="secondary" onClick={load}>Atualizar</button></div>
  {msg&&<div className="panel" style={{padding:12,marginBottom:12}}>{msg}</div>}
  <div className="stats">{stages.map(s=><button key={s} className="stat-card" onClick={()=>setFilter(s)} style={{textAlign:"left",border:"1px solid var(--line)"}}><b>{counts[s]}</b><span>{labels[s]}</span></button>)}<button className="stat-card" onClick={()=>setFilter("ATRASADOS")} style={{textAlign:"left",border:"1px solid var(--line)"}}><b>{late}</b><span>ATRASADOS</span></button></div>
  <div className="toolbar" style={{marginTop:12}}><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar pedido, cliente ou laboratório..."/><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="TODOS">Todos os status</option>{stages.map(s=><option key={s} value={s}>{labels[s]}</option>)}<option value="ATRASADOS">Atrasados</option></select><button className="secondary" onClick={()=>{setSearch("");setFilter("TODOS")}}>Limpar</button></div>
  <div className="panel"><div className="table"><div className="row header"><span>Pedido</span><span>Cliente</span><span>Laboratório</span><span>Status</span><span>Prazo</span><span>Ação</span></div>
   {filtered.filter(o=>filter!=="ATRASADOS"||overdue(o.dueDate)).map(o=><div className="row" key={o.id}><strong>#{o.number}</strong><span>{o.customer?.name}</span><span>{o.laboratory||"—"}</span><span><StatusBadge status={o.status}/></span><span style={{fontWeight:overdue(o.dueDate)&&o.status!=="ENTREGUE"?700:400}}>{dateBR(o.dueDate)}</span><button className="link-button" onClick={()=>openDetail(o)}>Detalhes</button></div>)}
   {!filtered.filter(o=>filter!=="ATRASADOS"||overdue(o.dueDate)).length&&<div style={{padding:22,textAlign:"center",color:"var(--muted)"}}>Nenhum pedido nesta fila.</div>}
  </div></div>

  {selected&&<div className="panel" style={{padding:20,marginTop:12}}>
   <div className="panel-heading" style={{padding:0,marginBottom:14}}><div><span className="eyebrow">PEDIDO #{selected.number}</span><h2>{selected.customer?.name}</h2><p>{selected.laboratory||"Laboratório não informado"} · Prazo: {dateBR(selected.dueDate)}</p></div><div style={{display:"flex",gap:8}}><button className="secondary" onClick={()=>printLaboratory(selected)}>🖨 Imprimir laboratório</button><button className="secondary" onClick={()=>setSelected(null)}>Fechar</button></div></div>
   <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}><div className="panel" style={{padding:10}}><small>Status</small><div><StatusBadge status={selected.status}/></div></div><div className="panel" style={{padding:10}}><small>Envio</small><div>{dateTimeBR(selected.laboratorySentAt)}</div></div><div className="panel" style={{padding:10}}><small>Recebimento</small><div>{dateTimeBR(selected.receivedAt)}</div></div><div className="panel" style={{padding:10}}><small>Valor</small><div style={{fontWeight:700}}>{money(selected.total)}</div></div></div>
   <div className="panel" style={{padding:12,marginBottom:12}}><b>Receita / medidas</b><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:8}}><div><b>OD</b>: ESF {selected.prescription?.odSphere??"—"} · CIL {selected.prescription?.odCylinder??"—"} · AX {selected.prescription?.odAxis??"—"} · ADD {selected.prescription?.odAdd??"—"} · DNP {selected.prescription?.odDnp??"—"} · ALT {selected.prescription?.odHeight??"—"}</div><div><b>OE</b>: ESF {selected.prescription?.oeSphere??"—"} · CIL {selected.prescription?.oeCylinder??"—"} · AX {selected.prescription?.oeAxis??"—"} · ADD {selected.prescription?.oeAdd??"—"} · DNP {selected.prescription?.oeDnp??"—"} · ALT {selected.prescription?.oeHeight??"—"}</div></div></div>
   <div className="panel" style={{padding:12,marginBottom:12}}><b>Itens para produção</b>{selected.items?.map((i:any)=><div key={i.id} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:8,padding:"8px 0",borderTop:"1px solid var(--line)"}}><span>{i.description}</span><span>{i.kind}</span><span>Qtd. {i.quantity}</span><span>{money(i.unitPrice)}</span></div>)}</div>
   <div className="panel" style={{padding:12,marginBottom:12}}><b>Instruções ao laboratório</b><div style={{whiteSpace:"pre-wrap",marginTop:7,padding:10,border:"1px solid var(--line)"}}>{selected.notes||"Sem observações."}</div></div>
   {selected.status==="CONFERENCIA"&&<div className="panel" style={{padding:12,marginBottom:12}}><h3 style={{marginTop:0}}>Checklist de conferência</h3>{checklist.map(([key,label])=><label key={key} style={{display:"block",padding:"7px 0",borderBottom:"1px solid var(--line)"}}><input type="checkbox" checked={!!check[key]} onChange={e=>setCheck({...check,[key]:e.target.checked})}/> <span style={{marginLeft:7}}>{label}</span></label>)}<div style={{display:"flex",gap:8,marginTop:12}}><button className="primary" onClick={approve}>✓ Aprovar conferência e liberar</button><button className="secondary" onClick={reject}>↩ Devolver ao laboratório</button><button className="secondary" onClick={openWarranty}>↩ Retorno em garantia / NF</button></div></div>
   <div><b>Histórico</b>{selected.events?.map((e:any)=><div key={e.id} style={{fontSize:11,padding:7,borderTop:"1px solid var(--line)"}}>{dateTimeBR(e.createdAt)} · <StatusBadge status={e.status}/> · {e.message}</div>)}</div>
   {(showWarrantyForm||selected.status==="RETORNO_GARANTIA")&&<div className="panel" style={{padding:12,marginBottom:12}}><h3 style={{marginTop:0}}>Retorno em garantia</h3><p>Registre os dados necessários para preparar a devolução ao laboratório e a futura NF-e de retorno.</p><label style={{display:"block",marginBottom:8}}>Motivo<input value={warranty.reason} onChange={e=>setWarranty({...warranty,reason:e.target.value})} placeholder="Ex.: lente com defeito, montagem incorreta..."/></label><label style={{display:"block",marginBottom:8}}>NF-e original do laboratório<input value={warranty.originalFiscalNumber} onChange={e=>setWarranty({...warranty,originalFiscalNumber:e.target.value})} placeholder="Número da NF-e de origem"/></label><label style={{display:"block",marginBottom:8}}>Chave de acesso da NF-e original<input value={warranty.originalFiscalKey} onChange={e=>setWarranty({...warranty,originalFiscalKey:e.target.value})} placeholder="44 dígitos"/></label><label style={{display:"block",marginBottom:8}}>Observações<textarea rows={3} style={{width:"100%"}} value={warranty.notes} onChange={e=>setWarranty({...warranty,notes:e.target.value})}/></label><div style={{display:"flex",gap:8}}><button className="primary" onClick={createWarrantyReturn}>Registrar retorno em garantia</button><button className="secondary" onClick={()=>{setWarranty({reason:"",originalFiscalNumber:"",originalFiscalKey:"",notes:""});setShowWarrantyForm(false)}}>Cancelar</button></div></div>}
   {selected.status!=="CONFERENCIA"&&next[selected.status]&&<button className="primary" style={{marginTop:12}} onClick={()=>advance(selected)}>{selected.status==="PEDIDO"?"📤 Enviar ao laboratório":"Avançar para "+labels[next[selected.status]]}</button>}
  </div>}
 </section>
}
