"use client";
import {useEffect,useState} from "react";

type Customer={id:string;name:string;cpfCnpj?:string|null;phone?:string|null;email?:string|null};
type Rx=any;

const empty={customerId:"",professional:"",validUntil:"",odSphere:"",odCylinder:"",odAxis:"",odAdd:"",odPrism:"",odBase:"",odDnp:"",odHeight:"",oeSphere:"",oeCylinder:"",oeAxis:"",oeAdd:"",oePrism:"",oeBase:"",oeDnp:"",oeHeight:"",pdTotal:"",notes:""};
const nums=["odSphere","odCylinder","odAxis","odAdd","odPrism","odDnp","odHeight","oeSphere","oeCylinder","oeAxis","oeAdd","oePrism","oeDnp","oeHeight","pdTotal"];
const fieldLabels:Record<string,string>={sphere:"Esférico (ESF)",cylinder:"Cilíndrico (CIL)",axis:"Eixo (AX)",add:"Adição (ADD)",prism:"Prisma",base:"Base",dnp:"DNP",height:"Altura"};

async function printManualOS(){
 const numberResponse=await fetch("/api/service-orders/next",{method:"POST"});
 const numberData=await numberResponse.json();
 if(!numberResponse.ok){alert(numberData.error||"Não foi possível gerar o número da O.S.");return;}
 const osNumber=numberData.display;
 const win=window.open("","_blank","width=900,height=1000");
 if(!win){alert("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.");return;}
 win.document.write(`<!doctype html><html><head><title>O.S. Manual - MB Óptica</title><style>
 @page{size:A4;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:11px}
 .top{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}.brand{font-size:20px;font-weight:700}.title{font-size:16px;font-weight:700}
 .section{border:1px solid #777;margin-bottom:8px;padding:8px}.section h2{font-size:12px;margin:0 0 7px;text-transform:uppercase}
 .fields{display:grid;grid-template-columns:1fr 1fr;gap:7px}.field{border-bottom:1px solid #555;min-height:25px;padding:4px 2px}.full{grid-column:1/-1}
 .rx{display:grid;grid-template-columns:1fr 1fr;gap:8px}.eye{border:1px solid #777;padding:7px}.eye h3{text-align:center;margin:0 0 6px;font-size:13px}.line{display:grid;grid-template-columns:1fr 1fr;gap:5px}
 .sale{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px}.large{min-height:42px;border:1px solid #777;padding:5px}
 .sign{display:grid;grid-template-columns:1fr 1fr;gap:45px;margin-top:24px}.sign div{border-top:1px solid #111;padding-top:5px;text-align:center}
 .client-copy{border:1.5px dashed #555;margin-top:16px;padding:8px}.cutline{border-top:1px dashed #555;margin:-2px 0 8px;padding-top:4px;text-align:center;font-size:9px;font-weight:700}.client-copy-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px}.client-copy-head b{font-size:14px}.os-box{border:1px solid #555;padding:5px 10px;text-align:center}.client-copy-grid{display:grid;grid-template-columns:1.4fr 1fr;gap:5px;font-size:9px}.client-copy-grid>div{border-bottom:1px solid #777;min-height:28px;padding:3px}.pickup-note{font-size:8px;border:1px solid #aaa;padding:5px;margin-top:6px}.pickup-sign{font-size:8px;margin-top:7px}.footer{text-align:center;font-size:8px;margin-top:8px}
 </style></head><body>
 <div class="top"><div><div class="brand">MB ÓPTICA</div><div>Gestão inteligente</div></div><div class="title">O.S. DE ATENDIMENTO / VENDA</div></div>
 <div class="section"><h2>Dados do cliente</h2><div class="fields">
 <div class="field">Cliente: ______________________________________________</div><div class="field">CPF/CNPJ: ______________________________</div>
 <div class="field">Telefone: ______________________________________________</div><div class="field">Data: ____/____/________</div>
 <div class="field full">Endereço: __________________________________________________________________________________________</div>
 </div></div>
 <div class="section"><h2>Receita / Medidas</h2><div class="rx">
 <div class="eye"><h3>OE — OLHO ESQUERDO</h3><div class="line"><div class="field">ESF: __________</div><div class="field">CIL: __________</div><div class="field">AX: __________</div><div class="field">ADD: __________</div><div class="field">PRISMA: _______</div><div class="field">BASE: _________</div><div class="field">DNP: __________</div><div class="field">ALTURA: _______</div></div></div>
 <div class="eye"><h3>OD — OLHO DIREITO</h3><div class="line"><div class="field">ESF: __________</div><div class="field">CIL: __________</div><div class="field">AX: __________</div><div class="field">ADD: __________</div><div class="field">PRISMA: _______</div><div class="field">BASE: _________</div><div class="field">DNP: __________</div><div class="field">ALTURA: _______</div></div></div>
 </div><div class="fields" style="margin-top:7px"><div class="field">DP TOTAL: __________________</div><div class="field">PROFISSIONAL: ______________________________</div></div></div>
 <div class="section"><h2>Venda / Serviço</h2><div class="sale">
 <div class="field">O.S. Nº: ${osNumber}</div><div class="field">Pedido Nº: ________________</div><div class="field">Vendedor: __________________</div>
 <div class="field">Armação: __________________________________</div><div class="field">Lente: ____________________________________</div><div class="field">Tratamento: _______________________________</div>
 <div class="field">Prazo de entrega: _________________________</div><div class="field">Valor: R$ __________________</div><div class="field">Forma de pagamento: _______________________</div>
 </div><div class="large" style="margin-top:7px">Observações / especificações: ______________________________________________________________________________________<br><br>____________________________________________________________________________________________________________</div></div>
 <div class="section"><h2>Conferência e atendimento</h2><div class="fields"><div class="field full">Conferência da montagem: _________________________________________________________________________________________</div><div class="field full">Orientações / pendências: __________________________________________________________________________________________</div></div></div>
 <div class="sign"><div>Responsável pelo atendimento</div><div>Cliente</div></div>
 <div class="client-copy"><div class="cutline"><span>✂</span> VIA DO CLIENTE — RECORTE AQUI</div>
  <div class="client-copy-head"><div><b>MB ÓPTICA</b><br><span>Comprovante de retirada</span></div><div class="os-box"><b>O.S. Nº</b><br>${osNumber}</div></div>
  <div class="client-copy-grid">
   <div><b>Cliente</b><br>____________________________________________</div>
   <div><b>Telefone</b><br>____________________________</div>
   <div><b>Data da O.S.</b><br>____/____/________</div>
   <div><b>Previsão de retirada</b><br>____/____/________</div>
   <div><b>Produto / serviço</b><br>____________________________________________</div>
   <div><b>Valor / saldo</b><br>R$ ________________________</div>
  </div>
  <div class="pickup-note"><b>Para retirar:</b> apresente esta via ou informe o número da O.S. ao atendimento. Confira o produto no momento da retirada.</div>
  <div class="pickup-sign">Assinatura / confirmação da retirada: ______________________________________________</div>
 </div>
 <div class="footer">Documento interno para preenchimento manual — MB Óptica</div>
 <script>window.onload=()=>{window.focus();window.print();}</script></body></html>`);
 win.document.close();
}

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
 const load=async()=>{setLoading(true);setMessage("");try{const [r,c]=await Promise.all([fetch("/api/prescriptions",{cache:"no-store",credentials:"include"}),fetch("/api/customers",{cache:"no-store",credentials:"include"})]);const rd=await r.json(),cd=await c.json();if(!r.ok)throw new Error(rd.error||"Não foi possível carregar as receitas.");if(!c.ok)throw new Error(cd.error||"Não foi possível carregar os clientes.");setRows(rd);setCustomers(cd)}catch(e){setMessage(e instanceof Error?e.message:"Erro ao carregar o módulo.");}finally{setLoading(false)}};
 useEffect(()=>{load()},[]);
 const save=async(e:React.FormEvent)=>{e.preventDefault();setMessage("");const r=await fetch("/api/prescriptions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});const d=await r.json();if(!r.ok){setMessage(d.error||"Não foi possível registrar a receita.");return}setMessage("Receita registrada com sucesso.");setForm(empty);setOpen(false);load()};
 const deletePrescription=async(r:Rx)=>{const c=customers.find(x=>x.id===r.customerId)||r.customer;const name=c?.name||"este cliente";if(!window.confirm(`Excluir somente esta receita de ${name}, de ${r.date?new Date(r.date).toLocaleDateString("pt-BR"):"data não informada"}? Os demais dados do cliente serão preservados.`))return;setMessage("");const response=await fetch(`/api/prescriptions/${r.id}`,{method:"DELETE",credentials:"include"});const data=await response.json();if(!response.ok){setMessage(data.error||"Não foi possível excluir a receita.");return}setMessage("Receita excluída com sucesso.");load()};
 const filtered=rows.filter(r=>{const c=customers.find(x=>x.id===r.customerId)||r.customer;return ((c?.name||"")+" "+(c?.cpfCnpj||"")+" "+(r.professional||"")).toLowerCase().includes(search.toLowerCase())});
 return <section className="page">
  <div className="page-heading"><div><span className="eyebrow">MB ÓPTICA</span><h1>Receitas ópticas</h1><p>Cadastro e histórico de receitas vinculadas aos clientes.</p></div><div style={{display:"flex",gap:8}}><button className="secondary" onClick={printManualOS}>🖨 O.S. manual</button><button className="primary" onClick={()=>setOpen(true)}>+ Nova receita</button></div></div>
  {message&&<div className="panel" style={{padding:12,marginBottom:12}}>{message}</div>}
  <div className="toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar cliente ou profissional..."/><button className="secondary" onClick={load}>Atualizar</button></div>
  {open&&<div className="panel" style={{padding:20,marginBottom:12}}>
   <div className="panel-heading" style={{padding:0,marginBottom:15}}><h2>Nova receita</h2><button className="secondary" onClick={()=>setOpen(false)}>Fechar</button></div>
   <form onSubmit={save}>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
     <div style={{display:"grid",gridTemplateColumns:"1.2fr 1fr 1fr",gap:8}}>
      <select required value={form.customerId} onChange={e=>setForm({...form,customerId:e.target.value})}><option value="">Selecione o cliente</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.cpfCnpj?" — "+c.cpfCnpj:""}</option>)}</select>
      <input placeholder="Profissional" value={form.professional} onChange={e=>setForm({...form,professional:e.target.value})}/>
      <label style={{display:"grid",gap:4,fontSize:10,color:"var(--muted)"}}>Validade da receita<input type="date" value={form.validUntil} onChange={e=>setForm({...form,validUntil:e.target.value})}/></label>
     </div>
     <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",fontSize:11,color:"var(--muted)"}}>Preencha os dois olhos e utilize a O.S. para o atendimento.</div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
     <div className="panel" style={{padding:14,border:"1px solid var(--line)"}}>
      <h3 style={{margin:"0 0 10px",textAlign:"center"}}>OE — Olho Esquerdo</h3>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
       {["oeSphere","oeCylinder","oeAxis","oeAdd","oePrism","oeBase","oeDnp","oeHeight"].map(k=><input key={k} placeholder={fieldLabels[k.replace("oe","").toLowerCase()]||k.replace("oe","")} value={(form as any)[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/>)}
      </div>
     </div>
     <div className="panel" style={{padding:14,border:"1px solid var(--line)"}}>
      <h3 style={{margin:"0 0 10px",textAlign:"center"}}>OD — Olho Direito</h3>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
       {["odSphere","odCylinder","odAxis","odAdd","odPrism","odBase","odDnp","odHeight"].map(k=><input key={k} placeholder={fieldLabels[k.replace("od","").toLowerCase()]||k.replace("od","")} value={(form as any)[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/>)}
      </div>
     </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:8,marginTop:10}}>
     <input placeholder="DP Total (Distância pupilar)" value={form.pdTotal} onChange={e=>setForm({...form,pdTotal:e.target.value})}/>
     <input placeholder="Observações" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/>
    </div>
    <button className="primary" type="submit" style={{marginTop:10}}>Registrar receita</button>
   </form>
  </div>}
  <div className="panel"><div className="table">
   <div className="row header"><span>Cliente</span><span>Data</span><span>Profissional</span><span>OD</span><span>OE</span><span>Validade</span><span>Ações</span></div>
   {loading?<div style={{padding:20}}>Carregando...</div>:filtered.map(r=>{const c=customers.find(x=>x.id===r.customerId)||r.customer;return <div className="row" key={r.id}>
    <strong>{c?.name||"Cliente"}</strong><span>{r.date?new Date(r.date).toLocaleDateString("pt-BR"):"—"}</span><span>{r.professional||"—"}</span>
    <span>{r.odSphere??"—"} / {r.odCylinder??"—"} / {r.odAxis??"—"}</span><span>{r.oeSphere??"—"} / {r.oeCylinder??"—"} / {r.oeAxis??"—"}</span><span>{r.validUntil?new Date(r.validUntil).toLocaleDateString("pt-BR"):"—"}</span>
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}><button className="secondary" onClick={()=>printOS(r,c)}>Imprimir O.S.</button><button className="secondary" onClick={()=>deletePrescription(r)} style={{color:"#b42318"}}>Excluir</button></div>
   </div>})}
   {!loading&&!filtered.length&&<div style={{padding:20,textAlign:"center",color:"var(--muted)"}}>Nenhuma receita encontrada.</div>}
  </div></div>
 </section>
}
