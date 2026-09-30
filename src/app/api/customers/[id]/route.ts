import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
    const {id}=await params;
    const data=await db.customer.findUnique({where:{id},include:{
      addresses:true,prescriptions:{orderBy:{date:"desc"}},
      orders:{orderBy:{createdAt:"desc"},take:50,include:{items:true}},
      sales:{orderBy:{createdAt:"desc"},take:50,include:{items:true,payments:{include:{method:true}}}},
      accounts:{orderBy:{dueDate:"asc"}}
    }});
    if(!data)return NextResponse.json({error:"Cliente não encontrado."},{status:404});
    return NextResponse.json(data);
  }catch(error){return apiError(error,"Não foi possível carregar o cliente.");}
}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
    const {id}=await params; const b=await req.json();
    const name=b.name!==undefined?String(b.name).trim():undefined;
    const active=b.active!==undefined?Boolean(b.active):undefined;
    if(name!==undefined&&name.length<2)throw new Error("Nome inválido");
    const email=b.email!==undefined?(b.email?String(b.email).trim().toLowerCase():null):undefined;
    if(email&&(!email.includes("@")||email.length>160))throw new Error("E-mail inválido");
    const data=await db.$transaction(async tx=>{
      const current=await tx.customer.findUnique({where:{id}});
      if(!current)throw new Error("Cliente não encontrado");
      const updated=await tx.customer.update({where:{id},data:{
        name,active,cpfCnpj:b.cpfCnpj!==undefined?(b.cpfCnpj?String(b.cpfCnpj).trim():null):undefined,
        phone:b.phone!==undefined?(b.phone?String(b.phone).trim():null):undefined,
        whatsapp:b.whatsapp!==undefined?(b.whatsapp?String(b.whatsapp).trim():null):undefined,
        email,notes:b.notes!==undefined?(b.notes?String(b.notes).trim():null):undefined,
        birthDate:b.birthDate!==undefined?(b.birthDate?new Date(b.birthDate):null):undefined
      }});
      await writeAudit(tx,{action:"UPDATE",entity:"Customer",entityId:id,userId:actor.id,metadata:{fields:Object.keys(b)}});
      return updated;
    });
    return NextResponse.json(data);
  }catch(error){return apiError(error,"Não foi possível atualizar o cliente.");}
}
export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await requireRole(["ADMIN","GERENTE"]); const {id}=await params;
    const result=await db.$transaction(async tx=>{
      const current=await tx.customer.findUnique({where:{id}});
      if(!current)throw new Error("Cliente não encontrado");
      const [orderCount,saleCount,accountCount,quoteCount]=await Promise.all([
        tx.opticalOrder.count({where:{customerId:id}}),
        tx.sale.count({where:{customerId:id}}),
        tx.account.count({where:{customerId:id}}),
        tx.quote.count({where:{customerId:id}})
      ]);
      const hasCommercialHistory=orderCount>0||saleCount>0||accountCount>0||quoteCount>0;
      let deletedPrescriptions=0;

      if(!hasCommercialHistory){
        const deleted=await tx.prescription.deleteMany({where:{customerId:id}});
        deletedPrescriptions=deleted.count;
      }

      const updated=await tx.customer.update({where:{id},data:{active:false}});
      await writeAudit(tx,{action:"ARCHIVE",entity:"Customer",entityId:id,userId:actor.id,metadata:{
        name:current.name,
        commercialHistory:{orders:orderCount,sales:saleCount,accounts:accountCount,quotes:quoteCount},
        deletedTestPrescriptions:deletedPrescriptions,
        historyPreserved:hasCommercialHistory
      }});
      return {customer:updated,deletedPrescriptions,historyPreserved:hasCommercialHistory};
    });
    return NextResponse.json({ok:true,...result});
  }catch(error){return apiError(error,"Não foi possível arquivar o cliente.");}
}