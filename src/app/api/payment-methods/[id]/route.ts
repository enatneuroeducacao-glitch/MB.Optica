import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {writeAudit} from "@/lib/audit";

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const b=await req.json();
    const data:{
      name?:string;
      isCash?:boolean;
      active?:boolean;
    }={};

    if(b.name!==undefined){
      const name=String(b.name).trim();
      if(!name) throw new Error("Nome do meio de pagamento é obrigatório");
      data.name=name;
    }
    if(b.isCash!==undefined) data.isCash=Boolean(b.isCash);
    if(b.active!==undefined) data.active=Boolean(b.active);

    if(Object.keys(data).length===0) throw new Error("Nenhuma alteração informada");

    const method=await db.$transaction(async tx=>{
      const current=await tx.paymentMethod.findUnique({where:{id}});
      if(!current) throw new Error("Meio de pagamento não encontrado");

      const updated=await tx.paymentMethod.update({where:{id},data});
      await writeAudit(tx,{
        action:"UPDATE",
        entity:"PaymentMethod",
        entityId:id,
        metadata:{before:{name:current.name,isCash:current.isCash,active:current.active},after:{name:updated.name,isCash:updated.isCash,active:updated.active}}
      });
      return updated;
    });

    return NextResponse.json(method);
  }catch(error){
    return NextResponse.json({error:"Não foi possível atualizar o meio de pagamento",detail:String(error)},{status:400});
  }
}