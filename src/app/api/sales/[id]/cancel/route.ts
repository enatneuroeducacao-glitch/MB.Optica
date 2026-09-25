import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {Prisma} from "@prisma/client";
import {writeAudit} from "@/lib/audit";

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const b=await req.json().catch(()=>({}));
    const reason=String(b.reason||"Cancelamento da venda").trim();
    if(reason.length<3) throw new Error("Motivo do cancelamento é obrigatório");

    const result=await db.$transaction(async(tx)=>{
      const sale=await tx.sale.findUnique({
        where:{id},
        include:{payments:true,items:true}
      });
      if(!sale) throw new Error("Venda não encontrada");
      if(sale.canceled) return sale;

      const activePayments=sale.payments.filter(p=>!p.reversedAt);
      if(activePayments.length) throw new Error("Estorne os pagamentos antes de cancelar a venda");

      const movements=await tx.stockMovement.findMany({
        where:{reference:"VENDA",referenceId:sale.id,type:"SAIDA"},
        include:{lotLinks:true}
      });
      for(const movement of movements){
        if(movement.lotLinks.length===0) throw new Error("Venda possui saída de estoque sem rastreabilidade por lote; cancelamento bloqueado");
        for(const link of movement.lotLinks){
          const updated=await tx.stockLot.updateMany({
            where:{id:link.lotId},
            data:{quantity:{increment:link.quantity}}
          });
          if(updated.count!==1) throw new Error("Lote de estoque não encontrado durante a devolução");
        }
        await tx.stockMovement.create({
          data:{
            productId:movement.productId,
            type:"DEVOLUCAO",
            quantity:movement.quantity,
            reference:"CANCELAMENTO_VENDA",
            referenceId:sale.id,
            notes:reason,
            lotLinks:{create:movement.lotLinks.map(l=>({lotId:l.lotId,quantity:l.quantity}))}
          }
        });
      }

      const canceled=await tx.sale.update({
        where:{id:sale.id},
        data:{canceled:true,canceledAt:new Date(),cancelReason:reason}
      });
      await writeAudit(tx,{action:"CANCEL",entity:"Sale",entityId:sale.id,metadata:{reason,restoredMovements:movements.length}});
      return canceled;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});

    return NextResponse.json(result);
  }catch(error){
    return NextResponse.json({error:"Não foi possível cancelar a venda",detail:String(error)},{status:400});
  }
}
