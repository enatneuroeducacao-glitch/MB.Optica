"use client";
import {useEffect,useMemo,useRef,useState} from "react";

type Attachment={id?:string;filename?:string|null;content_type?:string;size?:number;download_url?:string;expires_at?:string};
type Email={
  id:string;to?:string[];cc?:string[];bcc?:string[];from?:string;subject?:string;created_at?:string;
  text?:string|null;html?:string|null;message_id?:string;attachments?:Attachment[];
  _state?:{read:boolean;archived:boolean;deleted:boolean}
};
type Folder="inbox"|"unread"|"sent"|"archive"|"trash";
type Contact={id:string;name:string;email:string;phone?:string|null};

const dateBR=(v?:string)=>v?new Date(v).toLocaleString("pt-BR"):"—";
const bytes=(n=0)=>n<1024?n+" B":n<1024*1024?(n/1024).toFixed(1)+" KB":(n/1024/1024).toFixed(1)+" MB";
const addressList=(v:string)=>v.split(/[;,\\n]+/).map(x=>x.trim()).filter(Boolean);

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
  const [form,setForm]=useState({to:"",cc:"",bcc:"",subject:"",text:"",replyTo:"",replyMessageId:""});
  const [files,setFiles]=useState<File[]>([]);
  const [search,setSearch]=useState("");
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [contactType,setContactType]=useState<"clientes"|"fornecedores">("clientes");
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [contactSearch,setContactSearch]=useState("");
  const [contactsLoading,setContactsLoading]=useState(false);
  const fileRef=useRef<HTMLInputElement|null>(null);

  const load=async(nextFolder=folder)=>{
    setLoading(true);setError("");setSelected(null);setBody(null);setSelectedIds([]);
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
  const filteredRows=useMemo(()=>{
    const q=search.trim().toLowerCase();
    const base=folder==="unread"?rows.filter(e=>!e._state?.read):rows;
    if(!q)return base;
    return base.filter(e=>[e.subject,e.from,...(e.to||[]),...(e.cc||[]),e.text].filter(Boolean).join(" ").toLowerCase().includes(q));
  },[rows,search,folder]);

  const resetCompose=()=>{setForm({to:"",cc:"",bcc:"",subject:"",text:"",replyTo:"",replyMessageId:""});setFiles([])};
  const useContact=(email:string)=>{setForm(f=>({...f,to:f.to?f.to+", "+email:email}));setCompose(true)};
  const addFiles=(incoming:FileList|File[])=>{
    const next=[...files,...Array.from(incoming)];
    const unique=next.filter((f,i,a)=>a.findIndex(x=>x.name===f.name&&x.size===f.size&&x.lastModified===f.lastModified)===i);
    const total=unique.reduce((s,f)=>s+f.size,0);
    if(unique.length>10){setError("Máximo de 10 anexos por e-mail.");return}
    if(unique.some(f=>f.size>10*1024*1024)){setError("Cada anexo pode ter no máximo 10 MB.");return}
    if(total>30*1024*1024){setError("O total dos anexos não pode ultrapassar 30 MB.");return}
    setError("");setFiles(unique);
  };

  const action=async(actionName:string,id:string,refresh=true)=>{
    const r=await fetch("/api/messages/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messageId:id,action:actionName})});
    const d=await r.json();
    if(!r.ok){setError(d.error||"Não foi possível executar a ação.");return false}
    if(refresh)await load(folder);
    return true;
  };

  const bulkAction=async(actionName:string)=>{
    if(!selectedIds.length)return;
    setError("");
    for(const id of selectedIds)await action(actionName,id,false);
    await load(folder);
  };

  const open=async(e:Email)=>{
    setSelected(e);setBody(null);
    if(!e._state?.read)await action("read",e.id,false);
    try{
      const r=await fetch("/api/messages/"+encodeURIComponent(e.id)+"?folder="+(folder==="unread"?"inbox":folder),{cache:"no-store"});
      const d=await r.json();
      if(r.ok){setSelected(e);setBody(d)}
      else setError(d.error||"Não foi possível abrir a mensagem.");
    }catch{setError("Não foi possível abrir a mensagem.");}
  };

  const send=async()=>{
    if(!addressList(form.to).length){setError("Informe pelo menos um destinatário em Para.");return}
    setSending(true);setError("");
    try{
      const fd=new FormData();
      Object.entries(form).forEach(([k,v])=>{if(v)fd.append(k,v)});
      files.forEach(f=>fd.append("attachments",f,f.name));
      const r=await fetch("/api/messages/send",{method:"POST",body:fd});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"Não foi possível enviar.");
      setCompose(false);resetCompose();setFolder("sent");
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível enviar.")}
    finally{setSending(false)}
  };

  const reply=()=>{
    const from=body?.from||selected?.from||"";
    setForm({to:from,cc:"",bcc:"",subject:"Re: "+(body?.subject||selected?.subject||""),text:"\n\n--- Mensagem original ---\n"+(body?.text||""),replyTo:from,replyMessageId:body?.message_id||selected?.message_id||""});
    setFiles([]);setCompose(true);
  };
  const replyAll=()=>{
    const from=body?.from||selected?.from||"";
    const all=[...((body?.cc||selected?.cc||[])),...((body?.to||selected?.to||[]))].filter(x=>x.toLowerCase()!==mbEmail.toLowerCase()&&x.toLowerCase()!==from.toLowerCase());
    setForm({to:from,cc:[...new Set(all)].join(", "),bcc:"",subject:"Re: "+(body?.subject||selected?.subject||""),text:"\n\n--- Mensagem original ---\n"+(body?.text||""),replyTo:from,replyMessageId:body?.message_id||selected?.message_id||""});
    setFiles([]);setCompose(true);
  };
  const forward=()=>{
    setForm({to:"",cc:"",bcc:"",subject:"Fwd: "+(body?.subject||selected?.subject||""),text:"\n\n--- Mensagem encaminhada ---\n"+(body?.text||""),replyTo:mbEmail,replyMessageId:""});
    setFiles([]);setCompose(true);
  };
  const print=()=>{
    if(!body)return;
    const w=window.open("","_blank","width=900,height=700");if(!w)return;
    w.document.write("<html><head><title>"+(body.subject||"E-mail")+"</title></head><body style='font-family:Arial;padding:30px'><h2>"+(body.subject||"(sem assunto)")+"</h2><p><b>De:</b> "+(body.from||"—")+"</p><p><b>Para:</b> "+(body.to||[]).join(", ")+"</p><p><b>Data:</b> "+dateBR(body.created_at)+"</p><hr>"+(body.html||("<pre>"+(body.text||"")+"</pre>"))+"</body></html>");
    w.document.close();w.print();
  };

  const title=folder==="inbox"?"Caixa de entrada":folder==="unread"?"Não lidos":folder==="sent"?"Enviados":folder==="archive"?"Arquivados":"Lixeira";
  const selectedCount=selectedIds.length;
  const toggleAll=()=>setSelectedIds(selectedCount===filteredRows.length?[]:filteredRows.map(e=>e.id));
  const toggleOne=(id:string)=>setSelectedIds(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id]);

  return <section className="page">
    <div className="page-heading">
      <div><span className="eyebrow">COMUNICAÇÃO PROFISSIONAL</span><h1>Caixa de e-mail</h1><p>Central de comunicação comercial da MB Óptica, integrada ao Resend.</p></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="primary" onClick={()=>{resetCompose();setCompose(true)}}>✉ Novo e-mail</button><button className="secondary" onClick={()=>load(folder)}>↻ Atualizar</button></div>
    </div>

    <div className="panel" style={{padding:16,marginBottom:12}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",flexWrap:"wrap"}}>
        <div><span className="eyebrow">CAIXA DO USUÁRIO</span><h2 style={{margin:"4px 0"}}>{mbEmail||"E-mail MB não configurado"}</h2><p style={{margin:0,color:"var(--muted)"}}>O endereço MB do usuário é usado como remetente e identidade da caixa.</p></div>
        <span className="status-badge">{configured?"● Resend conectado":"Aguardando configuração do Resend"}</span>
      </div>
    </div>

    {error&&<div className="panel" style={{padding:12,marginBottom:12}}>{error}</div>}

    <div className="panel" style={{padding:0,overflow:"hidden"}}>
      <div style={{display:"flex",gap:6,padding:10,borderBottom:"1px solid var(--line)",flexWrap:"wrap"}}>
        {([[ "inbox","📥 Entrada"],["unread","🔵 Não lidos"],["sent","📤 Enviados"],["archive","🗄 Arquivados"],["trash","🗑 Lixeira"]] as [Folder,string][]).map(([id,label])=><button key={id} className={folder===id?"primary":"secondary"} onClick={()=>setFolder(id)}>{label}</button>)}
      </div>

      <div style={{padding:10,borderBottom:"1px solid var(--line)",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar remetente, destinatário, assunto ou conteúdo..." style={{flex:1,minWidth:260,margin:0}}/>
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:13}}><input type="checkbox" checked={selectedCount>0&&selectedCount===filteredRows.length} onChange={toggleAll}/> Selecionar</label>
        {selectedCount>0&&<><span style={{fontSize:12,color:"var(--muted)"}}>{selectedCount} selecionado(s)</span><button className="secondary" onClick={()=>bulkAction("read")}>✓ Lido</button><button className="secondary" onClick={()=>bulkAction("unread")}>● Não lido</button>{folder!=="archive"&&folder!=="trash"&&<button className="secondary" onClick={()=>bulkAction("archive")}>🗄 Arquivar</button>}{folder!=="trash"&&<button className="secondary" onClick={()=>bulkAction("delete")}>🗑 Excluir</button>}</>}
      </div>

      {loading&&<div style={{padding:24,textAlign:"center",color:"var(--muted)"}}>Carregando {title.toLowerCase()}...</div>}
      {!loading&&!configured&&<div style={{padding:30,textAlign:"center"}}><h3>Caixa aguardando configuração</h3><p style={{color:"var(--muted)"}}>Configure o Resend para habilitar envio e recebimento.</p></div>}
      {!loading&&configured&&filteredRows.length===0&&<div style={{padding:30,textAlign:"center",color:"var(--muted)"}}>Nenhuma mensagem em {title.toLowerCase()}.</div>}

      {!loading&&configured&&filteredRows.length>0&&<div style={{display:"grid",gridTemplateColumns:"minmax(320px,1fr) 1.55fr",minHeight:560}}>
        <div style={{borderRight:"1px solid var(--line)",overflowY:"auto"}}>
          {filteredRows.map(e=><div key={e.id} style={{display:"grid",gridTemplateColumns:"30px 1fr",borderBottom:"1px solid var(--line)",background:selected?.id===e.id?"var(--surface-soft)":"transparent"}}>
            <label style={{padding:"14px 4px 0 10px"}}><input type="checkbox" checked={selectedIds.includes(e.id)} onChange={()=>toggleOne(e.id)}/></label>
            <button onClick={()=>open(e)} style={{display:"block",width:"100%",textAlign:"left",padding:"14px 14px 14px 4px",border:0,background:"transparent",cursor:"pointer",fontWeight:e._state?.read?400:700}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:8}}><strong style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.subject||"(sem assunto)"}</strong>{e.attachments?.length?<span title="Com anexo">📎</span>:null}</div>
              <div style={{fontSize:11,color:"var(--muted)",marginTop:4}}>{folder==="sent"?"Para: ":"De: "}{folder==="sent"?(e.to||[]).join(", "):(e.from||"Remetente desconhecido")}</div>
              <div style={{fontSize:10,color:"var(--muted)",marginTop:3}}>{dateBR(e.created_at)}</div>
            </button>
          </div>)}
        </div>

        <div style={{padding:20,overflowY:"auto"}}>
          {!selected&&<div style={{height:"100%",display:"grid",placeItems:"center",color:"var(--muted)"}}>Selecione uma mensagem para ler.</div>}
          {selected&&<><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",flexWrap:"wrap"}}>
            <div><span className="eyebrow">MENSAGEM</span><h2 style={{margin:"5px 0"}}>{body?.subject||selected.subject||"(sem assunto)"}</h2><p style={{margin:"4px 0",color:"var(--muted)"}}>De: {body?.from||selected.from||"—"}</p><p style={{margin:"4px 0",color:"var(--muted)"}}>Para: {(body?.to||selected.to||[]).join(", ")||"—"}</p>{(body?.cc||selected.cc||[]).length>0&&<p style={{margin:"4px 0",color:"var(--muted)"}}>Cc: {(body?.cc||selected.cc||[]).join(", ")}</p>}<p style={{margin:"4px 0 14px",color:"var(--muted)"}}>{dateBR(body?.created_at||selected.created_at)}</p></div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
              {folder!=="sent"&&<><button className="secondary" onClick={reply}>↩ Responder</button><button className="secondary" onClick={replyAll}>↩↩ Responder a todos</button><button className="secondary" onClick={forward}>↪ Encaminhar</button></>}
              {folder==="sent"&&<button className="secondary" onClick={forward}>↪ Encaminhar</button>}
              <button className="secondary" onClick={()=>action(selected._state?.read?"unread":"read",selected.id)}> {selected._state?.read?"● Não lido":"✓ Marcar lido"}</button>
              <button className="secondary" onClick={print}>🖨 Imprimir</button>
              {folder==="archive"?<button className="secondary" onClick={()=>action("unarchive",selected.id)}>Desarquivar</button>:folder==="trash"?<button className="secondary" onClick={()=>action("restore",selected.id)}>Restaurar</button>:<><button className="secondary" onClick={()=>action("archive",selected.id)}>🗄 Arquivar</button><button className="secondary" onClick={()=>action("delete",selected.id)}>🗑 Excluir</button></>}
            </div>
          </div>

          {body?.attachments&&body.attachments.length>0&&<div style={{display:"flex",gap:8,flexWrap:"wrap",padding:"12px 0"}}>{body.attachments.map((a,i)=><a key={a.id||i} href={a.download_url||"#"} target="_blank" rel="noreferrer" download style={{border:"1px solid var(--line)",borderRadius:8,padding:"8px 10px",textDecoration:"none",color:"inherit",display:"inline-flex",gap:8,alignItems:"center"}}>📎 <span><strong>{a.filename||"Anexo"}</strong><small style={{display:"block",color:"var(--muted)"}}>{a.content_type||"arquivo"}{a.size?" · "+bytes(a.size):""}</small></span></a>)}</div>}

          {body?.html?<iframe title="Conteúdo do e-mail" sandbox="" style={{width:"100%",height:380,border:"1px solid var(--line)",borderRadius:8}} srcDoc={body.html}/>:<div style={{whiteSpace:"pre-wrap",padding:14,border:"1px solid var(--line)",borderRadius:8,minHeight:220}}>{body?.text||"Carregando conteúdo..."}</div>}
          </>}
        </div>
      </div>}
    </div>

    <div className="panel" style={{padding:16,marginTop:12}}>
      <div className="panel-heading" style={{padding:0,marginBottom:12}}><div><span className="eyebrow">CONTATOS</span><h2 style={{margin:"4px 0"}}>Clientes e fornecedores</h2><p style={{margin:0,color:"var(--muted)"}}>Use os e-mails cadastrados no MB Gestão sem precisar digitá-los.</p></div><button className="secondary" onClick={()=>loadContacts(contactType)}>↻ Atualizar</button></div>
      <div style={{display:"flex",gap:6,marginBottom:10}}><button className={contactType==="clientes"?"primary":"secondary"} onClick={()=>{setContactType("clientes");setContactSearch("")}}>👥 Clientes</button><button className={contactType==="fornecedores"?"primary":"secondary"} onClick={()=>{setContactType("fornecedores");setContactSearch("")}}>🏢 Fornecedores</button></div>
      <input value={contactSearch} onChange={e=>setContactSearch(e.target.value)} placeholder="Buscar nome ou e-mail..." style={{marginBottom:10}}/>
      {contactsLoading?<div style={{padding:18,textAlign:"center",color:"var(--muted)"}}>Carregando contatos...</div>:filteredContacts.length===0?<div style={{padding:18,textAlign:"center",color:"var(--muted)"}}>Nenhum contato com e-mail cadastrado encontrado.</div>:<div className="table"><div className="row header"><span>Nome</span><span>E-mail</span><span>Telefone</span><span></span></div>{filteredContacts.map(c=><div className="row" key={c.id}><strong>{c.name}</strong><span>{c.email}</span><span>{c.phone||"—"}</span><button className="link-button" onClick={()=>useContact(c.email)}>Usar e-mail</button></div>)}</div>}
    </div>

    {compose&&<div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.58)",backdropFilter:"blur(4px)",display:"grid",placeItems:"center",zIndex:50,padding:16}}>
      <div className="panel" style={{width:"min(860px,100%)",maxHeight:"94vh",overflowY:"auto",padding:0,borderRadius:18,boxShadow:"0 24px 70px rgba(0,0,0,.24)"}}>
        <div style={{padding:"20px 24px 18px",borderBottom:"1px solid var(--line)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,background:"linear-gradient(135deg,var(--surface-soft),var(--surface))"}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:44,height:44,borderRadius:12,display:"grid",placeItems:"center",background:"var(--primary)",color:"#fff",fontSize:20}}>✉</div>
            <div><span className="eyebrow">COMUNICAÇÃO MB ÓPTICA</span><h2 style={{margin:"3px 0 0",fontSize:22}}>Novo e-mail</h2><div style={{fontSize:12,color:"var(--muted)",marginTop:3}}>Mensagem profissional · envio pelo endereço MB</div></div>
          </div>
          <button className="secondary" aria-label="Fechar" onClick={()=>setCompose(false)} style={{width:38,height:38,borderRadius:10,fontSize:18}}>✕</button>
        </div>

        <div style={{padding:"20px 24px"}}>
          <div style={{border:"1px solid var(--line)",borderRadius:14,overflow:"hidden",background:"var(--surface)"}}>
            <div style={{display:"grid",gridTemplateColumns:"72px 1fr",alignItems:"center",borderBottom:"1px solid var(--line)"}}>
              <span style={{padding:"12px 14px",fontSize:13,fontWeight:700,color:"var(--muted)"}}>PARA</span>
              <input value={form.to} onChange={e=>setForm({...form,to:e.target.value})} placeholder="cliente@exemplo.com, outro@exemplo.com" style={{border:0,borderRadius:0,margin:0,boxShadow:"none"}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"72px 1fr 72px 1fr",alignItems:"center",borderBottom:"1px solid var(--line)"}}>
              <span style={{padding:"12px 14px",fontSize:13,fontWeight:700,color:"var(--muted)"}}>CC</span>
              <input value={form.cc} onChange={e=>setForm({...form,cc:e.target.value})} placeholder="Opcional" style={{border:0,borderRadius:0,margin:0,boxShadow:"none"}}/>
              <span style={{padding:"12px 14px",fontSize:13,fontWeight:700,color:"var(--muted)"}}>CCO</span>
              <input value={form.bcc} onChange={e=>setForm({...form,bcc:e.target.value})} placeholder="Opcional" style={{border:0,borderRadius:0,margin:0,boxShadow:"none"}}/>
            </div>
            <div style={{padding:"10px 14px 12px",borderTop:"1px solid var(--line)"}}>
              <div style={{fontSize:12,fontWeight:700,color:"var(--muted)",marginBottom:5}}>ASSUNTO</div>
              <input value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})} placeholder="Assunto da mensagem" style={{display:"block",width:"100%",boxSizing:"border-box",border:"1px solid var(--line)",borderRadius:8,margin:0,boxShadow:"none",minWidth:0}}/>
            </div>
          </div>

          <div style={{marginTop:14}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}><span style={{fontSize:13,fontWeight:700,color:"var(--muted)"}}>MENSAGEM</span><span style={{height:1,background:"var(--line)",flex:1}}/></div>
            <textarea rows={11} value={form.text} onChange={e=>setForm({...form,text:e.target.value})} placeholder="Escreva sua mensagem..." style={{minHeight:230,resize:"vertical",borderRadius:14,padding:14}}/>
          </div>

          <div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addFiles(e.dataTransfer.files)}} style={{border:"1px dashed var(--line)",borderRadius:14,padding:14,marginTop:14,background:"var(--surface-soft)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:38,height:38,borderRadius:10,display:"grid",placeItems:"center",background:"var(--surface)",border:"1px solid var(--line)"}}>📎</div>
                <div><strong style={{display:"block"}}>Anexos</strong><span style={{fontSize:12,color:"var(--muted)"}}>Arraste arquivos aqui ou selecione no computador · até 10 MB por arquivo</span></div>
              </div>
              <button className="secondary" type="button" onClick={()=>fileRef.current?.click()}>＋ Adicionar arquivos</button>
            </div>
            <input ref={fileRef} type="file" multiple style={{display:"none"}} onChange={e=>{if(e.target.files)addFiles(e.target.files);e.currentTarget.value=""}}/>
            {files.length>0&&<div style={{display:"grid",gap:7,marginTop:12}}>
              {files.map((f,i)=><div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"9px 10px",borderRadius:10,background:"var(--surface)",border:"1px solid var(--line)"}}>
                <div style={{display:"flex",alignItems:"center",gap:9,minWidth:0}}><span>📄</span><div style={{minWidth:0}}><strong style={{display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</strong><small style={{color:"var(--muted)"}}>{bytes(f.size)}</small></div></div>
                <button type="button" className="secondary" aria-label={"Remover "+f.name} onClick={()=>setFiles(files.filter((_,n)=>n!==i))} style={{padding:"5px 9px"}}>✕</button>
              </div>)}
            </div>}
            <div style={{fontSize:11,color:"var(--muted)",marginTop:9}}>Máximo de 10 arquivos · 30 MB no total.</div>
          </div>
        </div>

        <div style={{padding:"14px 24px 18px",borderTop:"1px solid var(--line)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",background:"var(--surface-soft)"}}>
          <div style={{fontSize:12,color:"var(--muted)"}}>Remetente: <strong>{mbEmail||"E-mail MB não configurado"}</strong></div>
          <div style={{display:"flex",gap:8}}>
            <button className="secondary" onClick={()=>setCompose(false)}>Cancelar</button>
            <button className="primary" disabled={sending} onClick={send} style={{minWidth:112}}>{sending?"Enviando...":"✈ Enviar e-mail"}</button>
          </div>
        </div>
      </div>
    </div>}
  </section>;
}
