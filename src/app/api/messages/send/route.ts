import {NextResponse} from "next/server";
import {requireRole} from "@/lib/auth";

const resendBase="https://api.resend.com";
const allowedRoles=["ADMIN","GERENTE","VENDEDOR","FINANCEIRO","LABORATORIO"];

function cleanAddress(value: unknown) {
  return typeof value==="string" ? value.trim() : "";
}

export async function POST(req: Request){
  try{
    const user=await requireRole(allowedRoles);
    const key=process.env.RESEND_API_KEY;
    if(!key) return NextResponse.json({error:"RESEND_API_KEY não configurada no ambiente do MB Gestão."},{status:503});
    const payload=await req.json().catch(()=>null);
    const to=Array.isArray(payload?.to)?payload.to.map(cleanAddress).filter(Boolean):[cleanAddress(payload?.to)].filter(Boolean);
    const cc=Array.isArray(payload?.cc)?payload.cc.map(cleanAddress).filter(Boolean):[cleanAddress(payload?.cc)].filter(Boolean);
    const subject=cleanAddress(payload?.subject);
    const text=typeof payload?.text==="string"?payload.text.trim():"";
    if(!to.length)return NextResponse.json({error:"Informe pelo menos um destinatário."},{status:400});
    if(!subject)return NextResponse.json({error:"Informe o assunto."},{status:400});
    if(!text)return NextResponse.json({error:"Informe a mensagem."},{status:400});
    if(to.length>20||cc.length>20)return NextResponse.json({error:"Limite de 20 destinatários por campo."},{status:400});
    const sender=user.mbEmail || process.env.RESEND_FROM?.trim() || "MB Óptica <atendimentoMB@mboptica.com.br>";
    const from=sender.includes("<") ? sender : `${user.name} <${sender}>`;
    const html=text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>");
    const r=await fetch(resendBase+"/emails",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({from,to,...(cc.length?{cc}:{}),subject,text,html}),cache:"no-store"});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)return NextResponse.json({error:data?.message||"A Resend recusou o envio do e-mail."},{status:r.status});
    return NextResponse.json({ok:true,id:data?.id||null});
  }catch(error){
    const message=String(error); const status=message.includes("FORBIDDEN")?403:message.includes("UNAUTHORIZED")?401:500;
    return NextResponse.json({error:status===500?"Não foi possível enviar o e-mail.":message},{status});
  }
}
