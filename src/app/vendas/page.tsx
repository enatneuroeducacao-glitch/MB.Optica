"use client";

import {useEffect,useMemo,useState} from "react";

type Customer={id:string;name:string;cpfCnpj?:string|null};
type Product={id:string;code:string;description:string;salePrice:number|string;cost:number|string};
type Order={id:string;number:number;customerId:string;total:number|string;status:string;items?:any[]};
type Method={id:string;name:string;isCash:boolean;active:boolean};
type Sale=any;

const money=(v:any)=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const dt=(v:any)=>v?new Date(v).toLocaleString("pt-BR"):"—";

export default function Vendas(){
 const [sales,setSales]=useState<Sale[]>([]),[customers,setCustomers]=useState<Customer[]>([]),[products,setProducts]=useState<Product[]>([]),[orders,setOrders]=useState<Order[]>([]),[methods,setMethods]=useState<Method[]>([]);
 const [user,setUser]=useState<any>(null),[cash,setCash]=useState<any>(null),[open,setOpen]=useState(false),[selected,setSelected]=useState<Sale|null>(null),[paying,setPaying]=useState<Sale|null>(null),[msg,setMsg]=useState(""),[search,setSearch]=useState(""),[filter,setFilter]=useState("TODAS");
 const [form,setForm]=useState({customerId:"",orderId:"",productId:"",quantity:"1",unitPrice:"",discount:"0",surcharge:"0",notes:"",paymentCondition:"AVISTA",paymentMethodId:"",installments:"2",entryAmount:"0",firstDueDate:new Date().toISOString().slice(0,10),pixPayload:""});
 const [pay,setPay]=useState({methodId:"",amount:"",reference:""}),[opening,setOpening]=useState(""),[move,setMove]=useState({kind:"SANGRIA",amount:"",description:""});

 const load=async()=>{
  const [s,c,p,o,m,u,cs]=await Promise.all([fetch("/api/sales",{cache:"no-store"}),fetch("/api/customers"),fetch("/api/products"),fetch("/api/orders"),fetch("/api/payment-methods"),fetch("/api/auth/me"),fetch("/api/cash/session")]);
  const [sd,cd,pd,od,md,ud,csd]=await Promise.all([s.json(),c.json(),p.json(),o.json(),m.json(),u.json(),cs.json()]);
  if(s.ok)setSales(Array.isArray(sd)?sd:[]);if(c.ok)setCustomers(Array.isArray(cd)?cd:[]);if(p.ok)setProducts(Array.isArray(pd)?pd:[]);if(o.ok)setOrders(Array.isArray(od)?od:[]);
  if(m.ok)setMethods(Array.isArray(md)?md.filter((x:any)=>x.active):[]);if(u.ok)setUser(ud.user||ud);if(cs.ok)setCash(csd);
 };
 useEffect(()=>{load()},[]);
 const product=products.find(p=>p.id===form.productId);
 const subtotal=Number(form.quantity||0)*Number(form.unitPrice||0);
 const total=Math.max(0,subtotal-Number(form.discount||0)+Number(form.surcharge||0));
 const orderChoices=useMemo(()=>orders.filter(o=>o.customerId===form.customerId&&!["CANCELADO","DEVOLVIDO"].includes(o.status)&&!sales.some(s=>s.orderId===o.id)),[orders,form.customerId,sales]);
 const stats=useMemo(()=>{const active=sales.filter(s=>!s.canceled);const gross=active.reduce((a,s)=>a+Number(s.total),0);const paid=active.reduce((a,s)=>a+Number(s.payments?.filter((p:any)=>!p.reversedAt).reduce((x:number,p:any)=>x+Number(p.amount),0)||0),0);const today=new Date().toDateString();return {count:active.length,today:active.filter(s=>new Date(s.createdAt).toDateString()===today).reduce((a,s)=>a+Number(s.total),0),paid,pending:Math.max(0,gross-paid)}},[sales]);
 const filtered=sales.filter(s=>{const paid=Number(s.payments?.filter((p:any)=>!p.reversedAt).reduce((a:number,p:any)=>a+Number(p.amount),0)||0);const q=(s.number+" "+(s.customer?.name||"")+" "+(s.customer?.cpfCnpj||"")).toLowerCase().includes(search.toLowerCase());const f=filter==="TODAS"||(filter==="ABERTAS"&&!s.canceled&&paid<Number(s.total))||(filter==="PAGAS"&&!s.canceled&&paid>=Number(s.total))||(filter==="CANCELADAS"&&s.canceled);return q&&f});
 const remaining=paying?Math.max(0,Number(paying.total)-Number(paying.payments?.filter((p:any)=>!p.reversedAt).reduce((a:number,p:any)=>a+Number(p.amount),0)||0)):0;

 const submit=async(e:React.FormEvent)=>{
e.preventDefault();setMsg("");
if(!user?.id){setMsg("Usuário da sessão não identificado.");return}
if(!form.customerId||!form.productId){setMsg("Cliente e produto são obrigatórios.");return}
const installments=form.paymentCondition==="CARNÊ"?Math.max(1,Number(form.installments||1)):0;
if(form.paymentCondition==="CARNÊ"&&installments<2){setMsg("Use pelo menos 2 parcelas para o carnê.");return}
const r=await fetch("/api/sales",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({customerId:form.customerId,sellerId:user.id,orderId:form.orderId||undefined,discount:Number(form.discount),surcharge:Number(form.surcharge),notes:form.notes,paymentCondition:form.paymentCondition,installments,paymentMethodId:form.paymentMethodId||undefined,entryAmount:Number(form.entryAmount||0),pixPayload:form.pixPayload||undefined,firstDueDate:form.firstDueDate,items:[{productId:form.productId,description:product?.description||"Item",quantity:Number(form.quantity),unitPrice:Number(form.unitPrice||product?.salePrice||0),unitCost:Number(product?.cost||0)}],stock:[{productId:form.productId,quantity:Number(form.quantity)}]})});
const d=await r.json();if(!r.ok){setMsg((d.error||"Erro")+(d.detail?" — "+d.detail:""));return}
if(form.paymentCondition!=="CARNÊ"&&form.paymentMethodId){
const pr=await fetch("/api/payments",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({saleId:d.id,methodId:form.paymentMethodId,amount:total,reference:form.pixPayload||undefined})});
const pd=await pr.json();if(!pr.ok)setMsg("Venda criada, mas o recebimento não foi registrado: "+(pd.detail||pd.error||"erro"));else setMsg("Venda #"+d.number+" registrada e recebida.");
}else setMsg("Venda #"+d.number+" registrada.");
setOpen(false);
setForm({customerId:"",orderId:"",productId:"",quantity:"1",unitPrice:"",discount:"0",surcharge:"0",notes:"",paymentCondition:"AVISTA",paymentMethodId:"",installments:"2",entryAmount:"0",firstDueDate:new Date().toISOString().slice(0,10),pixPayload:""});
await load();
}; const registerPayment=async(e:React.FormEvent)=>{e.preventDefault();if(!paying)return;const r=await fetch("/api/payments",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({saleId:paying.id,methodId:pay.methodId,amount:Number(pay.amount),reference:pay.reference||undefined})});const d=await r.json();if(!r.ok){setMsg((d.error||"Erro")+(d.detail?" — "+d.detail:""));return}setMsg("Pagamento registrado.");setPaying(null);setPay({methodId:"",amount:"",reference:""});await load()};
 const openCash=async()=>{const r=await fetch("/api/cash/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({openingCash:Number(opening||0)})});const d=await r.json();if(!r.ok){setMsg((d.error||"Erro")+(d.detail?" — "+d.detail:""));return}setOpening("");setMsg("Caixa aberto.");await load()};
 const cashMove=async(e:React.FormEvent)=>{e.preventDefault();const r=await fetch("/api/cash/movement",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(move)});const d=await r.json();if(!r.ok){setMsg((d.error||"Erro")+(d.detail?" — "+d.detail:""));return}setMove({kind:"SANGRIA",amount:"",description:""});setMsg("Movimentação registrada.");await load()};
 const chooseOrder=(id:string)=>{const o=orders.find(x=>x.id===id);if(!o)return;const i=o.items?.find((x:any)=>x.productId);const p=products.find(x=>x.id===i?.productId);setForm({...form,orderId:id,customerId:o.customerId,productId:i?.productId||"",quantity:String(i?.quantity||1),unitPrice:String(i?.unitPrice||p?.salePrice||"")})}; const printSale=(kind:"CUPOM"|"CARNE"|"PROMISSORIA"|"FISCAL")=>{
  if(!selected)return;
  const f=selected.fiscalDocument;
  if(kind==="FISCAL"&&!f){setMsg("Esta venda ainda não possui documento fiscal autorizado.");return}
  const customer=selected.customer?.name||"Cliente";
  const items=(selected.items||[]).map((i:any)=>"<div class=\"row\"><span>"+i.description+" × "+Number(i.quantity)+"</span><b>"+money(i.total)+"</b></div>").join("");
  const accounts=(selected.accounts||[]).map((a:any)=>"<div class=\"row\"><span>"+a.description+"<br>Vencimento: "+dt(a.dueDate)+"</span><b>"+money(a.amount)+"</b></div>").join("");
  const qr=selected.pixPayload?"<div class=\"center\"><img class=\"qr\" src=\"https://quickchart.io/qr?size=220&text="+encodeURIComponent(selected.pixPayload)+"\"><p>PIX — pagamento</p></div>":"";
  const title=kind==="CUPOM"?"Cupom não fiscal":kind==="CARNE"?"Carnê":kind==="PROMISSORIA"?"Promissória":"Documento fiscal";
  const extra=kind==="PROMISSORIA"?"<div class=\"signature\"><div>Credor — MB Óptica</div><div>Devedor — "+customer+"</div></div>":kind==="CARNE"?qr:kind==="FISCAL"?"<div class=\"box\">Chave: "+(f?.accessKey||"—")+"<br>Número/Série: "+(f?.number||"—")+" / "+(f?.series||"—")+"</div>":"";
  const html="<html><head><title>"+title+"</title><style>body{font-family:Arial;margin:24px;color:#172033}.row{display:flex;justify-content:space-between;border-bottom:1px solid #ddd;padding:8px}.box{border:1px solid #ddd;padding:12px;margin:12px 0}.center{text-align:center}.qr{width:150px}.signature{margin-top:70px;display:grid;grid-template-columns:1fr 1fr;gap:50px}.signature div{border-top:1px solid #222;text-align:center;padding-top:5px}</style></head><body><h1>MB Óptica</h1><p>"+title+"</p><div class=\"box\"><b>Venda #"+selected.number+"</b><p>Cliente: "+customer+"</p><p>"+dt(selected.createdAt)+"</p></div><h2>Itens</h2>"+items+"<div class=\"box\"><div class=\"row\"><span>Total</span><b>"+money(selected.total)+"</b></div></div>"+(selected.accounts?.length?"<h2>Parcelamento</h2>"+accounts:"")+extra+"</body></html>";
  const w=window.open("","_blank","width=850,height=900");if(!w){setMsg("O navegador bloqueou a janela de impressão.");return}w.document.write(html);w.document.close();w.focus();setTimeout(()=>w.print(),250);
 };

 return <section className="page sales-page">
  <div className="page-heading"><div><span className="eyebrow">OPERAÇÃO • PDV</span><h1>Vendas</h1><p>Venda óptica conectada a cliente, pedido, estoque, caixa, pagamentos e rastreabilidade.</p></div><button className="primary" onClick={()=>setOpen(true)}>+ Nova venda</button></div>
  {msg&&<div className="panel sales-message">{msg}</div>}
  <div className="stats sales-stats"><div className="stat-card"><span>VENDAS</span><strong>{stats.count}</strong><small>histórico operacional</small></div><div className="stat-card"><span>VENDAS HOJE</span><strong>{money(stats.today)}</strong><small>valor bruto</small></div><div className="stat-card"><span>RECEBIDO</span><strong>{money(stats.paid)}</strong><small>pagamentos</small></div><div className="stat-card"><span>A RECEBER</span><strong>{money(stats.pending)}</strong><small>saldo aberto</small></div></div>

  <div className="sales-command-grid">
   <div className="panel sales-cash"><div className="panel-heading"><div><h2>Caixa operacional</h2><p>Controle rápido do caixa do PDV.</p></div><span className={cash?"sales-online":"sales-offline"}>{cash?"CAIXA ABERTO":"CAIXA FECHADO"}</span></div>
    {cash?<><div className="cash-state"><div><b>Abertura</b><small>{money(cash.openingCash)} · {dt(cash.openedAt)}</small></div><div><b>Movimentos</b><small>{cash.movements?.length||0} lançamentos</small></div></div><form onSubmit={cashMove} className="sales-cash-move"><select value={move.kind} onChange={e=>setMove({...move,kind:e.target.value})}><option value="SANGRIA">Sangria</option><option value="REFORCO">Reforço</option><option value="SAIDA">Saída</option><option value="ENTRADA">Entrada</option></select><input type="number" min="0.01" step="0.01" placeholder="Valor" value={move.amount} onChange={e=>setMove({...move,amount:e.target.value})}/><input placeholder="Descrição" value={move.description} onChange={e=>setMove({...move,description:e.target.value})}/><button className="secondary">Lançar</button></form></>:<div className="sales-cash-open"><input type="number" min="0" step="0.01" placeholder="Valor de abertura" value={opening} onChange={e=>setOpening(e.target.value)}/><button className="primary" onClick={openCash}>Abrir caixa</button></div>}
   </div>
   <div className="panel sales-insight"><div className="panel-heading"><div><h2>Inteligência da venda</h2><p>Recursos próprios do MB Óptica.</p></div></div><div className="sales-insight-list"><div><b>Venda sem redigitação</b><span>Pedido óptico preenche cliente e item.</span></div><div><b>Rastreabilidade</b><span>Venda → estoque → pagamento → caixa.</span></div><div><b>Visão financeira</b><span>Recebido e saldo a receber em tempo real.</span></div><div><b>Auditoria</b><span>Eventos são registrados no histórico do sistema.</span></div></div></div>
  </div>

  {open&&<div className="sales-pdv-overlay" role="dialog" aria-modal="true" aria-label="Nova venda" onMouseDown={e=>{if(e.currentTarget===e.target)setOpen(false)}}><div className="panel sales-form sales-pdv-modal"><div className="panel-heading"><div><span className="eyebrow">PDV</span><h2>Nova venda</h2><p>Venda avulsa ou vinculada a pedido óptico.</p></div><button className="secondary" type="button" onClick={()=>setOpen(false)}>Fechar</button></div>
   <form onSubmit={submit}><div className="sales-form-grid">
    <label>Cliente<select required value={form.customerId} onChange={e=>setForm({...form,customerId:e.target.value,orderId:""})}><option value="">Selecione</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.cpfCnpj?" — "+c.cpfCnpj:""}</option>)}</select></label>
    <label>Pedido óptico<select value={form.orderId} onChange={e=>chooseOrder(e.target.value)}><option value="">Venda avulsa</option>{orderChoices.map(o=><option key={o.id} value={o.id}>#{o.number} · {o.status} · {money(o.total)}</option>)}</select></label>
    <label>Produto / serviço<select required value={form.productId} onChange={e=>{const p=products.find(x=>x.id===e.target.value);setForm({...form,productId:e.target.value,unitPrice:p?String(p.salePrice):""})}}><option value="">Selecione</option>{products.map(p=><option key={p.id} value={p.id}>{p.code} · {p.description} · {money(p.salePrice)}</option>)}</select></label>
    <label>Quantidade<input required type="number" min="0.001" step="0.001" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label><label>Preço unitário<input required type="number" min="0" step="0.01" value={form.unitPrice} onChange={e=>setForm({...form,unitPrice:e.target.value})}/></label><label>Desconto<input type="number" min="0" step="0.01" value={form.discount} onChange={e=>setForm({...form,discount:e.target.value})}/></label><label>Acréscimo<input type="number" min="0" step="0.01" value={form.surcharge} onChange={e=>setForm({...form,surcharge:e.target.value})}/></label><div className="sales-total-box"><span>Total</span><strong>{money(total)}</strong></div>
   <div className="sales-payment-box">
    <div className="sales-payment-title"><b>Condição de pagamento</b><span>Escolha como esta venda será recebida.</span></div>
    <div className="sales-form-grid">
     <label>Forma
      <select value={form.paymentCondition} onChange={e=>setForm({...form,paymentCondition:e.target.value})}>
       <option value="AVISTA">À vista</option><option value="PIX">PIX</option><option value="CARTAO">Cartão</option><option value="CARNÊ">Crediário / Carnê</option>
      </select>
     </label>
     <label>Meio de recebimento
      <select value={form.paymentMethodId} onChange={e=>setForm({...form,paymentMethodId:e.target.value})}>
       <option value="">Não receber agora</option>{methods.map(m=><option key={m.id} value={m.id}>{m.name}{m.isCash?" · caixa":""}</option>)}
      </select>
     </label>
     {form.paymentCondition==="CARNÊ"&&<><label>Parcelas
       <select value={form.installments} onChange={e=>setForm({...form,installments:e.target.value})}>{Array.from({length:24},(_,i)=><option key={i+1} value={i+1}>{i+1}x</option>)}</select>
      </label><label>Entrada
       <input type="number" min="0" step="0.01" max={total} value={form.entryAmount} onChange={e=>setForm({...form,entryAmount:e.target.value})}/>
      </label><label>1º vencimento
       <input type="date" value={form.firstDueDate} onChange={e=>setForm({...form,firstDueDate:e.target.value})}/>
      </label></>}
     {(form.paymentCondition==="PIX"||form.pixPayload)&&<label className="sales-wide">PIX copia e cola
       <textarea rows={2} value={form.pixPayload} onChange={e=>setForm({...form,pixPayload:e.target.value})} placeholder="Cole aqui o código PIX para gerar o QR na impressão."/>
      </label>}
    </div>
    <div className="sales-payment-shortcuts"><span>✓ PIX</span><span>✓ Débito</span><span>✓ Crédito</span><span>✓ Dinheiro</span><span>✓ Crediário</span><span>✓ Parcelamento</span></div>
   </div>
   </div><label className="sales-wide">Observações<textarea rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Entrega, garantia, atendimento..."/></label><div className="sales-actions"><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancelar</button><button className="primary">Finalizar venda</button></div></form>
  </div></div>}

  <div className="toolbar sales-toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar venda, cliente ou CPF/CNPJ..."/><select value={filter} onChange={e=>setFilter(e.target.value)}><option>TODAS</option><option>ABERTAS</option><option>PAGAS</option><option>CANCELADAS</option></select></div>
  <div className="panel"><div className="panel-heading"><div><h2>Histórico de vendas</h2><p>{filtered.length} venda(s) · últimos 100 registros</p></div></div><div className="table sales-table"><div className="row header"><span>Venda</span><span>Cliente</span><span>Itens</span><span>Total</span><span>Pago</span><span>Status</span></div>
   {filtered.map(s=>{const paid=Number(s.payments?.filter((p:any)=>!p.reversedAt).reduce((a:number,p:any)=>a+Number(p.amount),0)||0);const status=s.canceled?"CANCELADA":paid>=Number(s.total)?"PAGA":paid?"PARCIAL":"ABERTA";return <div className="row sales-row" key={s.id} onClick={()=>setSelected(s)}><strong>#{s.number}</strong><span>{s.customer?.name||"—"}</span><span>{s.items?.length||0}</span><span>{money(s.total)}</span><span>{money(paid)}</span><span className={"sales-status "+status.toLowerCase()}>{status}</span></div>})}
   {!filtered.length&&<div style={{padding:24,textAlign:"center",color:"var(--muted)"}}>Nenhuma venda encontrada.</div>}</div></div>

  {selected&&<div className="panel sales-detail"><div className="panel-heading"><div><span className="eyebrow">VENDA #{selected.number}</span><h2>{selected.customer?.name||"Venda"}</h2><p>{dt(selected.createdAt)} · Vendedor: {selected.seller?.name||"—"}</p></div><div className="sales-actions"><button className="secondary" onClick={()=>setPaying(selected)}>Receber pagamento</button><button className="secondary" onClick={()=>setSelected(null)}>Fechar</button></div></div>
   <div className="sales-detail-grid"><div><h3>Itens</h3>{(selected.items||[]).map((i:any)=><div className="sales-line" key={i.id}><span>{i.description} × {Number(i.quantity)}</span><b>{money(i.total)}</b></div>)}</div><div><h3>Resumo</h3><div className="sales-line"><span>Subtotal</span><b>{money(selected.subtotal)}</b></div><div className="sales-line"><span>Desconto</span><b>- {money(selected.discount)}</b></div><div className="sales-line"><span>Acréscimo</span><b>+ {money(selected.surcharge)}</b></div><div className="sales-line total"><span>Total</span><b>{money(selected.total)}</b></div></div></div>
   <div className="sales-payment-history"><h3>Pagamentos</h3>{(selected.payments||[]).map((p:any)=><div className="sales-line" key={p.id}><span>{p.method?.name||"—"} · {dt(p.paidAt)}{p.reference?" · "+p.reference:""}</span><b>{money(p.amount)}</b></div>)}{!selected.payments?.length&&<span style={{color:"var(--muted)"}}>Nenhum pagamento registrado.</span>}</div>
  </div>}

  {paying&&<div className="sales-pdv-overlay" role="dialog" aria-modal="true" aria-label={`Receber venda #${paying.number}`} onMouseDown={e=>{if(e.currentTarget===e.target)setPaying(null)}}><div className="panel sales-form sales-pdv-modal"><div className="panel-heading"><div><span className="eyebrow">RECEBIMENTO</span><h2>Receber venda #{paying.number}</h2><p>Saldo restante: <b>{money(remaining)}</b></p></div><button className="secondary" type="button" onClick={()=>setPaying(null)}>Fechar</button></div><form onSubmit={registerPayment}><div className="sales-form-grid"><label>Meio de pagamento<select required value={pay.methodId} onChange={e=>setPay({...pay,methodId:e.target.value})}><option value="">Selecione</option>{methods.map(m=><option key={m.id} value={m.id}>{m.name}{m.isCash?" · caixa":""}</option>)}</select></label><label>Valor<input required type="number" min="0.01" max={remaining} step="0.01" value={pay.amount||String(remaining)} onChange={e=>setPay({...pay,amount:e.target.value})}/></label><label>Referência<input value={pay.reference} onChange={e=>setPay({...pay,reference:e.target.value})} placeholder="NSU, autorização, comprovante..."/></label></div><div className="sales-actions"><button className="primary">Registrar pagamento</button></div></form></div></div>}
 </section>
}