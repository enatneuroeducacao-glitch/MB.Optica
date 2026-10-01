"use client";

import {useEffect,useMemo,useState} from "react";
import {useRealtimeRefresh} from "@/lib/use-realtime-refresh";

type Product={id:string;code:string;barcode?:string|null;description:string;unit:string;cost:number;stock:number;minimumStock:number;stockControlled?:boolean;lowStock?:boolean;critical?:boolean};
type Movement=any;

const empty={productId:"",quantity:"",cost:"",code:"",expiresAt:"",reason:"",entry:""};

const money=(v:any)=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const dateBR=(v:any)=>v?new Date(v).toLocaleDateString("pt-BR"):"—";
const dateTimeBR=(v:any)=>v?new Date(v).toLocaleString("pt-BR"):"—";

export default function Estoque(){
 const [rows,setRows]=useState<Product[]>([]),[products,setProducts]=useState<any[]>([]),[movements,setMovements]=useState<Movement[]>([]);
 const [mode,setMode]=useState<"entry"|"exit"|"adjustment"|"devolution"|"inventory"|null>("entry"),[form,setForm]=useState(empty),[msg,setMsg]=useState("");
 const [inventory,setInventory]=useState<Record<string,string>>({});
 const [search,setSearch]=useState(""),[statusFilter,setStatusFilter]=useState("TODOS"),[movementFilter,setMovementFilter]=useState("TODOS"),[showMovements,setShowMovements]=useState(false);

 const load=async()=>{
  const [s,p,m]=await Promise.all([fetch("/api/stock"),fetch("/api/products"),fetch("/api/stock/movements")]);
  const [sd,pd,md]=await Promise.all([s.json(),p.json(),m.json()]);
  if(s.ok)setRows(Array.isArray(sd)?sd:[]);
  if(p.ok)setProducts(Array.isArray(pd)?pd:[]);
  if(m.ok)setMovements(Array.isArray(md)?md:[]);
  if(!p.ok)setMsg(pd.error||"Erro ao carregar produtos.");
 };
 useEffect(()=>{load()},[]);
 useRealtimeRefresh(load,15000);

 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();setMsg("");
  const endpoint=mode==="adjustment"?"adjustment":mode==="devolution"?"devolution":mode;
  const r=await fetch("/api/stock/"+endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...form,quantity:Number(form.quantity),cost:form.cost===""?undefined:Number(form.cost),direction:mode==="exit"||mode==="adjustment"||mode==="devolution"?(mode==="exit"?"SAIDA":form.reason?.startsWith("ENTRADA:")?"ENTRADA":"SAIDA"):undefined})});
  const d=await r.json();
  if(!r.ok){setMsg(d.error||"Não foi possível concluir a operação.");return}
  setMsg(mode==="entry"?"Entrada registrada com sucesso.":mode==="exit"?"Saída registrada com sucesso.":mode==="adjustment"?"Ajuste registrado com sucesso.":"Devolução registrada com sucesso.");
  setForm(empty);await load();
 };

 const enriched=useMemo(()=>rows.map(p=>({...p,lowStock:p.stock<=p.minimumStock})),[rows]);
 const filtered=useMemo(()=>enriched.filter(p=>{
  const q=(p.code+" "+(p.barcode||"")+" "+p.description).toLowerCase();
  return q.includes(search.toLowerCase())&&(statusFilter==="TODOS"||(statusFilter==="BAIXO"&&p.lowStock)||(statusFilter==="ZERADO"&&p.stock<=0)||(statusFilter==="OK"&&!p.lowStock));
 }),[enriched,search,statusFilter]);

 const totalUnits=rows.reduce((s,p)=>s+Number(p.stock||0),0);
 const totalValue=rows.reduce((s,p)=>s+Number(p.stock||0)*Number(p.cost||0),0);
 const low=rows.filter(p=>p.lowStock).length;
 const zero=rows.filter(p=>Number(p.stock||0)<=0).length;
 const filteredMovements=movements.filter(m=>movementFilter==="TODOS"||m.type===movementFilter);
 const alerts=rows.filter(p=>p.stockControlled!==false&&(Number(p.stock||0)<=0||Number(p.stock||0)<=Number(p.minimumStock||0)));
 const submitInventory=async()=>{setMsg("");const items=rows.filter(p=>p.stockControlled!==false).map(p=>({productId:p.id,quantity:Number(inventory[p.id]??p.stock)}));const r=await fetch("/api/stock/inventory",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({items,reason:"Inventário de estoque"})});const d=await r.json();if(!r.ok){setMsg(d.error||"Não foi possível concluir o inventário.");return}setMsg("Inventário concluído com sucesso.");setMode(null);setInventory({});await load();};

 return <section className="page">
  <div className="page-heading">
   <div><span className="eyebrow">OPERAÇÃO</span><h1>Estoque</h1><p>Controle de saldos, lotes, entradas, saídas, estoque mínimo e movimentações.</p></div>
   <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className={mode==="entry"?"primary":"secondary"} onClick={()=>setMode("entry")}>+ Entrada</button><button className={mode==="exit"?"primary":"secondary"} onClick={()=>setMode("exit")}>− Saída</button><button className={mode==="adjustment"?"primary":"secondary"} onClick={()=>setMode("adjustment")}>± Ajuste</button><button className={mode==="devolution"?"primary":"secondary"} onClick={()=>setMode("devolution")}>↩ Devolução</button><button className={mode==="inventory"?"primary":"secondary"} onClick={()=>setMode("inventory")}>Inventário</button></div>
  </div>

  {msg&&<div className="panel" style={{padding:12,marginBottom:12}}>{msg}</div>}
  {alerts.length>0&&<div className="panel" style={{padding:14,marginBottom:12}}><b>Alertas de estoque</b><div style={{marginTop:6,color:"var(--muted)"}}>{alerts.length} produto(s) abaixo ou no mínimo.</div><div style={{marginTop:8,display:"grid",gap:4}}>{alerts.slice(0,8).map(p=><div key={p.id}>⚠ {p.code} — {p.description}: <strong>{Number(p.stock).toFixed(3)}</strong> / mínimo {Number(p.minimumStock).toFixed(3)} {p.unit}</div>)}</div></div>}
  {mode==="inventory"&&<div className="panel" style={{padding:20,marginBottom:12}}><div className="panel-heading" style={{padding:0,marginBottom:15}}><div><span className="eyebrow">CONFERÊNCIA</span><h2>Inventário físico</h2><p style={{margin:0,color:"var(--muted)"}}>Informe a quantidade contada. O sistema ajustará somente produtos controlados por estoque.</p></div><button className="secondary" onClick={()=>setMode(null)}>Fechar</button></div><div className="table">{rows.filter(p=>p.stockControlled!==false).map(p=><div className="row" key={p.id}><span>{p.code}</span><span>{p.description}</span><span>Sistema: {Number(p.stock).toFixed(3)} {p.unit}</span><input type="number" min="0" step="0.001" value={inventory[p.id]??p.stock} onChange={e=>setInventory({...inventory,[p.id]:e.target.value})}/></div>)}</div><button className="primary" style={{marginTop:12}} onClick={submitInventory}>Concluir inventário</button></div>}

  <div className="stats" style={{marginBottom:12}}>
   <div className="stat-card"><b>{rows.length}</b><span>PRODUTOS</span></div>
   <div className="stat-card"><b>{totalUnits.toFixed(3)}</b><span>UNIDADES EM ESTOQUE</span></div>
   <div className="stat-card"><b>{money(totalValue)}</b><span>VALOR DE CUSTO</span></div>
   <div className="stat-card"><b>{low}</b><span>ESTOQUE BAIXO</span></div>
   <div className="stat-card"><b>{zero}</b><span>SEM ESTOQUE</span></div>
  </div>

  <div className="toolbar" style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:8}}>
   <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar código, barras ou produto..." />
   <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="TODOS">Todos</option><option value="OK">Estoque OK</option><option value="BAIXO">Estoque baixo</option><option value="ZERADO">Sem estoque</option></select>
   <select value={movementFilter} onChange={e=>setMovementFilter(e.target.value)}><option value="TODOS">Movimentações: todas</option><option value="ENTRADA">Entradas</option><option value="SAIDA">Saídas</option></select>
   <button className="secondary" onClick={()=>{setSearch("");setStatusFilter("TODOS");setMovementFilter("TODOS")}}>Limpar</button>
  </div>

  {mode&&mode!=="inventory"&&<div className="panel" style={{padding:20,marginBottom:12}}>
   <div className="panel-heading" style={{padding:0,marginBottom:15}}>
    <div><span className="eyebrow">{mode==="entry"?"ENTRADA":mode==="exit"?"SAÍDA":mode==="adjustment"?"AJUSTE":"DEVOLUÇÃO"}</span><h2>{mode==="entry"?"Entrada de estoque":mode==="exit"?"Saída de estoque":mode==="adjustment"?"Ajuste de estoque":"Devolução"}</h2><p style={{margin:0,color:"var(--muted)"}}>{mode==="entry"?"Registre compras e recebimentos por lote.":mode==="exit"?"Registre perdas, saídas ou transferências.":mode==="adjustment"?"Corrija divergências positivas ou negativas.":"Registre devoluções de entrada ou saída."}</p></div>
    <button className="secondary" onClick={()=>setMode(null)}>Fechar</button>
   </div>
   <form onSubmit={submit} style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
    <select required value={form.productId} onChange={e=>setForm({...form,productId:e.target.value})} style={{gridColumn:"span 2"}}><option value="">Selecione o produto</option>{products.map(p=><option key={p.id} value={p.id}>{p.code} — {p.description}</option>)}</select>
    <input required type="number" min="0.001" step="0.001" placeholder="Quantidade" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/>
    {(mode==="entry"||mode==="adjustment"||mode==="devolution")&&<input type="number" min="0" step="0.01" placeholder="Custo do lote (opcional)" value={form.cost} onChange={e=>setForm({...form,cost:e.target.value})}/>}
    {(mode==="entry"||mode==="adjustment"||mode==="devolution")&&<input placeholder="Código do lote" value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/>}
    {mode==="entry"&&<input type="date" value={form.entry} onChange={e=>setForm({...form,entry:e.target.value})}/>}
    {mode==="entry"&&<input type="date" value={form.expiresAt} onChange={e=>setForm({...form,expiresAt:e.target.value})}/>}
    <input placeholder={mode==="entry"?"Motivo / observação":"Motivo / observação (venda, perda, ajuste...)"} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})} style={{gridColumn:"span 2"}}/>
    <button className="primary" type="submit">{mode==="entry"?"Registrar entrada":mode==="exit"?"Registrar saída":mode==="adjustment"?"Registrar ajuste":"Registrar devolução"}</button>
   </form>
  </div>}

  <div className="panel" style={{marginTop:12}}>
   <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderBottom:"1px solid var(--line)"}}>
    <div><b>Saldo por produto</b><div style={{fontSize:12,color:"var(--muted)"}}>{filtered.length} produto(s) exibido(s)</div></div>
    <button className="secondary" onClick={()=>setShowMovements(!showMovements)}>{showMovements?"Ocultar":"Ver"} movimentações</button>
   </div>
   <div className="table">
    <div className="row header"><span>Código</span><span>Produto</span><span>Estoque</span><span>Mínimo</span><span>Status</span></div>
    {filtered.map(p=><div className="row" key={p.id}>
     <strong>{p.code}</strong><span>{p.description}</span><span>{Number(p.stock).toFixed(3)} {p.unit}</span><span>{Number(p.minimumStock).toFixed(3)}</span>
     <span style={{fontWeight:700,color:p.stock<=0?"#a33":p.lowStock?"#a66":"inherit"}}>{p.stock<=0?"SEM ESTOQUE":p.lowStock?"ESTOQUE BAIXO":"OK"}</span>
    </div>)}
    {!filtered.length&&<div style={{padding:22,textAlign:"center",color:"var(--muted)"}}>Nenhum produto nesta consulta.</div>}
   </div>
  </div>

  {showMovements&&<div className="panel" style={{marginTop:12}}>
   <div style={{padding:14,borderBottom:"1px solid var(--line)"}}><b>Histórico de movimentações</b><div style={{fontSize:12,color:"var(--muted)"}}>Últimas 100 movimentações</div></div>
   <div className="table">
    <div className="row header"><span>Data</span><span>Tipo</span><span>Produto</span><span>Quantidade</span><span>Detalhes</span></div>
    {filteredMovements.map(m=><div className="row" key={m.id}>
     <span>{dateTimeBR(m.createdAt)}</span><span style={{fontWeight:700}}>{m.type==="ENTRADA"?"ENTRADA":"SAÍDA"}</span><span>{m.product?.code} · {m.product?.description}</span><span>{Number(m.quantity).toFixed(3)} {m.product?.unit}</span><span>{m.notes||"—"}{m.reference==="LOTE"&&m.lotLinks?.[0]?.lot?.code?" · Lote "+m.lotLinks[0].lot.code:""}</span>
    </div>)}
    {!filteredMovements.length&&<div style={{padding:22,textAlign:"center",color:"var(--muted)"}}>Nenhuma movimentação encontrada.</div>}
   </div>
  </div>}
 </section>;
}
