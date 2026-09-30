import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await requireRole(["ADMIN","GERENTE"]);
    const {id}=await params;

    const result=await db.$transaction(async tx=>{
      const prescription=await tx.prescription.findUnique({
        where:{id},
        include:{
          customer:{select:{id:true,name:true,active:true}},
          _count:{select:{orders:true,quotes:true}}
        }
      });

      if(!prescription)throw new Error("Receita não encontrada.");
      if(prescription._count.orders>0||prescription._count.quotes>0){
        return {
          blocked:true,
          reason:"Esta receita está vinculada a pedido ou orçamento e não pode ser excluída isoladamente."
        };
      }

      await tx.prescription.delete({where:{id}});
      await writeAudit(tx,{
        action:"DELETE",
        entity:"Prescription",
        entityId:id,
        userId:actor.id,
        metadata:{
          customerId:prescription.customer.id,
          customerName:prescription.customer.name,
          customerActive:prescription.customer.active
        },
        result:"SUCCESS"
      });

      return {blocked:false,customerName:prescription.customer.name};
    });

    if(result.blocked){
      return NextResponse.json({error:result.reason},{status:409});
    }

    return NextResponse.json({ok:true,...result});
  }catch(error){
    return apiError(error,"Não foi possível excluir a receita.");
  }
}
