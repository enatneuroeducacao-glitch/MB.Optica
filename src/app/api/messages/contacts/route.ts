import {NextResponse} from "next/server";
import {requireRole} from "@/lib/auth";
import {db} from "@/lib/db";
import {apiError} from "@/lib/api-error";

export const dynamic="force-dynamic";
export const revalidate=0;
const roles=["ADMIN","GERENTE","VENDEDOR","FINANCEIRO","LABORATORIO"] as const;

export async function GET(req:Request){
  try{
    const actor=await requireRole([...roles]);
    const url=new URL(req.url);
    const type=url.searchParams.get("type")||"clientes";
    const view=url.searchParams.get("view")||"active";
    if(type!=="clientes"&&type!=="fornecedores"){
      return NextResponse.json({error:"Tipo de contato inválido."},{status:422});
    }
    if(!["active","hidden","deleted"].includes(view)){
      return NextResponse.json({error:"Filtro de contatos inválido."},{status:422});
    }
    const rows=type==="clientes"
      ? await db.customer.findMany({where:{active:true,email:{not:null}},select:{id:true,name:true,email:true,phone:true},orderBy:{name:"asc"},take:1000})
      : await db.supplier.findMany({where:{active:true,email:{not:null}},select:{id:true,name:true,email:true,phone:true},orderBy:{name:"asc"},take:1000});
    const preferences=await db.mailContactPreference.findMany({where:{userId:actor.id,contactType:type}});
    const byEmail=new Map(preferences.map(p=>[p.email.toLowerCase(),p]));
    const seen=new Set<string>();
    const data=rows.flatMap(r=>{
      const email=String(r.email||"").trim();
      const key=email.toLowerCase();
      if(!key||seen.has(key))return [];
      seen.add(key);
      const preference=byEmail.get(key);
      const hidden=Boolean(preference?.hidden);
      const deleted=Boolean(preference?.deleted);
      const belongs=view==="deleted"?deleted:view==="hidden"?!deleted&&hidden:!deleted&&!hidden;
      if(!belongs)return [];
      return [{...r,email,hidden,deleted,blocked:Boolean(preference?.blocked)}];
    });
    return NextResponse.json({type,data,count:data.length,view},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return apiError(error,"Não foi possível carregar os contatos.");
  }
}

export async function POST(req:Request){
  try{
    const actor=await requireRole([...roles]);
    const body=await req.json();
    const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
    const type=body.type;
    const action=body.action;
    if(!email||!/^\S+@\S+\.\S+$/.test(email)||!["clientes","fornecedores"].includes(type)||!["hide","restore","delete","undelete"].includes(action)){
      return NextResponse.json({error:"Dados inválidos para atualizar o contato."},{status:422});
    }
    const values=action==="hide"?{hidden:true,deleted:false}
      :action==="restore"?{hidden:false,deleted:false}
      :action==="delete"?{hidden:false,deleted:true}
      :{hidden:false,deleted:false};
    const preference=await db.mailContactPreference.upsert({
      where:{userId_email:{userId:actor.id,email}},
      create:{userId:actor.id,email,contactType:type,...values},
      update:{contactType:type,...values}
    });
    return NextResponse.json({ok:true,preference});
  }catch(error){
    return apiError(error,"Não foi possível atualizar o contato.");
  }
}
