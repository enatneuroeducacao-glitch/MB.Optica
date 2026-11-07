"use client";
import {useEffect,useMemo,useState} from "react";
import {useRealtimeRefresh} from "@/lib/use-realtime-refresh";

type Customer={id:string;name:string;cpfCnpj?:string|null;phone?:string|null;email?:string|null;birthDate?:string|null};
type BirthdayEntry={id:string;name:string;birthDate:string;customerId?:string|null;customer?:{id:string;name:string}|null;notes?:string|null};
type Appointment={id:string;type:string;professionalType:string;professionalName:string;scheduledAt:string;status:string;notes?:string|null;customer:Customer};

const empty={customerId:"",type:"EXAME",professionalType:"OFTALMOLOGISTA",professionalName:"",scheduledAt:"",status:"AGENDADO",notes:""};

function easterSunday(year:number){
 const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
 return new Date(year,month-1,day);
}
function getHolidays(year:number){
 const fixed=[["01-01","Confraternização Universal"],["04-21","Tiradentes"],["05-01","Dia do Trabalho"],["09-07","Independência do Brasil"],["10-12","Nossa Senhora Aparecida"],["11-02","Finados"],["11-15","Proclamação da República"],["11-20","Dia Nacional de Zumbi e da Consciência Negra"],["12-25","Natal"]];
 const result=fixed.map(([date,name])=>({date:new Date(year,Number(date.slice(0,2))-1,Number(date.slice(3,5))),name,kind:"Feriado nacional"}));
 const easter=easterSunday(year);const goodFriday=new Date(easter);goodFriday.setDate(easter.getDate()-2);
 result.push({date:goodFriday,name:"Paixão de Cristo",kind:"Feriado nacional"});
 return result;
}


