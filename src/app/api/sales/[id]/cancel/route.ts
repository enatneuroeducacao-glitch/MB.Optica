import {syncPublishedProductStocks} from "@/lib/site-stock-sync";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {Prisma} from "@prisma/client";
import {writeAudit} from "@/lib/audit";
import {requireRole} from "@/lib/auth";
import {enqueueAccountingEvent} from "@/lib/accounting-events";

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await requireRole(["ADMIN","GERENTE","FINANCEIRO"]);
    const {id}=await params;
    const b=await req.json().catch(()=>({}));
    const reason=String(b.reason||"").trim();
    const reference=String(b.reference||"").trim();
    if(reason.length<3) throw new Error("Informe o motivo do cancelamento (mínimo 3 caracteres)");
    if(reason.length>500) throw new Error("O motivo deve ter no máximo 500 caracteres");
    if(reference.length>200) throw new Error("A referência do estorno deve ter no máximo 200 caracteres");

    const result=await db.$transaction(async(tx)=>{
      const sale=await tx.sale.findUnique({
        where:{id},
        include:{
          payments:{include:{method:true}},
          items:true,
          accounts:{where:{type:"RECEBER"},include:{settlements:{include:{payment:true}}}},
          fiscalDocument:true
        }
      });
      if(!sale) throw new Error("Venda não encontrada");
      if(sale.canceled) return sale;
      if(sale.fiscalDocument) throw new Error("Esta venda possui documento fiscal vinculado. Resolva o cancelamento fiscal primeiro; depois cancele a venda para estornar o financeiro.");

      const activePayments=sale.payments.filter(p=>!p.reversedAt);
      let cashRefunds=0;

      for(const payment of activePayments){
        if(payment.method.isCash){
          const session=await tx.cashSession.findFirst({
            where:{closedAt:null},
            orderBy:{openedAt:"desc"}
          });
          if(!session) throw new Error("É necessário um caixa aberto para devolver pagamento em dinheiro");

          await tx.cashMovement.create({
            data:{
              sessionId:session.id,
              kind:"SAIDA",
              amount:payment.amount,
              description:"Devolução do pagamento da venda #"+sale.number,
              referenceId:sale.id
            }
          });
          cashRefunds++;
        }

        const reversedAt=new Date();
        await tx.payment.update({
          where:{id:payment.id},
          data:{
            reversedAt,
            reversalReference:reference||reason
          }
        });
        await enqueueAccountingEvent(tx, {
          eventType: "PAYMENT_REVERSED",
          sourceType: "Payment",
          sourceId: payment.id,
          idempotencyKey: "PAYMENT_REVERSED:" + payment.id,
          payload: { amount: Number(payment.amount), entryDate: reversedAt.toISOString(), description: "Estorno do pagamento da venda #" + sale.number + " — " + reason },
        });
      }

      let reversedSettlements=0;
      let canceledAccounts=0;
      for(const account of sale.accounts){
        const activeSettlements=account.settlements.filter(s=>!s.reversedAt);
        if(activeSettlements.length){
          await tx.accountSettlement.updateMany({
            where:{id:{in:activeSettlements.map(s=>s.id)}},
            data:{reversedAt:new Date()}
          });
          reversedSettlements+=activeSettlements.length;
        }

        await tx.account.update({
          where:{id:account.id},
          data:{paidAmount:0,status:"CANCELADO"}
        });
        canceledAccounts++;
      }

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

      const canceledAt=new Date();
      const canceled=await tx.sale.update({
        where:{id:sale.id},
        data:{canceled:true,canceledAt,cancelReason:reason}
      });
      await enqueueAccountingEvent(tx, {
        eventType: "SALE_REFUNDED",
        sourceType: "Sale",
        sourceId: sale.id,
        idempotencyKey: "SALE_REFUNDED:CANCEL:" + sale.id,
        payload: { amount: Number(sale.total), entryDate: canceledAt.toISOString(), description: "Estorno do reconhecimento da venda #" + sale.number + " — " + reason },
      });

      await writeAudit(tx,{
        action:"CANCEL",
        entity:"Sale",
        entityId:sale.id,
        userId:actor.id,
        request:req,
        metadata:{
          reason,
          refundReference:reference||null,
          restoredMovements:movements.length,
          reversedPayments:activePayments.length,
          cashRefunds,
          reversedSettlements,
          canceledAccounts
        }
      });
      return canceled;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});

    const movements=await db.stockMovement.findMany({where:{reference:"CANCELAMENTO_VENDA",referenceId:id},select:{productId:true}});
    const siteSync=await syncPublishedProductStocks(movements.map(m=>m.productId));
    return NextResponse.json({...result,siteSync});
  }catch(error){
    return NextResponse.json({error:"Não foi possível cancelar a venda",detail:String(error)},{status:400});
  }
}