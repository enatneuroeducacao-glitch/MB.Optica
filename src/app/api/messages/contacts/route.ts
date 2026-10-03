import {NextResponse} from "next/server";
import {requireRole} from "@/lib/auth";
import {db} from "@/lib/db";
import {apiError} from "@/lib/api-error";

export const dynamic="force-dynamic";
export const revalidate=0;

export async function GET(req:Request){
  try{
    await requireRole(["ADMIN","GERENTE","VENDEDOR","FINANCEIRO","LABORATORIO"]);
    const type=new URL(req.url).searchParams.get("type")||"clientes";
    if(type!=="clientes"&&type!=="fornecedores"){
      return NextResponse.json({error:"Tipo de contato inválido."},{status:422});
    }

    if(type==="clientes"){
      const rows=await db.customer.findMany({
        where:{active:true,email:{not:null}},
        select:{id:true,name:true,email:true,phone:true},
        orderBy:{name:"asc"},
        take:1000
      });
      const seen=new Set<string>();
      const data=rows.filter(r=>{
        const email=String(r.email||"").trim().toLowerCase();
        if(!email||seen.has(email))return false;
        seen.add(email);
        return true;
      }).map(r=>({...r,email:String(r.email).trim()}));
      return NextResponse.json({type,data,count:data.length},{headers:{"Cache-Control":"no-store"}});
    }

    const rows=await db.supplier.findMany({
      where:{active:true,email:{not:null}},
      select:{id:true,name:true,email:true,phone:true},
      orderBy:{name:"asc"},
      take:1000
    });
    const seen=new Set<string>();
    const data=rows.filter(r=>{
      const email=String(r.email||"").trim().toLowerCase();
      if(!email||seen.has(email))return false;
      seen.add(email);
      return true;
    }).map(r=>({...r,email:String(r.email).trim()}));
    return NextResponse.json({type,data,count:data.length},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return apiError(error,"Não foi possível carregar os contatos.");
  }
}