export default function Agenda(){
 const [customers,setCustomers]=useState<Customer[]>([]);
 const [rows,setRows]=useState<Appointment[]>([]);
 const [birthdayData,setBirthdayData]=useState<{customers:BirthdayEntry[];reminders:BirthdayEntry[]}>({customers:[],reminders:[]});
 const [birthdayFormOpen,setBirthdayFormOpen]=useState(false);
 const [birthdayName,setBirthdayName]=useState("");
 const [birthdayDate,setBirthdayDate]=useState("");
 const [birthdayCustomerId,setBirthdayCustomerId]=useState("");
 const [birthdayNotes,setBirthdayNotes]=useState("");
 const [form,setForm]=useState(empty);
 const [search,setSearch]=useState("");
 const [customerSearch,setCustomerSearch]=useState("");
 const [open,setOpen]=useState(false);
 const [msg,setMsg]=useState("");
 useEffect(()=>{if(!msg)return;const text=msg.trim();const lower=text.toLocaleLowerCase("pt-BR");const kind=/(não foi possível|falha|erro|inválid|obrigatório|selecione|informe|não encontrado|bloqueou|não confirmou|não foi registrado)/i.test(text)?"error":/(sucesso|atualizad|criad|registrad|concluíd|confirmad|salvo|arquivado|excluído|aberto|fechado)/i.test(text)?"success":"info";const href=/sessão|acesso|permissão/i.test(lower)?"/configuracoes":"/agenda";window.dispatchEvent(new CustomEvent("mb:notice",{detail:{title:kind==="error"?"Não foi possível concluir a operação — Agenda":kind==="success"?"Agenda — operação concluída":"Informação — Agenda",detail:text,kind,actionHref:kind==="error"?href:undefined,actionLabel:kind==="error"?(href==="/configuracoes"?"Verificar acesso e permissões":"Abrir agenda em nova aba"):undefined,code:kind==="error"?"AGENDA_OPERATION":undefined}}));setMsg("");},[msg]);

 const [calendarMonth,setCalendarMonth]=useState(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1)});
 const calendarDays=useMemo(()=>{
  const year=calendarMonth.getFullYear(),month=calendarMonth.getMonth();
  const first=new Date(year,month,1);
  const start=new Date(year,month,1-first.getDay());
  return Array.from({length:42},(_,i)=>new Date(start.getFullYear(),start.getMonth(),start.getDate()+i));
 },[calendarMonth]);
 const monthAppointments=useMemo(()=>rows.filter(a=>{const d=new Date(a.scheduledAt);return d.getFullYear()===calendarMonth.getFullYear()&&d.getMonth()===calendarMonth.getMonth()}),[rows,calendarMonth]);
 const appointmentsForDay=(day:Date)=>monthAppointments.filter(a=>{const d=new Date(a.scheduledAt);return d.getFullYear()===day.getFullYear()&&d.getMonth()===day.getMonth()&&d.getDate()===day.getDate()});
 const calendarLabel=calendarMonth.toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
 const monthBirthdays=useMemo(()=>{
  const month=calendarMonth.getMonth();
  const automatic=birthdayData.customers.filter(x=>x.birthDate&&new Date(x.birthDate).getUTCMonth()===month).map(x=>({...x,source:"Cadastro"}));
  const manual=birthdayData.reminders.filter(x=>new Date(x.birthDate).getUTCMonth()===month).map(x=>({...x,source:"Incluído manualmente"}));
  const seen=new Set<string>();
  return [...automatic,...manual].filter(x=>{const key=x.customerId||x.id;if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>new Date(a.birthDate).getUTCDate()-new Date(b.birthDate).getUTCDate());
 },[birthdayData,calendarMonth]);
 const monthHolidays=useMemo(()=>getHolidays(calendarMonth.getFullYear()).filter(x=>x.date.getMonth()===calendarMonth.getMonth()),[calendarMonth]);
 const birthdaysForDay=(day:Date)=>monthBirthdays.filter(x=>new Date(x.birthDate).getUTCDate()===day.getDate());
 const holidaysForDay=(day:Date)=>monthHolidays.filter(x=>x.date.getDate()===day.getDate());
 const saveBirthday=async(e:React.FormEvent)=>{e.preventDefault();setMsg("");const r=await fetch("/api/agenda/birthdays",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:birthdayName,customerId:birthdayCustomerId||null,birthDate:birthdayDate,notes:birthdayNotes})});const d=await r.json();if(r.status===401){window.location.href="/login";return}if(!r.ok){setMsg(d.error||"Não foi possível incluir o aniversariante.");return}setMsg("Aniversariante incluído na agenda.");setBirthdayName("");setBirthdayDate("");setBirthdayCustomerId("");setBirthdayNotes("");setBirthdayFormOpen(false);await load()};
 const removeBirthday=async(id:string)=>{if(!confirm("Excluir este lembrete de aniversário?"))return;const r=await fetch("/api/agenda/birthdays?id="+encodeURIComponent(id),{method:"DELETE"});const d=await r.json();if(!r.ok){setMsg(d.error||"Não foi possível excluir o lembrete.");return}setMsg("Lembrete de aniversário excluído.");await load()};

 const goMonth=(delta:number)=>setCalendarMonth(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+delta,1));

 const load=async()=>{
  const [cr,ar,br]=await Promise.all([fetch("/api/customers",{cache:"no-store"}),fetch("/api/appointments",{cache:"no-store"}),fetch("/api/agenda/birthdays",{cache:"no-store"})]);
  if(cr.status===401||ar.status===401||br.status===401){window.location.href="/login";return}
  const [cd,ad,bd]=await Promise.all([cr.json(),ar.json(),br.json()]);
  if(cr.ok)setCustomers(cd);else setMsg(cd.error||"Erro ao carregar clientes.");
  if(ar.ok)setRows(ad);else setMsg(ad.error||"Erro ao carregar agenda.");
  if(br.ok)setBirthdayData(bd);else setMsg(bd.error||"Erro ao carregar aniversariantes.");
 };
 useEffect(()=>{load()},[]);
 useRealtimeRefresh(load,15000);
 const filtered=useMemo(()=>rows.filter(a=>(a.customer.name+" "+a.professionalName+" "+a.professionalType+" "+a.type).toLowerCase().includes(search.toLowerCase())),[rows,search]);
 const customerOptions=customers.filter(c=>(c.name+" "+(c.cpfCnpj||"")+" "+(c.phone||"")).toLowerCase().includes(customerSearch.toLowerCase())).slice(0,20);
 const save=async(e:React.FormEvent)=>{e.preventDefault();setMsg("");const r=await fetch("/api/appointments",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(form)});const d=await r.json();if(r.status===401){window.location.href="/login";return}if(!r.ok){setMsg(d.error||"Não foi possível agendar.");return}setMsg("Agendamento realizado com sucesso.");setForm(empty);setCustomerSearch("");setOpen(false);await load()};
 const remove=async(id:string)=>{if(!confirm("Excluir este agendamento?"))return;const r=await fetch("/api/appointments/"+id,{method:"DELETE"});const d=await r.json();if(!r.ok){setMsg(d.error||"Não foi possível excluir.");return}await load()};
 return <section className="page">
  <div className="page-heading"><div><span className="eyebrow">MB ÓPTICA</span><h1>Agenda</h1><p>Agende exames, atendimentos, retiradas, provas e entregas.</p></div><button className="primary" onClick={()=>{setForm(empty);setCustomerSearch("");setOpen(true);setMsg("")}}>+ Novo</button></div>
  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
   <button className="secondary" onClick={()=>setBirthdayFormOpen(v=>!v)}>🎂 Incluir aniversariante</button>
   <span style={{fontSize:11,color:"var(--muted)",alignSelf:"center"}}>{monthBirthdays.length} aniversariante{monthBirthdays.length===1?"":"s"} · {monthHolidays.length} feriado{monthHolidays.length===1?"":"s"} em {calendarLabel}</span>
  </div>
  {birthdayFormOpen&&<div className="panel" style={{padding:18,marginBottom:12}}>
   <div className="panel-heading" style={{padding:0,marginBottom:12}}><div><h2>Incluir aniversariante</h2><p>Associe a um cliente cadastrado ou informe um nome manualmente.</p></div><button className="secondary" type="button" onClick={()=>setBirthdayFormOpen(false)}>Fechar</button></div>
   <form onSubmit={saveBirthday} style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10}}>
    <label style={{fontSize:10,display:"grid",gap:5}}>Vincular cliente (opcional)<select value={birthdayCustomerId} onChange={e=>{const id=e.target.value;setBirthdayCustomerId(id);const client=customers.find(x=>x.id===id);if(client){setBirthdayName(client.name);if(client.birthDate)setBirthdayDate(String(client.birthDate).slice(0,10));}}} style={{padding:9,border:"1px solid var(--line)",borderRadius:7}}><option value="">Inclusão manual sem cliente</option>{customers.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <label style={{fontSize:10,display:"grid",gap:5}}>Nome do aniversariante<input required minLength={2} value={birthdayName} onChange={e=>setBirthdayName(e.target.value)} placeholder="Nome completo"/></label>
    <label style={{fontSize:10,display:"grid",gap:5}}>Data de nascimento<input required type="date" value={birthdayDate} onChange={e=>setBirthdayDate(e.target.value)}/></label>
    <label style={{fontSize:10,display:"grid",gap:5,gridColumn:"1 / -1"}}>Observações (opcional)<input value={birthdayNotes} onChange={e=>setBirthdayNotes(e.target.value)} placeholder="Ex.: enviar mensagem de aniversário"/></label>
    <button className="primary" type="submit">Salvar aniversariante</button>
   </form>
  </div>
  <div className="panel" style={{padding:14,marginBottom:12}}>
   <h2 style={{margin:"0 0 10px",fontSize:14}}>Aniversariantes de {calendarLabel}</h2>
   {monthBirthdays.length===0?<p style={{fontSize:11,color:"var(--muted)",margin:0}}>Nenhum aniversariante cadastrado para este mês.</p>:<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:8}}>
    {monthBirthdays.map(x=><div key={x.customerId||x.id} style={{border:"1px solid var(--line)",borderRadius:8,padding:10,display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
      <div><b style={{fontSize:11}}>{x.name}</b><div style={{fontSize:10,color:"var(--muted)"}}>{String(new Date(x.birthDate).getUTCDate()).padStart(2,"0")}/{String(new Date(x.birthDate).getUTCMonth()+1).padStart(2,"0")} · {x.source}</div></div>
      {x.source==="Incluído manualmente"&&<button className="link-button" onClick={()=>removeBirthday(x.id)}>Excluir</button>}
    </div>)}
   </div>}
   {monthHolidays.length>0&&<div style={{marginTop:12,paddingTop:10,borderTop:"1px solid var(--line)"}}><b style={{fontSize:11}}>Feriados nacionais</b><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:7}}>{monthHolidays.map(x=><span key={x.name} style={{fontSize:10,padding:"5px 8px",borderRadius:6,background:"#fff1e8",color:"#9a4d18"}}>{x.date.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})} · {x.name}</span>)}</div></div>}
  </div>

  {open&&<div className="panel" style={{padding:20,marginTop:12}}><div className="panel-heading" style={{padding:0,marginBottom:15}}><div><h2>Novo agendamento</h2><p style={{fontSize:11,color:"var(--muted)"}}>Selecione o cliente já cadastrado e informe o profissional.</p></div><button className="secondary" onClick={()=>setOpen(false)}>Fechar</button></div>
   <form onSubmit={save} style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
    <label style={{fontSize:10,display:"grid",gap:5}}>Cliente
     <input required placeholder="Buscar cliente por nome, CPF/CNPJ ou telefone..." value={customerSearch} onChange={e=>{setCustomerSearch(e.target.value);setForm({...form,customerId:""})}} />
     {customerSearch&&<div style={{border:"1px solid var(--line)",borderRadius:7,maxHeight:180,overflowY:"auto",background:"#fff"}}>{customerOptions.map(c=><button type="button" key={c.id} onClick={()=>{setForm({...form,customerId:c.id});setCustomerSearch(c.name)}} style={{display:"block",width:"100%",textAlign:"left",padding:9,border:0,borderBottom:"1px solid var(--line)",background:"#fff"}}><b>{c.name}</b><span style={{display:"block",fontSize:9,color:"var(--muted)"}}>{c.cpfCnpj||c.phone||c.email||""}</span></button>)}</div>}
     {form.customerId&&<span style={{fontSize:9,color:"#18794e"}}>Cliente selecionado.</span>}
    </label>
    <label style={{fontSize:10,display:"grid",gap:5}}>Tipo
     <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} style={{padding:9,border:"1px solid var(--line)",borderRadius:7}}><option value="EXAME">Exame de visão</option><option value="ATENDIMENTO">Atendimento</option><option value="RETIRADA">Retirada</option><option value="PROVA">Prova de lentes</option><option value="ENTREGA">Entrega</option><option value="RETORNO">Retorno</option></select>
    </label>
    <label style={{fontSize:10,display:"grid",gap:5}}>Profissional
     <select value={form.professionalType} onChange={e=>setForm({...form,professionalType:e.target.value})} style={{padding:9,border:"1px solid var(--line)",borderRadius:7}}><option value="OFTALMOLOGISTA">Oftalmologista</option><option value="OPTOMETRISTA">Optometrista</option><option value="OUTRO">Outro profissional</option></select>
    </label>
    <label style={{fontSize:10,display:"grid",gap:5}}>Nome do profissional<input required value={form.professionalName} onChange={e=>setForm({...form,professionalName:e.target.value})}/></label>
    <label style={{fontSize:10,display:"grid",gap:5}}>Data e hora<input required type="datetime-local" value={form.scheduledAt} onChange={e=>setForm({...form,scheduledAt:e.target.value})}/></label>
    <label style={{fontSize:10,display:"grid",gap:5}}>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={{padding:9,border:"1px solid var(--line)",borderRadius:7}}><option value="AGENDADO">Agendado</option><option value="CONFIRMADO">Confirmado</option><option value="REALIZADO">Realizado</option><option value="CANCELADO">Cancelado</option><option value="NAO_COMPARECEU">Não compareceu</option></select></label>
    <label style={{fontSize:10,display:"grid",gap:5,gridColumn:"1 / -1"}}>Observações<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} rows={3}/></label>
    <button className="primary" type="submit" disabled={!form.customerId}>Salvar agendamento</button>
   </form>
  </div>}
  <div className="panel" style={{padding:16,marginTop:12}}>
   <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:14}}>
    <div><h2 style={{margin:0,textTransform:"capitalize"}}>{calendarLabel}</h2><span style={{fontSize:11,color:"var(--muted)"}}>{monthAppointments.length} compromisso{monthAppointments.length===1?"":"s"} no mês</span></div>
    <div style={{display:"flex",gap:6}}>
     <button className="secondary" onClick={()=>goMonth(-1)}>‹</button>
     <button className="secondary" onClick={()=>{const d=new Date();setCalendarMonth(new Date(d.getFullYear(),d.getMonth(),1))}}>Hoje</button>
     <button className="secondary" onClick={()=>goMonth(1)}>›</button>
    </div>
   </div>
   <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:1,border:"1px solid var(--line)",background:"var(--line)",borderRadius:8,overflow:"hidden"}}>
    {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(day=><div key={day} style={{background:"var(--surface)",padding:"8px 6px",fontSize:10,fontWeight:700,textAlign:"center",color:"var(--muted)"}}>{day}</div>)}
    {calendarDays.map(day=>{
      const items=appointmentsForDay(day);
      const dayBirthdays=birthdaysForDay(day);
      const dayHolidays=holidaysForDay(day);
      const inMonth=day.getMonth()===calendarMonth.getMonth();
      const today=new Date(); const isToday=day.toDateString()===today.toDateString();
      return <div key={day.toISOString()} style={{minHeight:108,background:inMonth?"#fff":"#f7f8fa",padding:6,verticalAlign:"top",opacity:inMonth?1:.55}}>
       <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
        <span style={{fontSize:11,fontWeight:isToday?800:600,borderRadius:12,padding:isToday?"2px 7px":0,background:isToday?"#e6f4f1":"transparent",color:isToday?"#087f6b":"var(--text)"}}>{day.getDate()}</span>
        {items.length>0&&<span style={{fontSize:9,color:"var(--muted)"}}>{items.length}</span>}
       </div>
       <div style={{display:"grid",gap:4}}>
        {items.slice(0,3).map(a=><button key={a.id} title={`${new Date(a.scheduledAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})} · ${a.customer.name}`} onClick={()=>setSearch(a.customer.name)} style={{border:0,borderLeft:"3px solid #087f6b",borderRadius:4,background:"#eef8f6",padding:"4px 5px",textAlign:"left",fontSize:9,cursor:"pointer",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
          <b>{new Date(a.scheduledAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</b> · {a.customer.name}
        </button>)}
        {items.length>3&&<span style={{fontSize:9,color:"var(--muted)",paddingLeft:4}}>+ {items.length-3} compromisso{items.length-3===1?"":"s"}</span>}
       </div>
       {dayHolidays.map(h=><div key={h.name} title={h.name} style={{fontSize:9,background:"#fff0e8",color:"#994515",borderRadius:4,padding:"4px 5px",fontWeight:700,overflow:"hidden",textOverflow:"ellipsis"}}>★ {h.name}</div>)}
       {dayBirthdays.map(b=><div key={b.customerId||b.id} title={"Aniversário: "+b.name} style={{fontSize:9,background:"#fff3d9",color:"#805500",borderRadius:4,padding:"4px 5px",overflow:"hidden",textOverflow:"ellipsis"}}>🎂 {b.name}</div>)}

      </div>
    })}
   </div>
  </div>
  <div className="toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar na agenda por cliente, profissional ou tipo..."/><button className="secondary" onClick={load}>Atualizar</button></div>
  <div className="panel"><div className="table"><div className="row header"><span>Data/hora</span><span>Cliente</span><span>Tipo</span><span>Profissional</span><span>Status</span><span></span></div>
   {filtered.map(a=><div className="row" key={a.id}><strong>{new Date(a.scheduledAt).toLocaleString("pt-BR")}</strong><span>{a.customer.name}</span><span>{a.type}</span><span>{a.professionalType==="OFTALMOLOGISTA"?"Oftalmologista":a.professionalType==="OPTOMETRISTA"?"Optometrista":"Outro"} · {a.professionalName}</span><span>{a.status}</span><button className="link-button" onClick={()=>remove(a.id)}>Excluir</button></div>)}
   {!filtered.length&&<div style={{padding:25,textAlign:"center",color:"var(--muted)"}}>Nenhum agendamento encontrado.</div>}
  </div></div>
 </section>
}
