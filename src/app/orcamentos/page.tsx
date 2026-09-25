"use client";
import {useEffect,useMemo,useState} from "react";

type Customer={id:string;name:string;cpfCnpj?:string|null;phone?:string|null};
type Prescription={id:string;date:string;professional?:string|null;validUntil?:string|null};
type Product={id:string;code:string;description:string;salePrice:number|string;stock:number};
type Item={productId:string;description:string;kind:string;eye:string;quantity:string;unitPrice:string};
type Quote=any;

const emptyItem=():Item=>({productId:"",description:"",kind:"",eye:"",quantity:"1",unitPrice:"0"});
const money=(v:any)=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const dateBR=(v:any)=>v?new Date(v).toLocaleDateString("pt-BR"):"—";
const esc=(v:any)=>String(v??"").replace(/[&<>"]/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[x]!));

function printQuote(q:Quote){
 const win=window.open("","_blank","width=900,height=1000");
 if(!win){alert("Permita pop-ups para imprimir o orçamento.");return;}
 const items=q.items||[];
 const rows=items.map((i:any)=>"<tr><td>"+esc(i.description)+"</td><td>"+esc(i.kind||"—")+"</td><td>"+i.quantity+"</td><td>"+money(i.unitPrice)+"</td><td>"+money(Number(i.quantity)*Number(i.unitPrice))+"</td></tr>").join("");
 const subtotal=items.reduce((s:number,i:any)=>s+Number(i.quantity)*Number(i.unitPrice),0);
 const no="ORC-"+String(q.number).padStart(6,"0");
 win.document.write("<!doctype html><html><head><title>Orçamento "+no+" - MB Óptica</title><style>"+
 "@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:12px}"+
 ".top{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px}.brand{font-size:22px;font-weight:700}.title{font-size:18px;font-weight:700}"+
 ".meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;border:1px solid #bbb;padding:10px;margin-bottom:14px}.section{border:1px solid #999;padding:10px;margin-bottom:12px}.section h2{font-size:13px;margin:0 0 8px}"+
 "table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:7px;text-align:left}th{font-size:10px;text-transform:uppercase}.total{text-align:right;margin-top:7px;font-weight:700}.grand{font-size:18px}.note{min-height:55px;border:1px solid #aaa;padding:8px}.footer{text-align:center;font-size:9px;margin-top:20px;color:#555}"+
 "</style></head><body>"+
 "<div class='top'><div><div class='brand'>MB ÓPTICA</div><div>Gestão inteligente</div></div><div class='title'>ORÇAMENTO "+no+"</div></div>"+
 "<div class='meta'><div><b>Cliente:</b> "+esc(q.customer?.name)+"</div><div><b>CPF/CNPJ:</b> "+esc(q.customer?.cpfCnpj||"—")+"</div><div><b>Telefone:</b> "+esc(q.customer?.phone||"—")+"</div><div><b>Data:</b> "+dateBR(q.createdAt)+"</div><div><b>Vendedor:</b> "+esc(q.seller?.name||"—")+"</div><div><b>Validade:</b> "+dateBR(q.validUntil)+"</div></div>"+
 "<div class='section'><h2>Itens do orçamento</h2><table><tr><th>Descrição</th><th>Tipo</th><th>Qtd.</th><th>Valor unit.</th><th>Total</th></tr>"+rows+"</table>"+
 "<div class='total'>Subtotal: "+money(subtotal)+"</div><div class='total'>Desconto: - "+money(q.discount)+"</div><div class='total'>Acréscimo: + "+money(q.surcharge)+"</div><div class='total grand'>TOTAL: "+money(q.total)+"</div></div>"+
 "<div class='section'><h2>Condições</h2><div class='meta'><div><b>Pagamento:</b> "+esc(q.paymentMethod||"A combinar")+"</div><div><b>Parcelas:</b> "+esc(q.installments||"—")+"</div><div><b>Entrada:</b> "+money(q.entryAmount)+"</div><div><b>Entrega prevista:</b> "+dateBR(q.deliveryDate)+"</div></div></div>"+
 "<div class='section'><h2>Observações</h2><div class='note'>"+esc(q.notes||"")+"</div></div>"+
 "<div class='footer'>Orçamento sujeito às condições informadas no momento da emissão. Documento comercial — MB Óptica.</div>"+
 "<script>window.onload=function(){window.focus();window.print();}</script></body></html>");
 win.document.close();
}

export default function Orcamentos(){
 const [customers,setCustomers]=useState<Customer[]>([]);
 const [products,setProducts]=useState<Product[]>([]);
 const [prescriptions,setPrescriptions]=useState<Prescription[]>([]);
 const [rows,setRows]=useState<Quote[]>([]);
 const [open,setOpen]=useState(false),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [message,setMessage]=useState(""),[search,setSearch]=useState(""),[status,setStatus]=useState("TODOS");
 const [customerId,setCustomerId]=useState(""),[prescriptionId,setPrescriptionId]=useState("");
 const [validUntil,setValidUntil]=useState(""),[deliveryDate,setDeliveryDate]=useState("");
 const [discount,setDiscount]=useState("0"),[surcharge,setSurcharge]=useState("0"),[entryAmount,setEntryAmount]=useState("0");
 const [paymentMethod,setPaymentMethod]=useState(""),[installments,setInstallments]=useState(""),[notes,setNotes]=useState("");
 const [items,setItems]=useState<Item[]>([emptyItem()]);

 const load=async()=>{
  setLoading(true);
  try{
   const [qr,cr,pr]=await Promise.all([fetch("/api/quotes",{cache:"no-store"}),fetch("/api/customers",{cache:"no-store"}),fetch("/api/products",{cache:"no-store"})]);
   const [qd,cd,pd]=await Promise.all([qr.json(),cr.json(),pr.json()]);
   if(!qr.ok)throw new Error(qd.error||"Não foi possível carregar os orçamentos.");
   if(!cr.ok)throw new Error(cd.error||"Não foi possível carregar os clientes.");
   setRows(qd);setCustomers(cd);setProducts(pd);
  }catch(e){setMessage(e instanceof Error?e.message:"Erro ao carregar.");}
  finally{setLoading(false);}
 };
 useEffect(()=>{load()},[]);
 useEffect(()=>{
  if(!customerId){setPrescriptions([]);setPrescriptionId("");return;}
  fetch("/api/prescriptions?customerId="+encodeURIComponent(customerId),{cache:"no-store"}).then(r=>r.json()).then(d=>setPrescriptions(Array.isArray(d)?d:[])).catch(()=>setPrescriptions([]));
 },[customerId]);

 const subtotal=useMemo(()=>items.reduce((s,i)=>s+(Number(i.quantity)||0)*(Number(i.unitPrice)||0),0),[items]);
 const total=Math.max(0,subtotal-(Number(discount)||0)+(Number(surcharge)||0));
 const reset=()=>{setCustomerId("");setPrescriptionId("");setValidUntil("");setDeliveryDate("");setDiscount("0");setSurcharge("0");setEntryAmount("0");setPaymentMethod("");setInstallments("");setNotes("");setItems([emptyItem()]);setOpen(false)};
 const updateItem=(idx:number,patch:Partial<Item>)=>setItems(items.map((x,i)=>i===idx?{...x,...patch}:x));
 const chooseProduct=(idx:number,id:string)=>{
  const p=products.find(x=>x.id===id);
  updateItem(idx,{productId:id,description:p?.description||"",unitPrice:p?String(Number(p.salePrice)):items[idx].unitPrice});
 };
 const save=async(e:React.FormEvent)=>{
  e.preventDefault();setSaving(true);setMessage("");
  try{
   const r=await fetch("/api/quotes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    customerId,prescriptionId:prescriptionId||null,validUntil:validUntil||null,deliveryDate:deliveryDate||null,
    discount,surcharge,entryAmount,paymentMethod:paymentMethod||null,installments:installments||null,notes:notes||null,
    items:items.map(i=>({...i,productId:i.productId||null}))
   })});
   const d=await r.json();if(!r.ok)throw new Error(d.error||"Não foi possível criar o orçamento.");
   const number="ORC-"+String(d.number).padStart(6,"0");
   reset();setMessage(number+" criado com sucesso.");await load();
  }catch(e){setMessage(e instanceof Error?e.message:"Erro ao criar orçamento.");}
  finally{setSaving(false);}
 };
 const changeStatus=async(id:string,next:string)=>{
  const r=await fetch("/api/quotes",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status:next})});
  const d=await r.json();if(!r.ok){setMessage(d.error||"Não foi possível atualizar.");return}
  setMessage("Status atualizado.");load();
 };
 const convert=async(id:string)=>{
  if(!confirm("Converter este orçamento em O.S.? Os itens, receita e valores serão levados para o pedido."))return;
  const r=await fetch("/api/quotes/"+id+"/convert",{method:"POST"});const d=await r.json();
  if(!r.ok){setMessage(d.error||"Não foi possível converter.");return}
  setMessage("O.S. PED-"+String(d.number).padStart(6,"0")+" criada a partir do orçamento.");load();
 };
 const filtered=rows.filter(q=>{
  const text=((q.customer?.name||"")+" "+(q.customer?.cpfCnpj||"")+" "+String(q.number)).toLowerCase();
  return text.includes(search.toLowerCase())&&(status==="TODOS"||q.status===status);
 });
 return <section className="page">
  <div className="page-heading"><div><span className="eyebrow">MB ÓPTICA</span><h1>Orçamentos</h1><p>Monte propostas comerciais, vincule a receita e transforme o orçamento em O.S. sem redigitação.</p></div><button className="primary" onClick={()=>setOpen(true)}>+ Novo orçamento</button></div>
  {message&&<div className="panel" style={{padding:12,marginBottom:12}}>{message}</div>}
  {open&&<div className="panel" style={{padding:20,marginBottom:14}}>
   <div className="panel-heading" style={{padding:0,marginBottom:15}}><div><h2>Novo orçamento</h2><p>Cliente → receita → itens → condições comerciais.</p></div><button className="secondary" onClick={reset}>Fechar</button></div>
   <form onSubmit={save}>
    <div className="grid-two" style={{marginBottom:12}}>
     <div><label>Cliente</label><select required value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Selecione o cliente</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.cpfCnpj?" — "+c.cpfCnpj:""}</option>)}</select></div>
     <div><label>Receita vinculada</label><select value={prescriptionId} onChange={e=>setPrescriptionId(e.target.value)} disabled={!customerId}><option value="">Sem receita</option>{prescriptions.map(p=><option key={p.id} value={p.id}>{dateBR(p.date)}{p.professional?" — "+p.professional:""}</option>)}</select></div>
    </div>
    <div className="grid-two" style={{marginBottom:12}}>
     <div><label>Validade do orçamento</label><input type="date" value={validUntil} onChange={e=>setValidUntil(e.target.value)}/></div>
     <div><label>Previsão de entrega</label><input type="date" value={deliveryDate} onChange={e=>setDeliveryDate(e.target.value)}/></div>
    </div>
    <div className="panel" style={{padding:14,border:"1px solid var(--line)",marginBottom:12}}>
     <div className="panel-heading" style={{padding:0,marginBottom:10}}><div><h3 style={{margin:0}}>Itens do orçamento</h3><p style={{margin:0}}>Armação, lentes, tratamentos e serviços.</p></div><button type="button" className="secondary" onClick={()=>setItems([...items,emptyItem()])}>+ Adicionar item</button></div>
     {items.map((item,idx)=><div key={idx} style={{display:"grid",gridTemplateColumns:"1.15fr 1.5fr .75fr .65fr .85fr auto",gap:7,marginBottom:7,alignItems:"end"}}>
      <div><label>Produto</label><select value={item.productId} onChange={e=>chooseProduct(idx,e.target.value)}><option value="">Manual</option>{products.map(p=><option key={p.id} value={p.id}>{p.description} — {money(p.salePrice)} ({p.stock} estoque)</option>)}</select></div>
      <div><label>Descrição</label><input required value={item.description} onChange={e=>updateItem(idx,{description:e.target.value})} placeholder="Ex.: Lente multifocal antirreflexo"/></div>
      <div><label>Tipo</label><select value={item.kind} onChange={e=>updateItem(idx,{kind:e.target.value})}><option value="">Outro</option><option>ARMAÇÃO</option><option>LENTE</option><option>TRATAMENTO</option><option>SERVIÇO</option></select></div>
      <div><label>Qtd.</label><input type="number" min="0.001" step="0.001" value={item.quantity} onChange={e=>updateItem(idx,{quantity:e.target.value})}/></div>
      <div><label>Unitário</label><input type="number" min="0" step="0.01" value={item.unitPrice} onChange={e=>updateItem(idx,{unitPrice:e.target.value})}/></div>
      <button type="button" className="secondary" onClick={()=>setItems(items.length===1?items:items.filter((_,i)=>i!==idx))}>×</button>
     </div>)}
    </div>
    <div className="grid-two" style={{alignItems:"start"}}>
     <div className="panel" style={{padding:14,border:"1px solid var(--line)"}}>
      <h3 style={{marginTop:0}}>Condições comerciais</h3>
      <div className="grid-two"><div><label>Pagamento</label><select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="">A combinar</option><option>PIX</option><option>DINHEIRO</option><option>DÉBITO</option><option>CRÉDITO</option><option>PARCELADO</option><option>CREDIÁRIO</option></select></div><div><label>Parcelas</label><input type="number" min="1" value={installments} onChange={e=>setInstallments(e.target.value)} placeholder="—"/></div></div>
      <div style={{marginTop:8}}><label>Entrada</label><input type="number" min="0" step="0.01" value={entryAmount} onChange={e=>setEntryAmount(e.target.value)}/></div>
      <div style={{marginTop:8}}><label>Observações</label><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3}/></div>
     </div>
     <div className="panel" style={{padding:14,border:"1px solid var(--line)"}}>
      <h3 style={{marginTop:0}}>Resumo financeiro</h3><div style={{display:"grid",gap:7}}>
       <div>Subtotal <strong style={{float:"right"}}>{money(subtotal)}</strong></div>
       <div><label>Desconto</label><input type="number" min="0" step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)}/></div>
       <div><label>Acréscimo</label><input type="number" min="0" step="0.01" value={surcharge} onChange={e=>setSurcharge(e.target.value)}/></div>
       <hr/><div style={{fontSize:20}}><b>TOTAL</b><strong style={{float:"right"}}>{money(total)}</strong></div>
      </div>
     </div>
    </div>
    <button className="primary" disabled={saving||!customerId||items.some(i=>!i.description.trim())} style={{marginTop:12}}>{saving?"Salvando...":"Criar orçamento"}</button>
   </form>
  </div>}
  <div className="toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar cliente ou nº do orçamento..."/><select value={status} onChange={e=>setStatus(e.target.value)}><option>TODOS</option><option>ABERTO</option><option>ENVIADO</option><option>APROVADO</option><option>RECUSADO</option><option>EXPIRADO</option><option>CONVERTIDO</option><option>CANCELADO</option></select><button className="secondary" onClick={load}>Atualizar</button></div>
  <div className="panel"><div className="table">
   <div className="row header"><span>Orçamento</span><span>Cliente</span><span>Data</span><span>Validade</span><span>Total</span><span>Status</span><span>Ações</span></div>
   {loading?<div style={{padding:20}}>Carregando...</div>:filtered.map(q=><div className="row" key={q.id}>
    <strong>ORC-{String(q.number).padStart(6,"0")}</strong><span>{q.customer?.name||"—"}</span><span>{dateBR(q.createdAt)}</span><span>{dateBR(q.validUntil)}</span><strong>{money(q.total)}</strong><span>{q.status}</span>
    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}><button className="secondary" onClick={()=>printQuote(q)}>Imprimir</button>{q.status!=="CONVERTIDO"&&q.status!=="CANCELADO"&&<button className="secondary" onClick={()=>changeStatus(q.id,q.status==="ABERTO"?"APROVADO":"ABERTO")}>{q.status==="ABERTO"?"Aprovar":"Reabrir"}</button>}{q.status!=="CONVERTIDO"&&q.status!=="CANCELADO"&&<button className="primary" onClick={()=>convert(q.id)}>Converter em O.S.</button>}</div>
   </div>)}
   {!loading&&!filtered.length&&<div style={{padding:20,textAlign:"center",color:"var(--muted)"}}>Nenhum orçamento encontrado.</div>}
  </div></div>
 </section>;
}
