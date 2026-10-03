import {NextResponse} from "next/server";
import {requireRole} from "@/lib/auth";

const resendBase="https://api.resend.com";

export async function GET(){
  try{
    const user=await requireRole(["ADMIN","GERENTE","VENDEDOR","FINANCEIRO","LABORATORIO"]);
    const key=process.env.RESEND_API_KEY;
    const inboxAddress=user.mbEmail || process.env.RESEND_INBOX_ADDRESS?.trim() || "atendimentoMB@mboptica.com.br";
    if(!key) return NextResponse.json({configured:false,data:[],inboxAddress,error:"RESEND_API_KEY não configurada no ambiente do MB Gestão."},{status:200});
    const r=await fetch(resendBase+"/emails/receiving?limit=50",{headers:{Authorization:"Bearer "+key,Accept:"application/json"},cache:"no-store"});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) return NextResponse.json({configured:true,data:[],inboxAddress,error:data?.message||"Não foi possível consultar as mensagens recebidas na Resend."},{status:200});
    return NextResponse.json({configured:true,data:Array.isArray(data?.data)?data.data:[],inboxAddress,has_more:Boolean(data?.has_more)});
  }catch(error){
    return NextResponse.json({configured:false,data:[],inboxAddress:process.env.RESEND_INBOX_ADDRESS?.trim()||"atendimentoMB@mboptica.com.br",error:String(error)},{status:401});
  }
}
