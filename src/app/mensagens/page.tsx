"use client";
import {useEffect,useState} from "react";

type Email={id:string;to?:string[];cc?:string[];from?:string;subject?:string;created_at?:string;text?:string;html?:string;_state?:{read:boolean;archived:boolean;deleted:boolean}};
type Folder="inbox"|"sent"|"archive"|"trash";

const dateBR=(v?:string)=>v?new Date(v).toLocaleString("pt-BR"):"—";

export default function Mensagens(){
  const [folder,setFolder]=useState<Folder>("inbox");
  const [rows,setRows]=useState<Email[]>([]);
  const [selected,setSelected]=useState<Email|null>(null);
  const [body,setBody]=useState<Email|null>(null);
  const [configured,setConfigured]=useState(false);
  const [mbEmail,setMbEmail]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [compose,setCompose]=useState(false);
  const [sending,setSending]=useState(false);
  const [form,setForm]=useState({to:"",subject:"",text:""});
  const [contactType,setContactType]=useState<"clientes"|"fornecedores">("clientes");
  const [contacts,setContacts]=useState<Array<{id:string;name:string;email:string;phone?:string|null}>>([]);
  const [contactSearch,setContactSearch]=useState("");
  const [contactsLoading,setContactsLoading]=useState(false);

  const load=async(nextFolder=folder)=>{
    setLoading(true);setError("");setSelected(null);setBody(null);
    try{
      const r=await fetch("/api/messages?folder="+nextFolder,{cache:"no-store"});
      const d=await r.json();
      setConfigured(Boolean(d.configured));setMbEmail(d.mbEmail||"");setRows(Array.isArray(d.data)?d.data:[]);
      if(d.error)setError(d.error);
    }catch{setError("Não foi possível carregar a caixa de mensagens.");}
    finally{setLoading(false);}
  };
  useEffect(()=>{load(folder)},[folder]);
  const loadContacts=async(type=contactType)=>{
    setContactsLoading(true);
    try{
      const r=await fetch("/api/messages/contacts?type="+type,{cache:"no-store"});
      const d=await r.json();
      setContacts(Array.isArray(d.data)?d.data:[]);
      if(!r.ok)setError(d.error||"Não foi possível carregar os contatos.");
    }catch{setError("Não foi possível carregar os contatos.");}
    finally{setContactsLoading(false);}
  };
  useEffect(()=>{loadContacts(contactType)},[contactType]);
  const filteredContacts=contacts.filter(c=>(c.name+" "+c.email+" "+(c.phone||"")).toLowerCase().includes(contactSearch.toLowerCase()));
  const useContact=(email:string)=>{setForm({...form,to:email});setCompose(true)};

  const action=async(actionName:string,id:string)=>{
    setError("");
    const r=await fetch("/api/messages/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messageId:id,action:actionName})});
    const d=await r.json();
    if(!r.ok){setError(d.error||"Não foi possível executar a ação.");return;}
    await load(folder);
  };

  const open=async(e:Email)=>{
    setSelected(e);setBody(null);
    if(!e._state?.read) await action("read",e.id);
    try{
      const r=await fetch("/api/messages/"+encodeURIComponent(e.id)+"?folder="+folder,{cache:"no-store"});
      const d=await r.json();
      if(r.ok)setBody(d);else setError(d.error||"Não foi possível abrir a mensagem.");
    }catch{setError("Não foi possível abrir a mensagem.");}
  };

  const send=async()=>{
    setSending(true);setError("");
    try{
      const r=await fetch("/api/messages/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Não foi possível enviar.");
      setCompose(false);setForm({to:"",subject:"",text:""});
      setFolder("sent");
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível enviar.");}
    finally{setSending(false);}
  };

  const reply=()=>{
    const from=body?.from||selected?.from||"";
    setForm({to:from,subject:"Re: "+(body?.subject||selected?.subject||""),text:"\n\n--- Mensagem original ---\n"+(body?.text||"")});
    setCompose(true);
  };
  const forward=()=>{
    setForm({to:"",subject:"Fwd: "+(body?.subject||selected?.subject||""),text:"\n\n--- Mensagem encaminhada ---\n"+(body?.text||"")});
    setCompose(true);
  };
  const print=()=>{
    if(!body)return;
    const w=window.open("","_blank","width=900,height=700");
    if(!w)return;
    w.document.write("<html><head><title>"+(body.subject||"E-mail")+"</title></head><body style='font-family:Arial;padding:30px'><h2>"+(body.subject||"(sem assunto)")+"</h2><p><b>De:</b> "+(body.from||"—")+"</p><p><b>Para:</b> "+(body.to||[]).join(", ")+"</p><hr>"+(body.html||("<pre>"+(body.text||"")+"</pre>"))+"</body></html>");
    w.document.close();w.print();
  };

  const title=folder==="inbox"?"Caixa de entrada":folder==="sent"?"Enviados":folder==="archive"?"Arquivados":"Lixeira";

  return <section className="page">
    <div className="page-heading">
      <div><span className="eyebrow">COMUNICAÇÃO</span><h1>Caixa de mensagens</h1><p>Envie, receba e organize os e-mails da MB Óptica diretamente no Gestão.</p></div>
      <div style={{display:"flex",gap:8}}><button className="primary" onClick={()=>{setForm({to:"",subject:"",text:""});setCompose(true)}}>✉ Novo e-mail</button><button className="secondary" onClick={()=>load(folder)}>↻ Atualizar</button></div>
    </div>

    <div className="panel" style={{padding:16,marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",flexWrap:"wrap"}}>
        <div><span className="eyebrow">CAIXA DO USUÁRIO</span><h2 style={{margin:"4px 0"}}>{mbEmail||"E-mail MB não configurado"}</h2><p style={{margin:0,color:"var(--muted)"}}>O endereço definido em Configurações → Usuários e perfis será usado para a caixa e para o envio.</p></div>
        <span className="status-badge">{configured?"Resend conectado":"Aguardando configuração do Resend"}</span>
      </div>
    </div>

    {error&&<div className="panel" style={{padding:12,marginBottom:12}}>{error}</div>}

    <div className="panel" style={{padding:0,overflow:"hidden"}}>
      <div style={{display:"flex",gap:6,padding:10,borderBottom:"1px solid var(--line)",flexWrap:"wrap"}}>
        {([["inbox","📥 Entrada"],["sent","📤 Enviados"],["archive","🗄 Arquivados"],["trash","🗑 Lixeira"]] as [Folder,string][]).map(([id,label])=>(
          <button key={id} className={folder===id?"primary":"secondary"} onClick={()=>setFolder(id)}>{label}</button>
        ))}
      </div>

      {loading && <div style={{padding:24,textAlign:"center",color:"var(--muted)"}}>Carregando {title.toLowerCase()}...</div>}
      {!loading && !configured && <div style={{padding:30,textAlign:"center"}}><h3>Caixa aguardando configuração</h3><p style={{color:"var(--muted)"}}>Configure o Resend para habilitar o envio e recebimento.</p></div>}
      {!loading && configured && rows.length===0 && <div style={{padding:30,textAlign:"center",color:"var(--muted)"}}>Nenhuma mensagem em {title.toLowerCase()}.</div>}

      {!loading && configured && rows.length>0 && (
        <div style={{display:"grid",gridTemplateColumns:"minmax(320px,1fr) 1.5fr",minHeight:500}}>
          <div style={{borderRight:"1px solid var(--line)",overflowY:"auto"}}>
            {rows.map(e=>(
              <button key={e.id} onClick={()=>open(e)} style={{display:"block",width:"100%",textAlign:"left",padding:14,border:0,borderBottom:"1px solid var(--line)",background:selected?.id===e.id?"var(--surface-soft)":"transparent",cursor:"pointer",fontWeight:e._state?.read?400:700}}>
                <strong>{e.subject||"(sem assunto)"}</strong>
                <div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>{folder==="sent"?"Para: ":"De: "}{folder==="sent"?(e.to||[]).join(", "):(e.from||"Remetente desconhecido")}</div>
                <div style={{fontSize:10,color:"var(--muted)",marginTop:3}}>{dateBR(e.created_at)}</div>
              </button>
            ))}
          </div>
          <div style={{padding:20}}>
            {!selected && <div style={{height:"100%",display:"grid",placeItems:"center",color:"var(--muted)"}}>Selecione uma mensagem.</div>}
            {selected && (
              <>
                <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"flex-start"}}>
                  <div>
                    <span className="eyebrow">MENSAGEM</span>
                    <h2 style={{margin:"5px 0"}}>{body?.subject||selected.subject||"(sem assunto)"}</h2>
                    <p style={{margin:"4px 0",color:"var(--muted)"}}>De: {body?.from||selected.from||"—"}</p>
                    <p style={{margin:"4px 0",color:"var(--muted)"}}>Para: {(body?.to||selected.to||[]).join(", ")}</p>
                    <p style={{margin:"4px 0 14px",color:"var(--muted)"}}>{dateBR(body?.created_at||selected.created_at)}</p>
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    {folder!=="sent" && (
                      <>
                        <button className="secondary" title="Responder" onClick={reply}>↩ Responder</button>
                        <button className="secondary" title="Encaminhar" onClick={forward}>↪ Encaminhar</button>
                      </>
                    )}
                    <button className="secondary" onClick={print}>🖨 Imprimir</button>
                    {folder==="archive" ? (
                      <button className="secondary" onClick={()=>action("unarchive",selected.id)}>Desarquivar</button>
                    ) : folder==="trash" ? (
                      <button className="secondary" onClick={()=>action("restore",selected.id)}>Restaurar</button>
                    ) : (
                      <>
                        <button className="secondary" onClick={()=>action("archive",selected.id)}>🗄 Arquivar</button>
                        <button className="secondary" onClick={()=>action("delete",selected.id)}>🗑 Excluir</button>
                      </>
                    )}
                  </div>
                </div>
                {body?.html ? (
                  <iframe title="Conteúdo do e-mail" sandbox="" style={{width:"100%",height:330,border:"1px solid var(--line)",borderRadius:8}} srcDoc={body.html}/>
                ) : (
                  <div style={{whiteSpace:"pre-wrap",padding:14,border:"1px solid var(--line)",borderRadius:8,minHeight:220}}>{body?.text||"Carregando conteúdo..."}</div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>

    <div className="panel" style={{padding:16,marginTop:12}}>
      <div className="panel-heading" style={{padding:0,marginBottom:12}}>
        <div><span className="eyebrow">CONTATOS</span><h2 style={{margin:"4px 0"}}>Lista de contatos</h2><p style={{margin:0,color:"var(--muted)"}}>E-mails cadastrados no MB Gestão. Somente registros com e-mail são exibidos.</p></div>
        <button className="secondary" onClick={()=>loadContacts(contactType)}>↻ Atualizar</button>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:10}}>
        <button className={contactType==="clientes"?"primary":"secondary"} onClick={()=>{setContactType("clientes");setContactSearch("")}}>👥 Clientes</button>
        <button className={contactType==="fornecedores"?"primary":"secondary"} onClick={()=>{setContactType("fornecedores");setContactSearch("")}}>🏢 Fornecedores</button>
      </div>
      <input value={contactSearch} onChange={e=>setContactSearch(e.target.value)} placeholder={contactType==="clientes"?"Buscar cliente ou e-mail...":"Buscar fornecedor ou e-mail..."} style={{marginBottom:10}} />
      {contactsLoading?<div style={{padding:18,textAlign:"center",color:"var(--muted)"}}>Carregando contatos...</div>:filteredContacts.length===0?<div style={{padding:18,textAlign:"center",color:"var(--muted)"}}>Nenhum {contactType==="clientes"?"cliente":"fornecedor"} com e-mail cadastrado encontrado.</div>:
        <div className="table">
          <div className="row header"><span>Nome</span><span>E-mail</span><span>Telefone</span><span></span></div>
          {filteredContacts.map(c=><div className="row" key={c.id}><strong>{c.name}</strong><span>{c.email}</span><span>{c.phone||"—"}</span><button className="link-button" onClick={()=>useContact(c.email)}>Usar e-mail</button></div>)}
        </div>}
    </div>

    {compose&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.35)",display:"grid",placeItems:"center",zIndex:50,padding:20}}><div className="panel" style={{width:"min(720px,100%)",padding:20}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><span className="eyebrow">NOVA MENSAGEM</span><h2 style={{margin:"4px 0 14px"}}>Enviar e-mail</h2></div><button className="secondary" onClick={()=>setCompose(false)}>✕</button></div><label>Para<input type="email" value={form.to} onChange={e=>setForm({...form,to:e.target.value})} placeholder="destinatario@exemplo.com"/></label><label>Assunto<input value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})}/></label><label>Mensagem<textarea rows={10} value={form.text} onChange={e=>setForm({...form,text:e.target.value})}/></label><div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:12}}><button className="secondary" onClick={()=>setCompose(false)}>Cancelar</button><button className="primary" disabled={sending} onClick={send}>{sending?"Enviando...":"✈ Enviar"}</button></div></div></div>}
  </section>;
}
