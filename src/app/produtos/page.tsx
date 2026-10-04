"use client";

import {useEffect,useMemo,useState} from "react";
import {useRealtimeRefresh} from "@/lib/use-realtime-refresh";

const checksumEan13=(base:string)=>{const digits=base.slice(0,12).split("").map(Number);const sum=digits.reduce((a,d,i)=>a+d*(i%2===0?1:3),0);return String((10-(sum%10))%10)};
const makeInternalBarcode=()=>{const base="20"+String(Date.now()%10000000000).padStart(10,"0");return base+checksumEan13(base)};
const makeInternalCode=()=>{const stamp=new Date().toISOString().replace(/\D/g,"").slice(0,14);return "P-"+stamp+"-"+String(Math.floor(Math.random()*1000)).padStart(3,"0")};
const money=(v:any)=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const makeEmpty=()=>({code:makeInternalCode(),barcode:makeInternalBarcode(),description:"",unit:"UN",cost:"0",salePrice:"0",minimumStock:"0",initialStock:"0",stockControlled:true,
 categoryId:"",supplierId:"",ncm:"",cest:"",cfop:"",origin:"0",taxCode:"",photoData:"",
 brand:"",model:"",color:"",frameSize:"",lensWidth:"",bridgeWidth:"",templeLength:"",material:"",frameShape:""});

const code39:any={
 "0":"101001101101","1":"110100101011","2":"101100101011","3":"110110010101","4":"101001101011",
 "5":"110100110101","6":"101100110101","7":"101001011011","8":"110100101101","9":"101100101101",
 A:"110101001011",B:"101101001011",C:"110110100101",D:"101011001011",E:"110101100101",F:"101101100101",
 G:"101010011011",H:"110101001101",I:"101101001101",J:"101011001101",K:"110101010011",L:"101101010011",
 M:"110110101001",N:"101011010011",O:"110101101001",P:"101101101001",Q:"101010110011",R:"110101011001",
 S:"101101011001",T:"101011011001",U:"110010101011",V:"100110101011",W:"110011010101",X:"100101101011",
 Y:"110010110101",Z:"100110110101","-":"100101011011",".":"110010101101"," ":"100110101101",
 "$":"100100100101","/":"100100101001","+":"100101001001","%":"101001001001"
};
const barcodeSvg=(value:string)=>{
 const raw=(value||"").toUpperCase().replace(/[^0-9A-Z\-\. \$\/\+%]/g,"");
 const data="*"+(raw||"PROD")+"*";
 let x=0;
 const bars:string[]=[];
 for(const ch of data){
  const pattern=ch==="*"?"100101101101":code39[ch]||code39["0"];
  for(const bit of pattern){if(bit==="1")bars.push("<rect x='"+x+"' y='0' width='1.5' height='38'/>");x+=1.5;}
  x+=1.5;
 }
 const width=Math.max(120,x);
 return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 "+width+" 46' preserveAspectRatio='none'><g fill='#000'>"+bars.join("")+"</g><text x='"+(width/2)+"' y='45' text-anchor='middle' font-family='Arial' font-size='7'>"+raw+"</text></svg>";
};

