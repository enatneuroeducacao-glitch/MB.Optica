import {NextResponse} from "next/server";
import {requireRole} from "@/lib/auth";

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    await requireRole(["ADMIN","GERENTE","VENDEDOR","FINANCEIRO","LABORATORIO"]);
    const key=process.env.RESEND_API_KEY;
    if(!key)return NextResponse.json({error:"RESEND_API_KEY não configurada."},{status:503});
    const {id}=await params;
    const folder=new URL(req.url).searchParams.get("folder")||"inbox";
    const endpoint=folder==="sent"?"/emails/"+encodeURIComponent(id):"/emails/receiving/"+encodeURIComponent(id);
    const r=await fetch("https://api.resend.com"+endpoint,{headers:{Authorization:"Bearer "+key,Accept:"application/json"},cache:"no-store"});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)return NextResponse.json({error:data?.message||"Não foi possível abrir o e-mail."},{status:r.status});
    return NextResponse.json(data);
  }catch(error){return NextResponse.json({error:String(error)},{status:401})}
}
