"use client";
import {useEffect,useState} from "react";

type Email={id:string;to?:string[];from?:string;subject?:string;created_at?:string;attachments?:any[]};

const dateBR=(v?:string)=>v?new Date(v).toLocaleString("pt-BR"):"—";

export default function Mensagens(){
  const [rows,setRows]=useState<Email[]>([]);
  const [selected,setSelected]=useState<Email|null>(null);
  const [body,setBody]=useState<any>(null);
  const [configured,setConfigured]=useState(false);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);

  const load=async()=>{
    setLoading(true);setError("");
    try{
      const r=await fetch("/api/messages",{cache:"no-store"});
      const d=await r.json();
      setConfigured(Boolean(d.configured));
      setRows(Array.isArray(d.data)?d.data:[]);
      if(d.error)setError(d.error);
    }catch{setError("Não foi possível carregar a caixa de mensagens.")}
    finally{setLoading(false)}
  };
  useEffect(()=>{load()},[]);

  const open=async(e:Email)=>{
    setSelected(e);setBody(null);
    try{
      const r=await fetch("/api/messages/"+encodeURIComponent(e.id),{cache:"no-store"});
      const d=await r.json();if(r.ok)setBody(d);else setError(d.error||"Não foi possível abrir a mensagem.");
    }catch{setError("Não foi possível abrir a mensagem.")}
  };

  return <section className="page">
    <div className="page-heading">
      <div><span className="eyebrow">COMUNICAÇÃO</span><h1>Caixa de mensagens</h1><p>Receba e acompanhe os e-mails da MB Óptica diretamente no Gestão.</p></div>
      <div style={{display:"flex",gap:8}}><button className="secondary" onClick={load}>↻ Atualizar</button></div>
    </div>

    <div className="panel" style={{padding:16,marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",flexWrap:"wrap"}}>
        <div><span className="eyebrow">CAIXA DE ENTRADA</span><h2 style={{margin:"4px 0"}}>nome@mboptica.com.br</h2><p style={{margin:0,color:"var(--muted)"}}>Endereço planejado para receber mensagens no MB Gestão via Resend.</p></div>
        <span className="status-badge">{configured?"Resend conectado":"Aguardando configuração do Resend"}</span>
      </div>
    </div>

    {error&&<div className="panel" style={{padding:12,marginBottom:12}}>{error}</div>}

    <div className="panel" style={{padding:0,overflow:"hidden"}}>
      {loading?<div style={{padding:24,textAlign:"center",color:"var(--muted)"}}>Carregando mensagens...</div>:
      !configured?<div style={{padding:30,textAlign:"center"}}><h3>Caixa criada, integração pendente</h3><p style={{color:"var(--muted)",maxWidth:620,margin:"8px auto"}}>O menu e a caixa já estão prontos. Falta configurar a chave da Resend no Render e habilitar o recebimento do domínio para que os e-mails apareçam aqui.</p></div>:
      rows.length===0?<div style={{padding:30,textAlign:"center",color:"var(--muted)"}}>Nenhuma mensagem recebida.</div>:
      <div style={{display:"grid",gridTemplateColumns:"minmax(360px,1fr) 1.5fr",minHeight:460}}>
        <div style={{borderRight:"1px solid var(--line)"}}>{rows.map(e=><button key={e.id} onClick={()=>open(e)} style={{display:"block",width:"100%",textAlign:"left",padding:14,border:0,borderBottom:"1px solid var(--line)",background:selected?.id===e.id?"var(--surface-soft)":"transparent",cursor:"pointer"}}><strong>{e.subject||"(sem assunto)"}</strong><div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>{e.from||"Remetente desconhecido"}</div><div style={{fontSize:10,color:"var(--muted)",marginTop:3}}>{dateBR(e.created_at)}</div></button>)}</div>
        <div style={{padding:20}}>{!selected?<div style={{height:"100%",display:"grid",placeItems:"center",color:"var(--muted)"}}>Selecione uma mensagem.</div>:<><div><span className="eyebrow">MENSAGEM</span><h2 style={{margin:"5px 0"}}>{body?.subject||selected.subject||"(sem assunto)"}</h2><p style={{margin:"4px 0",color:"var(--muted)"}}>De: {body?.from||selected.from||"—"}</p><p style={{margin:"4px 0",color:"var(--muted)"}}>Para: {(body?.to||selected.to||[]).join(", ")}</p><p style={{margin:"4px 0 14px",color:"var(--muted)"}}>{dateBR(body?.created_at||selected.created_at)}</p></div>{body?.html?<iframe title="Conteúdo do e-mail" sandbox="" style={{width:"100%",height:320,border:"1px solid var(--line)",borderRadius:8}} srcDoc={body.html}/>:<div style={{whiteSpace:"pre-wrap",padding:14,border:"1px solid var(--line)",borderRadius:8}}>{body?.text||"Carregando conteúdo..."}</div>}</>}</div>
      </div>}
    </div>
  </section>;
}
