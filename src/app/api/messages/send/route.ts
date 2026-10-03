import {NextResponse} from "next/server";
import {z} from "zod";
import {requireRole} from "@/lib/auth";

const schema=z.object({to:z.string().email(),subject:z.string().trim().min(1).max(200),text:z.string().trim().min(1).max(20000),replyTo:z.string().email().optional()});

export async function POST(req:Request){
  try{
    const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR","FINANCEIRO","LABORATORIO"]);
    const key=process.env.RESEND_API_KEY;
    const from=actor.mbEmail||process.env.RESEND_FROM;
    if(!key)return NextResponse.json({error:"RESEND_API_KEY não configurada."},{status:503});
    if(!from)return NextResponse.json({error:"Configure o e-mail MB do usuário ou RESEND_FROM."},{status:422});
    const body=schema.parse(await req.json());
    const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from,to:[body.to],subject:body.subject,text:body.text,reply_to:body.replyTo||actor.mbEmail||actor.email})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)return NextResponse.json({error:data?.message||"Não foi possível enviar o e-mail."},{status:r.status});
    return NextResponse.json({ok:true,data});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Preencha destinatário, assunto e mensagem corretamente."},{status:422});
    return NextResponse.json({error:String(error)},{status:401});
  }
}
