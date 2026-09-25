"use client";

import {useEffect,useMemo,useState} from "react";

const empty:any={
 code:"",barcode:"",description:"",unit:"UN",cost:"0",salePrice:"0",minimumStock:"0",
 categoryId:"",supplierId:"",ncm:"",cest:"",cfop:"",origin:"0",taxCode:"",
 brand:"",model:"",color:"",frameSize:"",lensWidth:"",bridgeWidth:"",templeLength:"",material:"",frameShape:""
};

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
 const [rows,setRows]=useState<any[]>([]),[cats,setCats]=useState<any[]>([]),[suppliers,setSuppliers]=useState<any[]>([]);
 const [form,setForm]=useState<any>(empty),[selected,setSelected]=useState<any>(null),[open,setOpen]=useState(false),[search,setSearch]=useState(""),[msg,setMsg]=useState(""),[labelQty,setLabelQty]=useState(1),[labelProduct,setLabelProduct]=useState<any>(null);

 const load=async()=>{
  const [p,c,s]=await Promise.all([
   fetch("/api/products").then(r=>r.json()),fetch("/api/categories").then(r=>r.json()),fetch("/api/suppliers").then(r=>r.json())
  ]);
  setRows(Array.isArray(p)?p:[]);setCats(Array.isArray(c)?c:[]);setSuppliers(Array.isArray(s)?s:[]);
 };
 useEffect(()=>{load()},[]);

 const save=async(e:React.FormEvent)=>{
  e.preventDefault();setMsg("");
  const payload={...form,cost:Number(form.cost),salePrice:Number(form.salePrice),minimumStock:Number(form.minimumStock),
   categoryId:form.categoryId||null,supplierId:form.supplierId||null,
   lensWidth:form.lensWidth?Number(form.lensWidth):null,bridgeWidth:form.bridgeWidth?Number(form.bridgeWidth):null,
   templeLength:form.templeLength?Number(form.templeLength):null
  };
  const r=await fetch(selected?"/api/products/"+selected.id:"/api/products",{method:selected?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  const d=await r.json();
  if(!r.ok){setMsg(d.error||"Erro ao salvar");return}
  setOpen(false);setSelected(null);setForm(empty);await load();
 };

 const edit=(p:any)=>{
  setSelected(p);
  setForm({...empty,...p,cost:String(p.cost??0),salePrice:String(p.salePrice??0),minimumStock:String(p.minimumStock??0),
   categoryId:p.categoryId||"",supplierId:p.supplierId||"",lensWidth:p.lensWidth?String(p.lensWidth):"",bridgeWidth:p.bridgeWidth?String(p.bridgeWidth):"",templeLength:p.templeLength?String(p.templeLength):""});
  setOpen(true);
 };

 const filtered=useMemo(()=>rows.filter(p=>(p.code+" "+(p.barcode||"")+" "+p.description+" "+(p.brand||"")+" "+(p.model||"")).toLowerCase().includes(search.toLowerCase())),[rows,search]);
 const low=rows.filter(p=>p.lowStock).length;
 const frames=rows.filter(p=>/armação|oculos|óculos|frame/i.test((p.category?.name||"")+" "+(p.description||""))).length;
 const set=(key:string,value:string)=>setForm((x:any)=>({...x,[key]:value}));

 return <section className="page">
  <div className="page-heading">
   <div><span className="eyebrow">CATÁLOGO</span><h1>Produtos</h1><p>Cadastro, estoque, identificação e etiquetas para a operação da ótica.</p></div>
   <button className="primary" onClick={()=>{setSelected(null);setForm(empty);setOpen(true)}}>+ Novo produto</button>
  </div>

  {msg&&<div className="panel" style={{padding:12,marginBottom:12,color:"#a33"}}>{msg}</div>}

  <div className="stats" style={{marginBottom:12}}>
   <div className="stat-card"><b>{rows.length}</b><span>PRODUTOS ATIVOS</span></div>
   <div className="stat-card"><b>{frames}</b><span>ARMAÇÕES / ÓCULOS</span></div>
   <div className="stat-card"><b>{low}</b><span>ESTOQUE BAIXO</span></div>
   <div className="stat-card"><b>{rows.filter(p=>p.barcode).length}</b><span>COM CÓDIGO DE BARRAS</span></div>
  </div>

  <div className="toolbar">
   <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar código, barras, marca, modelo ou descrição..." />
   <button className="secondary" onClick={()=>setSearch("")}>Limpar</button>
  </div>

  {open&&<div className="panel" style={{padding:20,marginTop:12}}>
   <div className="panel-heading" style={{padding:0,marginBottom:15}}><div><span className="eyebrow">CADASTRO</span><h2>{selected?"Editar produto":"Novo produto"}</h2></div><button className="secondary" onClick={()=>setOpen(false)}>Fechar</button></div>
   <form onSubmit={save}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
     <input placeholder="Código interno" value={form.code} onChange={e=>set("code",e.target.value)} required/>
     <input placeholder="Código de barras" value={form.barcode} onChange={e=>set("barcode",e.target.value)}/>
     <input placeholder="Descrição" value={form.description} onChange={e=>set("description",e.target.value)} required style={{gridColumn:"span 2"}}/>
     <select value={form.categoryId} onChange={e=>set("categoryId",e.target.value)}><option value="">Categoria</option>{cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
     <select value={form.supplierId} onChange={e=>set("supplierId",e.target.value)}><option value="">Fornecedor</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
     <input placeholder="Marca" value={form.brand} onChange={e=>set("brand",e.target.value)}/>
     <input placeholder="Modelo / referência" value={form.model} onChange={e=>set("model",e.target.value)}/>
    </div>

    <div className="panel" style={{padding:12,marginTop:12}}>
     <b>Dados da armação / óculos</b>
     <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginTop:10}}>
      <input placeholder="Cor" value={form.color} onChange={e=>set("color",e.target.value)}/>
      <input placeholder="Tamanho (ex.: 52-18-140)" value={form.frameSize} onChange={e=>set("frameSize",e.target.value)}/>
      <input placeholder="Formato" value={form.frameShape} onChange={e=>set("frameShape",e.target.value)}/>
      <input placeholder="Material" value={form.material} onChange={e=>set("material",e.target.value)}/>
      <input type="number" placeholder="Lente mm" value={form.lensWidth} onChange={e=>set("lensWidth",e.target.value)}/>
      <input type="number" placeholder="Ponte mm" value={form.bridgeWidth} onChange={e=>set("bridgeWidth",e.target.value)}/>
      <input type="number" placeholder="Haste mm" value={form.templeLength} onChange={e=>set("templeLength",e.target.value)}/>
      <input placeholder="Unidade" value={form.unit} onChange={e=>set("unit",e.target.value)}/>
     </div>
     <small style={{display:"block",marginTop:7,color:"var(--muted)"}}>As medidas podem ser cadastradas individualmente ou resumidas no campo Tamanho, por exemplo 52-18-140.</small>
    </div>

    <div className="panel" style={{padding:12,marginTop:12}}>
     <b>Estoque e preços</b>
     <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginTop:10}}>
      <input type="number" step="0.01" placeholder="Custo" value={form.cost} onChange={e=>set("cost",e.target.value)}/>
      <input type="number" step="0.01" placeholder="Preço de venda" value={form.salePrice} onChange={e=>set("salePrice",e.target.value)}/>
      <input type="number" step="0.001" placeholder="Estoque mínimo" value={form.minimumStock} onChange={e=>set("minimumStock",e.target.value)}/>
      <button className="primary" type="submit">Salvar produto</button>
     </div>
    </div>

    <details style={{marginTop:12}}><summary style={{cursor:"pointer",fontWeight:700}}>Dados fiscais</summary>
     <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginTop:10}}>
      <input placeholder="NCM" value={form.ncm} onChange={e=>set("ncm",e.target.value)}/>
      <input placeholder="CEST" value={form.cest} onChange={e=>set("cest",e.target.value)}/>
      <input placeholder="CFOP" value={form.cfop} onChange={e=>set("cfop",e.target.value)}/>
      <input placeholder="Origem fiscal" value={form.origin} onChange={e=>set("origin",e.target.value)}/>
      <input placeholder="Código tributário" value={form.taxCode} onChange={e=>set("taxCode",e.target.value)}/>
     </div>
    </details>
   </form>
  </div>}


  <div className="panel">
   <div className="table">
    <div className="row header"><span>Código</span><span>Produto</span><span>Categoria</span><span>Fornecedor</span><span>Preço</span><span>Estoque</span><span>Ações</span></div>
    {filtered.map(p=><div className="row" key={p.id}>
     <strong>{p.code}</strong>
     <span><b>{p.brand||""}</b>{p.brand?" · ":""}{p.model||p.description}</span>
     <span>{p.category?.name||"—"}</span>
     <span>{p.supplier?.name||"—"}</span>
     <span>R$ {Number(p.salePrice||0).toFixed(2)}</span>
     <span style={{fontWeight:600,color:p.lowStock?"#a33":"inherit"}}>{Number(p.stock||0).toFixed(3)} {p.unit} {p.lowStock?"· baixo":""}</span>
     <span style={{display:"flex",gap:7,flexWrap:"wrap"}}><button className="link-button" onClick={()=>edit(p)}>Editar</button><button className="link-button" onClick={()=>{setLabelProduct(p);setLabelQty(1)}}>🏷 Etiqueta</button></span>
    </div>)}
    {!filtered.length&&<div style={{padding:22,textAlign:"center",color:"var(--muted)"}}>Nenhum produto encontrado.</div>}
   </div>
  </div>

  {labelProduct&&<div className="panel" style={{padding:18,marginTop:12}}>
   <div className="panel-heading" style={{padding:0,marginBottom:12}}><div><span className="eyebrow">ETIQUETA</span><h2>{labelProduct.brand||"MB ÓPTICA"} · {labelProduct.model||labelProduct.description}</h2><p>Modelo estreito para haste. Referência: 95 × 12 mm.</p></div><button className="secondary" onClick={()=>setLabelProduct(null)}>Fechar</button></div>
   <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,alignItems:"center"}}>
    <div className="panel" style={{padding:14}}>
     <b>Conteúdo</b>
     <div style={{marginTop:8,fontSize:13,lineHeight:1.7}}>Marca: {labelProduct.brand||"—"}<br/>Modelo: {labelProduct.model||labelProduct.description}<br/>Código: {labelProduct.barcode||labelProduct.code}<br/>Preço: R$ {Number(labelProduct.salePrice||0).toFixed(2)}<br/>Tamanho: {labelProduct.frameSize||"—"}</div>
    </div>
    <div className="panel" style={{padding:14}}>
     <label style={{display:"block"}}>Quantidade<input type="number" min={1} max={100} value={labelQty} onChange={e=>setLabelQty(Number(e.target.value)||1)} style={{marginTop:6}}/></label>
     <button className="primary" style={{marginTop:10,width:"100%"}} onClick={()=>printLabels(labelProduct,labelQty)}>🖨 Imprimir etiquetas 95 × 12 mm</button>
     <small style={{display:"block",marginTop:8,color:"var(--muted)"}}>O sistema gera uma etiqueta por página no tamanho 95 × 12 mm, adequada para mídia estreita de óculos. O ajuste final de escala depende da impressora e do driver.</small>
    </div>
   </div>
  </div>}
 </section>;
}
