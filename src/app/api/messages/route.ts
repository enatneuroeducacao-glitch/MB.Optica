import {NextResponse} from "next/server";
import {requireRole} from "@/lib/auth";

const resendBase="https://api.resend.com";

export async function GET(req:Request){
  try{
    const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR","FINANCEIRO","LABORATORIO"]);
    const folder=new URL(req.url).searchParams.get("folder")||"inbox";
    const key=process.env.RESEND_API_KEY;
    if(!key) return NextResponse.json({configured:false,data:[],error:"RESEND_API_KEY não configurada no ambiente do MB Gestão."},{status:200});
    const endpoint=folder==="sent"?"/emails?limit=50":"/emails/receiving?limit=50";
    const r=await fetch(resendBase+endpoint,{headers:{Authorization:"Bearer "+key,Accept:"application/json"},cache:"no-store"});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) return NextResponse.json({configured:true,data:[],error:data?.message||"Não foi possível consultar as mensagens recebidas na Resend."},{status:200});
    const incoming=Array.isArray(data?.data)?data.data:[];
    const states=await (await import("@/lib/db")).db.mailMessageState.findMany({where:{userId:actor.id}});
    const byId=new Map(states.map(s=>[s.messageId,s]));
    const target=actor.mbEmail?.toLowerCase();
    const visible=incoming.filter((e:any)=>{
      const st=byId.get(e.id);
      if(folder==="trash") return Boolean(st?.deleted);
      if(folder==="archive") return Boolean(st?.archived&&!st?.deleted);
      if(st?.deleted||st?.archived)return false;
      if(folder==="sent"){
        const sender=String(e.from||"").toLowerCase();
        return !target||sender.includes(target);
      }
      if(!target)return true;
      const recipients=[...(e.to||[]),...(e.cc||[])].map((x:string)=>x.toLowerCase());
      return recipients.length===0||recipients.includes(target);
    }).map((e:any)=>({...e,_state:byId.get(e.id)||null}));
    return NextResponse.json({configured:true,data:visible,has_more:Boolean(data?.has_more),mbEmail:actor.mbEmail||null,folder});
  }catch(error){
    return NextResponse.json({configured:false,data:[],error:String(error)},{status:401});
  }
}
