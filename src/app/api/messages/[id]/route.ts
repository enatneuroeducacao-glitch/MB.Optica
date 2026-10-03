import {NextResponse} from "next/server";
import {requireRole} from "@/lib/auth";

const base="https://api.resend.com";
const headers=(key:string)=>({Authorization:"Bearer "+key,Accept:"application/json"});

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    await requireRole(["ADMIN","GERENTE","VENDEDOR","FINANCEIRO","LABORATORIO"]);
    const key=process.env.RESEND_API_KEY;
    if(!key)return NextResponse.json({error:"RESEND_API_KEY não configurada."},{status:503});
    const {id}=await params;
    const folder=new URL(req.url).searchParams.get("folder")||"inbox";
    const paths=folder==="sent"
      ? ["/emails/"+encodeURIComponent(id),"/emails/"+encodeURIComponent(id)+"/attachments?limit=100"]
      : ["/emails/receiving/"+encodeURIComponent(id),"/emails/receiving/"+encodeURIComponent(id)+"/attachments?limit=100"];

    const responses=await Promise.all(paths.map(path=>fetch(base+path,{headers:headers(key),cache:"no-store"})));
    const emailRes=responses[0];
    const emailData=await emailRes.json().catch(()=>({}));
    if(!emailRes.ok)return NextResponse.json({error:emailData?.message||"Não foi possível abrir o e-mail."},{status:emailRes.status});

    const attachmentData=await responses[1].json().catch(()=>({}));
    if(Array.isArray(attachmentData?.data))emailData.attachments=attachmentData.data;
    return NextResponse.json(emailData);
  }catch(error){
    return NextResponse.json({error:String(error)},{status:401});
  }
}