const compressPhoto=(file:File)=>new Promise<string>((resolve,reject)=>{
 const reader=new FileReader();
 reader.onload=()=>{const img=new Image();img.onload=()=>{const max=1200;const scale=Math.min(1,max/Math.max(img.width,img.height));const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const ctx=canvas.getContext("2d");if(!ctx){reject(new Error("Não foi possível preparar a foto."));return;}ctx.drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL("image/jpeg",0.82));};img.onerror=()=>reject(new Error("Não foi possível ler a imagem."));img.src=String(reader.result)};reader.onerror=()=>reject(new Error("Não foi possível carregar a imagem."));reader.readAsDataURL(file);
});
function printLabels(p:any,quantity:number){
 const count=Math.max(1,Math.min(100,quantity||1));
 const esc=(v:any)=>String(v??"").replace(/[&<>"]/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[x]!));
 const value=p.barcode||p.code;
 const labels=Array.from({length:count},()=>`
  <div class="label">
   <div class="top"><b>${esc(p.brand||"MB ÓPTICA")}</b><span>${esc(p.frameSize||"")}</span></div>
   <div class="middle"><span>${esc(p.model||p.description)}</span><b>${esc(Number(p.salePrice||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}))}</b></div>
   <div class="bar">${barcodeSvg(value)}</div>
  </div>`).join("");
 const win=window.open("","_blank","width=500,height=700");
 if(!win){alert("Permita pop-ups para imprimir as etiquetas.");return;}
 win.document.write(`<!doctype html><html><head><title>Etiquetas - ${esc(p.description)}</title><style>
 @page{size:95mm 12mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}
 .label{width:95mm;height:12mm;padding:1mm 2mm;page-break-after:always;overflow:hidden;font-family:Arial,sans-serif}
 .top,.middle{display:flex;justify-content:space-between;align-items:center;white-space:nowrap;overflow:hidden}
 .top{font-size:7px;height:2.4mm}.middle{font-size:6.5px;height:2.5mm}.middle span{max-width:67mm;overflow:hidden;text-overflow:ellipsis}
 .bar{height:5.7mm;width:100%;overflow:hidden}.bar svg{width:100%;height:100%}
 @media print{.label:last-child{page-break-after:auto}}
 </style></head><body>${labels}<script>window.onload=()=>{window.focus();window.print()}</script></body></html>`);
 win.document.close();
}

export default function Produtos(){
 const [rows,setRows]=useState<any[]>([]),[cats,setCats]=useState<any[]>([]),[suppliers,setSuppliers]=useState<any[]>([]),[categoryBootstrapTried,setCategoryBootstrapTried]=useState(false),[fiscalDiag,setFiscalDiag]=useState<any>(null),[fiscalDiagLoading,setFiscalDiagLoading]=useState(false);
 const [form,setForm]=useState<any>(makeEmpty()),[selected,setSelected]=useState<any>(null),[open,setOpen]=useState(false),[formTab,setFormTab]=useState("cadastro"),[search,setSearch]=useState(""),[categoryFilter,setCategoryFilter]=useState(""),[stockFilter,setStockFilter]=useState("TODOS"),[msg,setMsg]=useState(""),[labelQty,setLabelQty]=useState(1),[labelProduct,setLabelProduct]=useState<any>(null),[labelCatalogOpen,setLabelCatalogOpen]=useState(false),[labelSearch,setLabelSearch]=useState(""),[reconciling,setReconciling]=useState(false),[stockOpen,setStockOpen]=useState(false),[stockTab,setStockTab]=useState<"entry"|"exit"|"adjustment"|"devolution"|"inventory"|"movements">("entry"),[stockForm,setStockForm]=useState<any>({productId:"",quantity:"",cost:"",code:"",expiresAt:"",reason:"",entry:""}),[inventory,setInventory]=useState<Record<string,string>>({}),[movements,setMovements]=useState<any[]>([]),[stockBusy,setStockBusy]=useState(false);

 const load=async()=>{
  try{
   const [p,c,s,m]=await Promise.all([
    fetch("/api/products",{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d?.error||"Não foi possível carregar os produtos.");return d}),fetch("/api/categories").then(r=>r.json()),fetch("/api/suppliers").then(r=>r.json()),fetch("/api/stock/movements",{cache:"no-store"}).then(r=>r.ok?r.json():[])
   ]);
   setRows(Array.isArray(p)?p:[]);setCats(Array.isArray(c)?c:[]);setSuppliers(Array.isArray(s)?s:[]);setMovements(Array.isArray(m)?m:[]);
   if(Array.isArray(c)&&c.length===0&&!categoryBootstrapTried){setCategoryBootstrapTried(true);for(const name of ["Armações","Lentes","Lentes de contato","Tratamentos","Acessórios","Serviços","Outros"]){await fetch("/api/categories",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name})})}const cc=await fetch("/api/categories").then(r=>r.json());if(Array.isArray(cc))setCats(cc);}
  }catch(e){setRows([]);setMsg(e instanceof Error?e.message:"Não foi possível carregar os produtos.");}
 };
 useEffect(()=>{load();if(typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("tab")==="estoque")setStockOpen(true)},[]);
 const defaultCategories=["Armações","Lentes","Tratamentos","Acessórios","Serviços","Outros"];
 const createDefaultCategories=async()=>{setMsg("");try{for(const name of defaultCategories){await fetch("/api/categories",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name})})}await load();setMsg("Categorias padrão criadas.");}catch(e){setMsg("Não foi possível criar as categorias padrão.")}};

 useRealtimeRefresh(load,20000);
 
 const loadFiscalDiagnostic=async()=>{  setFiscalDiagLoading(true);setMsg("");  try{   const r=await fetch("/api/fiscal/produtos/diagnostico",{cache:"no-store"});   const d=await r.json();   if(!r.ok)throw new Error(d?.error||"Não foi possível diagnosticar os dados fiscais dos produtos.");   setFiscalDiag(d);  }catch(e){setMsg(e instanceof Error?e.message:"Não foi possível diagnosticar os dados fiscais dos produtos.");}  finally{setFiscalDiagLoading(false);} }; const submitStock=async(e:React.FormEvent)=>{
  e.preventDefault();setStockBusy(true);setMsg("");
  try{
   const r=await fetch("/api/stock/"+stockTab,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...stockForm,quantity:Number(stockForm.quantity),cost:stockForm.cost===""?undefined:Number(stockForm.cost),direction:stockTab==="exit"||stockTab==="adjustment"||stockTab==="devolution"?(stockTab==="exit"?"SAIDA":stockForm.reason?.startsWith("ENTRADA:")?"ENTRADA":"SAIDA"):undefined})});
   const d=await r.json();if(!r.ok)throw new Error(d?.error||"Não foi possível concluir a operação.");
   setMsg(stockTab==="entry"?"Entrada registrada com sucesso.":stockTab==="exit"?"Saída registrada com sucesso.":stockTab==="adjustment"?"Ajuste registrado com sucesso.":"Devolução registrada com sucesso.");setStockForm({productId:"",quantity:"",cost:"",code:"",expiresAt:"",reason:"",entry:""});await load();
  }catch(e){setMsg(e instanceof Error?e.message:"Não foi possível concluir a operação.");}finally{setStockBusy(false)}
};
const submitInventory=async()=>{setStockBusy(true);setMsg("");try{const items=rows.filter(p=>p.stockControlled!==false).map(p=>({productId:p.id,quantity:Number(inventory[p.id]??p.stock)}));const r=await fetch("/api/stock/inventory",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({items,reason:"Inventário de estoque"})});const d=await r.json();if(!r.ok)throw new Error(d?.error||"Não foi possível concluir o inventário.");setMsg("Inventário concluído com sucesso.");setInventory({});await load()}catch(e){setMsg(e instanceof Error?e.message:"Não foi possível concluir o inventário.");}finally{setStockBusy(false)}};
const openNewProduct=()=>{setSelected(null);setForm(makeEmpty());setFormTab("cadastro");setOpen(true)};
const openStock=(tab:"entry"|"exit"|"adjustment"|"devolution"|"inventory"|"movements"="entry",productId="")=>{setStockTab(tab);setStockForm((x:any)=>({...x,productId}));setStockOpen(true)};
const reconcileBeepStart=async()=>{
  setReconciling(true);setMsg("");
  try{
   const r=await fetch("/api/migration/legacy/products-stock/reconcile",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
   const d=await r.json();
   if(!r.ok)throw new Error(d?.error||"Não foi possível reconciliar os produtos do BeepStart.");
   setMsg(d.message||"Reconciliação concluída.");
   await load();
  }catch(e){setMsg(e instanceof Error?e.message:"Não foi possível reconciliar os produtos do BeepStart.");}
  finally{setReconciling(false);}
 };

 const save=async(e:React.FormEvent)=>{
  e.preventDefault();setMsg("");
  const payload={...form,cost:Number(form.cost),salePrice:Number(form.salePrice),minimumStock:Number(form.minimumStock),initialStock:selected?0:Number(form.initialStock||0),stockControlled:Boolean(form.stockControlled),photoData:form.photoData||null,
   categoryId:form.categoryId||null,supplierId:form.supplierId||null,
   lensWidth:form.lensWidth?Number(form.lensWidth):null,bridgeWidth:form.bridgeWidth?Number(form.bridgeWidth):null,
   templeLength:form.templeLength?Number(form.templeLength):null
  };
  const r=await fetch(selected?"/api/products/"+selected.id:"/api/products",{method:selected?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  const d=await r.json();
  if(!r.ok){setMsg(d.error||"Erro ao salvar");return}
  setOpen(false);setSelected(null);setForm(makeEmpty());await load();
 };

 const edit=(p:any)=>{
  setSelected(p);
  setForm({...makeEmpty(),...p,initialStock:"0",cost:String(p.cost??0),salePrice:String(p.salePrice??0),minimumStock:String(p.minimumStock??0),stockControlled:p.stockControlled!==false,
   categoryId:p.categoryId||"",supplierId:p.supplierId||"",photoData:p.photoData||"",lensWidth:p.lensWidth?String(p.lensWidth):"",bridgeWidth:p.bridgeWidth?String(p.bridgeWidth):"",templeLength:p.templeLength?String(p.templeLength):""});
  setOpen(true);
 };

 const filtered=useMemo(()=>rows.filter(p=>{const text=(p.code+" "+(p.barcode||"")+" "+p.description+" "+(p.brand||"")+" "+(p.model||"")+" "+(p.color||"")+" "+(p.frameSize||"")).toLowerCase();return text.includes(search.toLowerCase())&&(!categoryFilter||p.categoryId===categoryFilter)&&(stockFilter==="TODOS"||(stockFilter==="BAIXO"&&p.lowStock)||(stockFilter==="COM_BARRAS"&&!!p.barcode))}),[rows,search,categoryFilter,stockFilter]);
 const low=rows.filter(p=>p.lowStock).length;
 const frames=rows.filter(p=>/armação|oculos|óculos|frame/i.test((p.category?.name||"")+" "+(p.description||""))).length;
 const integrated=rows.filter(p=>p.integratedFromBeepStart).length;
 const set=(key:string,value:string|boolean)=>setForm((x:any)=>({...x,[key]:value}));

 return <section className="page">
  <div className="page-heading">
   <div><span className="eyebrow">CATÁLOGO E ESTOQUE</span><h1>Produtos e estoque</h1><p>Cadastros, saldos, identificação, fotos e operações de estoque em uma única aba.</p></div>
   <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="secondary" onClick={()=>{setFiscalDiag(null);loadFiscalDiagnostic()}} disabled={fiscalDiagLoading}>{fiscalDiagLoading?"Analisando...":"✓ Diagnóstico fiscal"}</button><button className="secondary" onClick={()=>setLabelCatalogOpen(true)}>🏷 Etiquetas</button><button className="secondary" onClick={()=>openStock("entry")}>⚙ Operações de estoque</button><button className="primary" onClick={openNewProduct}>+ Adicionar produto</button></div>
  </div>

  {msg&&<div className="panel" style={{padding:12,marginBottom:12,color:"#a33"}}>{msg}</div>}

  <div className="stats" style={{marginBottom:12}}>
   <div className="stat-card"><b>{rows.length}</b><span>PRODUTOS ATIVOS</span></div>
   <div className="stat-card"><b>{frames}</b><span>ARMAÇÕES / ÓCULOS</span></div>
   <div className="stat-card"><b>{low}</b><span>ESTOQUE BAIXO</span></div>
   <div className="stat-card"><b>{rows.filter(p=>p.barcode).length}</b><span>COM CÓDIGO DE BARRAS</span></div><div className="stat-card"><b>{integrated}</b><span>INTEGRADOS DO BEEPSTART</span></div>
  </div>

  <div className="toolbar" style={{display:"grid",gridTemplateColumns:"minmax(260px,2fr) 1fr 1fr auto",gap:8}}>
   <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar código, barras, marca, modelo, cor, tamanho ou descrição..." />
   <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="">Todas as categorias</option>{cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
   <select value={stockFilter} onChange={e=>setStockFilter(e.target.value)}><option value="TODOS">Todos</option><option value="BAIXO">Estoque baixo</option><option value="COM_BARRAS">Com código de barras</option></select>
   <button className="secondary" onClick={()=>{setSearch("");setCategoryFilter("");setStockFilter("TODOS")}}>Limpar</button><button className="secondary" disabled={reconciling} onClick={reconcileBeepStart}>{reconciling?"Reconciliando...":"↻ Reconciliar BeepStart"}</button>
  </div>

  {fiscalDiag&&<div className="panel" style={{marginTop:12,border:"1px solid var(--line)"}}>   <div className="panel-heading" style={{padding:"14px 16px",margin:0,borderBottom:"1px solid var(--line)"}}>    <div><span className="eyebrow">FASE 7.4 · FISCAL</span><h2>Diagnóstico fiscal dos produtos</h2><p style={{margin:0,color:"var(--muted)"}}>Leitura dos dados fiscais já cadastrados. Este diagnóstico não altera o cadastro operacional.</p></div>    <button className="secondary" onClick={()=>setFiscalDiag(null)}>Fechar</button>   </div>   <div style={{padding:14}}>    <div className="stats">     <div className="stat-card"><b>{fiscalDiag.total||0}</b><span>PRODUTOS ANALISADOS</span></div>     <div className="stat-card"><b>{fiscalDiag.ok||0}</b><span>FISCAIS OK</span></div>     <div className="stat-card"><b>{fiscalDiag.pendentes||0}</b><span>PENDENTES</span></div>     <div className="stat-card"><b>{fiscalDiag.bloqueantes||0}</b><span>BLOQUEANTES</span></div>    </div>    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:12}}>     <div className="panel" style={{padding:14}}>      <b>Pendências encontradas</b>      <div style={{marginTop:10,fontSize:13,lineHeight:1.8}}>       <div>NCM ausente: <strong>{fiscalDiag.resumo?.semNcm||0}</strong></div>       <div>NCM inválido: <strong>{fiscalDiag.resumo?.ncmInvalido||0}</strong></div>       <div>CFOP ausente: <strong>{fiscalDiag.resumo?.semCfop||0}</strong></div>       <div>CFOP inválido: <strong>{fiscalDiag.resumo?.cfopInvalido||0}</strong></div>       <div>Origem fiscal ausente: <strong>{fiscalDiag.resumo?.semOrigem||0}</strong></div>       <div>Origem fiscal inválida: <strong>{fiscalDiag.resumo?.origemInvalida||0}</strong></div>       <div>Código tributário ausente: <strong>{fiscalDiag.resumo?.semCodigoTributario||0}</strong></div>       <div>CEST com formato inválido: <strong>{fiscalDiag.resumo?.cestInvalido||0}</strong></div>      </div>     </div>     <div className="panel" style={{padding:14}}>      <b>Critério do diagnóstico</b>      <p style={{fontSize:13,lineHeight:1.6,color:"var(--muted)",marginBottom:8}}>São considerados bloqueantes os campos fiscais essenciais ausentes ou em formato inválido. O CEST inválido é apresentado como pendência informativa nesta etapa.</p>      <button className="secondary" onClick={loadFiscalDiagnostic} disabled={fiscalDiagLoading}>{fiscalDiagLoading?"Atualizando...":"↻ Atualizar diagnóstico"}</button>     </div>    </div>    <div className="table" style={{marginTop:12}}>     <div className="row header"><span>Código</span><span>Produto</span><span>NCM</span><span>CFOP</span><span>Origem</span><span>Tributário</span><span>Situação</span></div>     {(fiscalDiag.produtos||[]).filter((p:any)=>p.status==="PENDENTE").map((p:any)=><div className="row" key={p.id}>      <strong>{p.code}</strong>      <span><b>{p.description}</b>{p.category?<small style={{display:"block",color:"var(--muted)"}}>{p.category}</small>:null}</span>      <span>{p.ncm||"—"}</span>      <span>{p.cfop||"—"}</span>      <span>{p.origin||"—"}</span>      <span>{p.taxCode||"—"}</span>      <span><strong style={{color:p.blocking?"#a33":"#a66"}}>{p.blocking?"BLOQUEANTE":"INFORMATIVA"}</strong><small style={{display:"block",color:"var(--muted)",marginTop:3}}>{p.issues.join(" · ")}</small></span>     </div>)}     {!(fiscalDiag.produtos||[]).some((p:any)=>p.status==="PENDENTE")&&<div style={{padding:22,textAlign:"center",color:"#147d70",fontWeight:700}}>Nenhuma pendência fiscal encontrada nos produtos ativos.</div>}    </div>   </div>  </div>}  {open&&<div style={{position:"fixed",inset:0,zIndex:1200,background:"rgba(15,23,42,.48)",display:"flex",alignItems:"center",justifyContent:"center",padding:18}}>
   <div className="panel" style={{width:"min(1050px,100%)",maxHeight:"92vh",overflowY:"auto",padding:20,boxShadow:"0 24px 80px rgba(0,0,0,.22)"}}>
    <div className="panel-heading" style={{padding:0,marginBottom:14}}><div><span className="eyebrow">CADASTRO DE PRODUTO</span><h2>{selected?"Editar produto":"Novo produto"}</h2><p style={{margin:0,color:"var(--muted)"}}>Preenchimento por abas. O estoque existente não é alterado ao editar o cadastro.</p></div><button className="secondary" onClick={()=>setOpen(false)}>Fechar</button></div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap",borderBottom:"1px solid var(--line)",paddingBottom:10,marginBottom:14}}>{[["cadastro","Cadastro"],["estoque","Estoque e preços"],["fiscal","Fiscal"],["foto","Foto"]].map(([id,label])=><button type="button" key={id} className={formTab===id?"primary":"secondary"} onClick={()=>setFormTab(id)}>{label}</button>)}</div>
    <form onSubmit={save}>
     {formTab==="cadastro"&&<div><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
       <input placeholder="Código interno" value={form.code} onChange={e=>set("code",e.target.value)} required/><input placeholder="Código de barras" value={form.barcode} onChange={e=>set("barcode",e.target.value)}/><input placeholder="Descrição" value={form.description} onChange={e=>set("description",e.target.value)} required style={{gridColumn:"span 2"}}/>
       <select value={form.categoryId} onChange={e=>set("categoryId",e.target.value)}><option value="">Categoria</option>{cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={form.supplierId} onChange={e=>set("supplierId",e.target.value)}><option value="">Fornecedor</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><input placeholder="Marca" value={form.brand} onChange={e=>set("brand",e.target.value)}/><input placeholder="Modelo / referência" value={form.model} onChange={e=>set("model",e.target.value)}/><input placeholder="Cor" value={form.color} onChange={e=>set("color",e.target.value)}/><input placeholder="Tamanho (ex.: 52-18-140)" value={form.frameSize} onChange={e=>set("frameSize",e.target.value)}/><input placeholder="Formato" value={form.frameShape} onChange={e=>set("frameShape",e.target.value)}/><input placeholder="Material" value={form.material} onChange={e=>set("material",e.target.value)}/><input type="number" placeholder="Lente mm" value={form.lensWidth} onChange={e=>set("lensWidth",e.target.value)}/><input type="number" placeholder="Ponte mm" value={form.bridgeWidth} onChange={e=>set("bridgeWidth",e.target.value)}/><input type="number" placeholder="Haste mm" value={form.templeLength} onChange={e=>set("templeLength",e.target.value)}/><select value={form.unit} onChange={e=>set("unit",e.target.value)}><option value="UN">UN — Unidade</option><option value="PAR">PAR — Par</option><option value="PC">PC — Peça</option><option value="CX">CX — Caixa</option><option value="FR">FR — Frasco</option><option value="SERV">SERV — Serviço</option><option value="H">H — Hora</option><option value="KG">KG — Quilograma</option><option value="G">G — Grama</option><option value="L">L — Litro</option><option value="ML">ML — Mililitro</option><option value="M">M — Metro</option></select>
      </div></div>}
     {formTab==="estoque"&&<div><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}><label>Custo unitário<input type="number" step="0.01" min="0" value={form.cost} onChange={e=>set("cost",e.target.value)}/></label><label>Preço de venda<input type="number" step="0.01" min="0" value={form.salePrice} onChange={e=>set("salePrice",e.target.value)}/></label>{!selected&&<label>Estoque inicial<input type="number" step="0.001" min="0" value={form.initialStock} onChange={e=>set("initialStock",e.target.value)}/></label>}<label>Estoque mínimo<input type="number" step="0.001" min="0" value={form.minimumStock} onChange={e=>set("minimumStock",e.target.value)}/></label><label style={{display:"flex",alignItems:"center",gap:7,fontSize:12}}><input type="checkbox" checked={form.stockControlled!==false} onChange={e=>set("stockControlled",e.target.checked)}/> Controla estoque</label><div><small style={{display:"block",color:"var(--muted)"}}>Valor do estoque inicial</small><strong>{money(Number(form.initialStock||0)*Number(form.cost||0))}</strong></div></div><div className="panel" style={{padding:14,marginTop:12}}><b>Saldo atual</b><div style={{fontSize:22,fontWeight:800,marginTop:5}}>{selected?String(Number(selected.stock||0).toFixed(3))+" "+(selected.unit||"UN"):"Será calculado após salvar"}</div><small style={{color:"var(--muted)"}}>Para alterar o saldo de um produto existente, use as operações de estoque.</small></div></div>}
     {formTab==="fiscal"&&<div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}><input placeholder="NCM" value={form.ncm} onChange={e=>set("ncm",e.target.value)}/><input placeholder="CEST" value={form.cest} onChange={e=>set("cest",e.target.value)}/><input placeholder="CFOP" value={form.cfop} onChange={e=>set("cfop",e.target.value)}/><input placeholder="Origem fiscal" value={form.origin} onChange={e=>set("origin",e.target.value)}/><input placeholder="Código tributário" value={form.taxCode} onChange={e=>set("taxCode",e.target.value)}/></div>}
     {formTab==="foto"&&<div style={{display:"grid",gridTemplateColumns:"260px 1fr",gap:18,alignItems:"start"}}><div style={{width:240,height:240,border:"1px dashed var(--line)",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",background:"var(--surface-soft)"}}>{form.photoData?<img src={form.photoData} alt="Foto do produto" style={{width:"100%",height:"100%",objectFit:"contain"}}/>:<span style={{color:"var(--muted)",fontSize:12,textAlign:"center",padding:20}}>Sem foto cadastrada</span>}</div><div><label className="secondary" style={{display:"inline-flex",alignItems:"center",cursor:"pointer"}}>📷 Anexar foto<input type="file" accept="image/*" style={{display:"none"}} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{setMsg("Preparando foto...");const data=await compressPhoto(file);set("photoData",data);setMsg("Foto carregada. Salve o produto para gravar a alteração.");}catch(err){setMsg(err instanceof Error?err.message:"Não foi possível preparar a foto.");}}}/></label><button type="button" className="secondary" style={{marginLeft:8}} disabled={!form.photoData} onClick={()=>set("photoData","")}>Remover foto</button><p style={{marginTop:12,color:"var(--muted)",fontSize:12,lineHeight:1.6}}>A imagem é reduzida automaticamente para uso no sistema e fica vinculada ao cadastro do produto para futuras atualizações.</p></div></div>}
     <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:18,paddingTop:14,borderTop:"1px solid var(--line)"}}><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancelar</button><button className="primary" type="submit">Salvar produto</button></div>
    </form>
   </div>
  </div>}
  <div className="panel" style={{marginTop:12}}>
   <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",borderBottom:"1px solid var(--line)"}}><div><b>Produtos cadastrados</b><div style={{fontSize:12,color:"var(--muted)"}}>{filtered.length} produto(s) exibido(s) · {integrated} integrado(s) do BeepStart</div></div><button className="primary" onClick={openNewProduct}>+ Adicionar produto</button></div>
   <div className="table">
    <div className="row header" style={{gridTemplateColumns:"58px 1.7fr .9fr .9fr .9fr .9fr .8fr .9fr 1.2fr"}}><span>Foto</span><span>Produto</span><span>Categoria</span><span>Fornecedor</span><span>Cor</span><span>Tamanho</span><span>Preço</span><span>Estoque</span><span>Ações</span></div>
    {filtered.map(p=><div className="row" key={p.id} style={{gridTemplateColumns:"58px 1.7fr .9fr .9fr .9fr .9fr .8fr .9fr 1.2fr"}}><span>{p.photoData?<img src={p.photoData} alt="" style={{width:42,height:42,objectFit:"contain",borderRadius:8,border:"1px solid var(--line)",background:"#fff"}}/>:<span style={{display:"inline-flex",width:42,height:42,borderRadius:8,alignItems:"center",justifyContent:"center",background:"var(--surface-soft)",color:"var(--muted)"}}>—</span>}</span><span><b>{p.brand||""}</b>{p.brand?" · ":""}{p.model||p.description}{p.integratedFromBeepStart&&<small style={{display:"block",color:"#147d70",fontWeight:700}}>✓ Integrado do BeepStart</small>}</span><span>{p.category?.name||"—"}</span><span>{p.supplier?.name||"—"}</span><span>{p.color||"—"}</span><span>{p.frameSize||"—"}</span><span>R$ {Number(p.salePrice||0).toFixed(2)}</span><span style={{fontWeight:600,color:p.stockControlled===false?"#147d70":p.lowStock?"#a33":"inherit"}}>{p.stockControlled===false?"Não gera estoque":<>{Number(p.stock||0).toFixed(3)} {p.unit} {p.lowStock?"· baixo":""}</>}</span><span style={{display:"flex",gap:7,flexWrap:"wrap"}}><button className="link-button" onClick={()=>edit(p)}>Editar</button><button className="link-button" onClick={()=>openStock("entry",p.id)}>Estoque</button><button className="link-button" onClick={()=>{setLabelProduct(p);setLabelQty(1)}}>🏷 Etiqueta</button></span></div>)}
    {!filtered.length&&<div style={{padding:22,textAlign:"center",color:"var(--muted)"}}>Nenhum produto encontrado.</div>}
   </div>
  </div>

  {stockOpen&&<div style={{position:"fixed",inset:0,zIndex:1100,background:"rgba(15,23,42,.48)",display:"flex",alignItems:"center",justifyContent:"center",padding:18}}><div className="panel" style={{width:"min(1050px,100%)",maxHeight:"92vh",overflowY:"auto",padding:20,boxShadow:"0 24px 80px rgba(0,0,0,.22)"}}>
    <div className="panel-heading" style={{padding:0,marginBottom:12}}><div><span className="eyebrow">OPERAÇÃO</span><h2>Produtos e estoque</h2><p>Entradas, saídas, ajustes, devoluções e inventário sem sair do cadastro de produtos.</p></div><button className="secondary" onClick={()=>setStockOpen(false)}>Fechar</button></div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap",borderBottom:"1px solid var(--line)",paddingBottom:10,marginBottom:14}}>{[["entry","Entrada"],["exit","Saída"],["adjustment","Ajuste"],["devolution","Devolução"],["inventory","Inventário"],["movements","Movimentações"]].map(([id,label])=><button type="button" key={id} className={stockTab===id?"primary":"secondary"} onClick={()=>setStockTab(id as any)}>{label}</button>)}</div>
    {stockTab==="movements"&&<div className="table"><div className="row header" style={{gridTemplateColumns:"1fr 1fr 1.5fr 1fr 2fr"}}><span>Data</span><span>Tipo</span><span>Produto</span><span>Quantidade</span><span>Detalhes</span></div>{movements.map(m=><div className="row" key={m.id} style={{gridTemplateColumns:"1fr 1fr 1.5fr 1fr 2fr"}}><span>{m.createdAt?new Date(m.createdAt).toLocaleString("pt-BR"):"—"}</span><span>{m.type==="ENTRADA"?"ENTRADA":m.type==="SAIDA"?"SAÍDA":m.type}</span><span>{m.product?.code} · {m.product?.description}</span><span>{Number(m.quantity||0).toFixed(3)} {m.product?.unit||""}</span><span>{m.notes||"—"}{m.lotLinks?.[0]?.lot?.code?" · Lote "+m.lotLinks[0].lot.code:""}</span></div>)}{!movements.length&&<div style={{padding:22,textAlign:"center",color:"var(--muted)"}}>Nenhuma movimentação encontrada.</div>}</div>}
    {stockTab==="inventory"&&<div><div className="panel" style={{padding:14,marginBottom:12}}><b>Inventário físico</b><p style={{margin:"6px 0 0",color:"var(--muted)",fontSize:12}}>Informe a quantidade contada. Somente produtos com controle de estoque serão ajustados.</p></div><div className="table"><div className="row header" style={{gridTemplateColumns:"1fr 1.8fr .9fr .9fr 1.2fr"}}><span>Código</span><span>Produto</span><span>Cor</span><span>Tamanho</span><span>Estoque / contagem</span></div>{rows.filter(p=>p.stockControlled!==false).map(p=><div className="row" key={p.id} style={{gridTemplateColumns:"1fr 1.8fr .9fr .9fr 1.2fr"}}><span>{p.code}</span><span>{p.description}</span><span>{p.color||"—"}</span><span>{p.frameSize||"—"}</span><span style={{display:"flex",gap:8,alignItems:"center"}}><small>Sistema: {Number(p.stock||0).toFixed(3)} {p.unit}</small><input type="number" min="0" step="0.001" value={inventory[p.id]??p.stock} onChange={e=>setInventory({...inventory,[p.id]:e.target.value})}/></span></div>)}</div><button className="primary" style={{marginTop:12}} disabled={stockBusy} onClick={submitInventory}>{stockBusy?"Concluindo...":"Concluir inventário"}</button></div>}
    {stockTab!=="inventory"&&stockTab!=="movements"&&<form onSubmit={submitStock} style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}><select required value={stockForm.productId} onChange={e=>setStockForm({...stockForm,productId:e.target.value})} style={{gridColumn:"span 2"}}><option value="">Selecione o produto</option>{rows.map(p=><option key={p.id} value={p.id}>{p.code} — {p.description}</option>)}</select><input required type="number" min="0.001" step="0.001" placeholder="Quantidade" value={stockForm.quantity} onChange={e=>setStockForm({...stockForm,quantity:e.target.value})}/>{(stockTab==="entry"||stockTab==="adjustment"||stockTab==="devolution")&&<input type="number" min="0" step="0.01" placeholder="Custo do lote (opcional)" value={stockForm.cost} onChange={e=>setStockForm({...stockForm,cost:e.target.value})}/>} {(stockTab==="entry"||stockTab==="adjustment"||stockTab==="devolution")&&<input placeholder="Código do lote" value={stockForm.code} onChange={e=>setStockForm({...stockForm,code:e.target.value})}/>} {stockTab==="entry"&&<input type="date" value={stockForm.entry} onChange={e=>setStockForm({...stockForm,entry:e.target.value})}/>} {stockTab==="entry"&&<input type="date" value={stockForm.expiresAt} onChange={e=>setStockForm({...stockForm,expiresAt:e.target.value})}/>}<input placeholder={stockTab==="entry"?"Motivo / observação":"Motivo / observação (venda, perda, ajuste...)"} value={stockForm.reason} onChange={e=>setStockForm({...stockForm,reason:e.target.value})} style={{gridColumn:"span 2"}}/><button className="primary" type="submit" disabled={stockBusy}>{stockBusy?"Salvando...":stockTab==="entry"?"Registrar entrada":stockTab==="exit"?"Registrar saída":stockTab==="adjustment"?"Registrar ajuste":"Registrar devolução"}</button></form>}
   </div></div>}
  {labelCatalogOpen&&<div style={{position:"fixed",inset:0,zIndex:1050,background:"rgba(15,23,42,.48)",display:"flex",alignItems:"center",justifyContent:"center",padding:18}}><div className="panel" style={{width:"min(1050px,100%)",maxHeight:"92vh",overflowY:"auto",padding:20,boxShadow:"0 24px 80px rgba(0,0,0,.22)"}}>
   <div className="panel-heading" style={{padding:0,marginBottom:12}}>
    <div><span className="eyebrow">IMPRESSÃO</span><h2>Etiquetas de óculos</h2><p>Selecione um produto cadastrado e imprima a etiqueta para a haste.</p></div>
    <button className="secondary" onClick={()=>setLabelCatalogOpen(false)}>Fechar</button>
   </div>
   <div className="toolbar" style={{marginBottom:10}}>
    <input value={labelSearch} onChange={e=>setLabelSearch(e.target.value)} placeholder="Buscar produto, código, marca, modelo, cor ou tamanho..." />
   </div>
   {!rows.length&&<div style={{padding:18,textAlign:"center",color:"var(--muted)"}}>Cadastre pelo menos um produto para habilitar a impressão da etiqueta.</div>}
   {!!rows.length&&<div className="table">
    <div className="row header"><span>Código</span><span>Produto</span><span>Marca / modelo</span><span>Preço</span><span>Etiqueta</span></div>
    {rows.filter(p=>(p.code+" "+(p.barcode||"")+" "+p.description+" "+(p.brand||"")+" "+(p.model||"")+" "+(p.color||"")+" "+(p.frameSize||"")).toLowerCase().includes(labelSearch.toLowerCase())).map(p=><div className="row" key={p.id}>
     <strong>{p.code}</strong><span>{p.description}</span><span>{p.brand||"—"}{p.model?" · "+p.model:""}</span><span>R$ {Number(p.salePrice||0).toFixed(2)}</span>
     <button className="link-button" onClick={()=>{setLabelProduct(p);setLabelQty(1);setLabelCatalogOpen(false)}}>🏷 Imprimir</button>
    </div>)}
   </div>}
  </div></div>}

  {labelProduct&&<div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(15,23,42,.45)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
   <div className="panel" style={{width:"min(760px,100%)",maxHeight:"90vh",overflowY:"auto",padding:18,boxShadow:"0 20px 60px rgba(0,0,0,.2)"}}>
    <div className="panel-heading" style={{padding:0,marginBottom:12}}>
     <div><span className="eyebrow">ETIQUETA</span><h2>{labelProduct.brand||"MB ÓPTICA"} · {labelProduct.model||labelProduct.description}</h2><p>Impressão da etiqueta do produto selecionado.</p></div>
     <button className="secondary" onClick={()=>setLabelProduct(null)}>Fechar</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,alignItems:"center"}}>
     <div className="panel" style={{padding:14}}>
      <b>Conteúdo</b>
      <div style={{marginTop:8,fontSize:13,lineHeight:1.7}}>Marca: {labelProduct.brand||"—"}<br/>Modelo: {labelProduct.model||labelProduct.description}<br/>Código: {labelProduct.barcode||labelProduct.code}<br/>Preço: R$ {Number(labelProduct.salePrice||0).toFixed(2)}<br/>Tamanho: {labelProduct.frameSize||"—"}</div>
     </div>
     <div className="panel" style={{padding:14}}>
      <label style={{display:"block"}}>Quantidade<input type="number" min={1} max={100} value={labelQty} onChange={e=>setLabelQty(Number(e.target.value)||1)} style={{marginTop:6}}/></label>
      <button className="primary" style={{marginTop:10,width:"100%"}} onClick={()=>printLabels(labelProduct,labelQty)}>🖨 Imprimir etiquetas 95 × 12 mm</button>
      <small style={{display:"block",marginTop:8,color:"var(--muted)"}}>A etiqueta é gerada para o produto selecionado. O ajuste final de escala depende da impressora e do driver.</small>
     </div>
    </div>
   </div>
  </div>} </section>;
}
