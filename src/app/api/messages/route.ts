import {NextResponse} from "next/server";
import {requireRole} from "@/lib/auth";

const resendBase="https://api.resend.com";
const authHeaders=(key:string)=>({Authorization:"Bearer "+key,Accept:"application/json"});

async function getJson(key:string,path:string){
  const r=await fetch(resendBase+path,{headers:authHeaders(key),cache:"no-store"});
  const data=await r.json().catch(()=>({}));
  return {ok:r.ok,data};
}

export async function GET(req:Request){
  try{
    const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR","FINANCEIRO","LABORATORIO"]);
    const folder=new URL(req.url).searchParams.get("folder")||"inbox";
    const key=process.env.RESEND_API_KEY;
    if(!key)return NextResponse.json({configured:false,data:[],error:"RESEND_API_KEY não configurada no ambiente do MB Gestão."},{status:200});

    const states=await (await import("@/lib/db")).db.mailMessageState.findMany({where:{userId:actor.id}});
    const byId=new Map(states.map(s=>[s.messageId,s]));

    const pages:string[]=[];
    if(folder==="sent")pages.push("/emails?limit=100");
    else if(folder==="archive"||folder==="trash")pages.push("/emails?limit=100","/emails/receiving?limit=100");
    else pages.push("/emails/receiving?limit=100");

    const results=await Promise.all(pages.map(path=>getJson(key,path)));
    const failed=results.find(r=>!r.ok);
    if(failed&&!results.some(r=>r.ok)){
      return NextResponse.json({configured:true,data:[],error:failed.data?.message||"Não foi possível consultar as mensagens na Resend."},{status:200});
    }

    const incoming=results.flatMap(r=>Array.isArray(r.data?.data)?r.data.data:[]);
    const seen=new Set<string>();
    const target=actor.mbEmail?.toLowerCase();

    const visible=incoming.filter((e:any)=>{
      if(!e?.id||seen.has(e.id))return false;
      seen.add(e.id);
      const st=byId.get(e.id);
      if(folder==="trash")return Boolean(st?.deleted);
      if(folder==="archive")return Boolean(st?.archived&&!st?.deleted);
      if(st?.deleted||st?.archived)return false;
      if(folder==="sent"){
        const sender=String(e.from||"").toLowerCase();
        return !target||sender.includes(target);
      }
      if(!target)return true;
      const recipients=[...(e.to||[]),...(e.cc||[])].map((x:string)=>x.toLowerCase());
      return recipients.length===0||recipients.includes(target);
    }).map((e:any)=>({...e,_state:byId.get(e.id)||null}));

    const hasMore=results.some(r=>Boolean(r.data?.has_more));
    return NextResponse.json({configured:true,data:visible,has_more:hasMore,mbEmail:actor.mbEmail||null,folder});
  }catch(error){
    return NextResponse.json({configured:false,data:[],error:String(error)},{status:401});
  }
}
