import {syncPublishedProductStocks} from "@/lib/site-stock-sync";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {Prisma} from "@prisma/client";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";

const money=(v:any)=>Number(v||0);

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await requireRole(["ADMIN","GERENTE","FINANCEIRO","VENDEDOR"]);
    const {id}=await params;
    const b=await req.json();
    if(!Array.isArray(b.items)||b.items.length===0) throw new Error("Informe ao menos um item para devolução");
    const reason=String(b.reason||"Devolução parcial").trim();
    if(reason.length<3) throw new Error("Motivo da devolução é obrigatório");

    const result=await db.$transaction(async tx=>{
      const sale=await tx.sale.findUnique({
        where:{id},
        include:{
          items:true,
          accounts:{orderBy:{dueDate:"asc"}}
        }
      });
      if(!sale) throw new Error("Venda não encontrada");
      if(sale.canceled) throw new Error("Venda cancelada não aceita devolução parcial");

      const requested=new Map<string,number>();
      for(const item of b.items){
        const saleItemId=String(item.saleItemId||"");
        const quantity=Number(item.quantity);
        if(!saleItemId||!Number.isFinite(quantity)||quantity<=0) throw new Error("Item ou quantidade inválida");
        requested.set(saleItemId,(requested.get(saleItemId)||0)+quantity);
      }

      let returnedSubtotal=0;
      const returnLines:any[]=[];

      for(const [saleItemId,quantity] of requested){
        const saleItem=sale.items.find(item=>item.id===saleItemId);
        if(!saleItem) throw new Error("Item não pertence à venda");

        const previous=await tx.stockMovement.aggregate({
          where:{
            reference:"DEVOLUCAO_PARCIAL",
            referenceId:saleItemId,
            type:"DEVOLUCAO"
          },
          _sum:{quantity:true}
        });
        const alreadyReturned=money(previous._sum.quantity);
        const remainingQuantity=money(saleItem.quantity)-alreadyReturned;
        if(quantity>remainingQuantity+0.001){
          throw new Error("Quantidade devolvida superior ao saldo do item: "+saleItem.description);
        }

        const lineNet=money(saleItem.unitPrice)*quantity-(money(saleItem.discount)*(quantity/money(saleItem.quantity)));
        returnedSubtotal+=Math.max(0,lineNet);

        let movementId:string|null=null;

        if(saleItem.productId){
          const movement=await tx.stockMovement.findFirst({
            where:{
              reference:"VENDA",
              referenceId:sale.id,
              productId:saleItem.productId,
              type:"SAIDA"
            },
            orderBy:{createdAt:"asc"},
            include:{lotLinks:true}
          });

          const product=await tx.product.findUnique({where:{id:saleItem.productId}});
          if(!product||!product.active) throw new Error("Produto do item não encontrado");

          if(product.stockControlled){
            if(!movement||movement.lotLinks.length===0) throw new Error("Item sem rastreabilidade de lote; devolução bloqueada");

            let remainingToRestore=quantity;
            for(const link of movement.lotLinks){
              if(remainingToRestore<=0) break;
              const originalReturned=await tx.stockMovementLot.aggregate({
                where:{
                  lotId:link.lotId,
                  movement:{
                    reference:"DEVOLUCAO_PARCIAL",
                    referenceId:saleItemId,
                    type:"DEVOLUCAO"
                  }
                },
                _sum:{quantity:true}
              });
              const alreadyFromLot=money(originalReturned._sum.quantity);
              const availableFromLot=Math.max(0,money(link.quantity)-alreadyFromLot);
              const restore=Math.min(availableFromLot,remainingToRestore);
              if(restore<=0) continue;

              const updatedLot=await tx.stockLot.updateMany({
                where:{id:link.lotId},
                data:{quantity:{increment:restore}}
              });
              if(updatedLot.count!==1) throw new Error("Lote de estoque não encontrado");

              remainingToRestore-=restore;
            }
            if(remainingToRestore>0) throw new Error("Não foi possível rastrear toda a devolução ao lote original");
          }

          const stockMovement=await tx.stockMovement.create({
            data:{
              productId:saleItem.productId,
              type:"DEVOLUCAO",
              quantity,
              reference:"DEVOLUCAO_PARCIAL",
              referenceId:saleItemId,
              notes:reason
            }
          });
          movementId=stockMovement.id;
        }

        returnLines.push({
          saleItemId,
          description:saleItem.description,
          quantity,
          amount:lineNet,
          movementId
        });
      }

      const globalDiscount=money(sale.discount);
      const discountShare=money(sale.subtotal)>0
        ? globalDiscount*(returnedSubtotal/money(sale.subtotal))
        : 0;
      const refundAmount=Math.max(0,Number((returnedSubtotal-discountShare).toFixed(2)));

      let remainingToApply=refundAmount;
      const adjustedAccounts:any[]=[];

      for(const account of sale.accounts){
        if(remainingToApply<=0) break;
        if(account.type!=="RECEBER"||account.status==="CANCELADO") continue;

        const outstanding=Math.max(0,money(account.amount)-money(account.paidAmount));
        if(outstanding<=0) continue;

        const reduction=Math.min(outstanding,remainingToApply);
        const newAmount=Number((money(account.amount)-reduction).toFixed(2));
        const newStatus=money(account.paidAmount)>=newAmount-0.001
          ?"PAGO"
          :"PARCIAL";

        const updated=await tx.account.update({
          where:{id:account.id},
          data:{amount:newAmount,status:newStatus}
        });
        adjustedAccounts.push({id:updated.id,reduction,newAmount,status:newStatus});
        remainingToApply=Number((remainingToApply-reduction).toFixed(2));
      }

      let refundRecord:any=null;
      if(remainingToApply>0){
        const refundMethodId=b.refundMethodId?String(b.refundMethodId):null;
        const method=refundMethodId
          ? await tx.paymentMethod.findUnique({where:{id:refundMethodId}})
          : null;

        if(!method||!method.active) throw new Error("Informe um meio de reembolso válido para o valor já pago");

        if(method.isCash){
          const session=await tx.cashSession.findFirst({
            where:{closedAt:null},
            orderBy:{openedAt:"desc"}
          });
          if(!session) throw new Error("É necessário um caixa aberto para reembolsar em dinheiro");

          const movement=await tx.cashMovement.create({
            data:{
              sessionId:session.id,
              kind:"SAIDA",
              amount:remainingToApply,
              description:"Reembolso de devolução parcial da venda #"+sale.number,
              referenceId:sale.id
            }
          });

          refundRecord={methodId:method.id,method:method.name,amount:remainingToApply,status:"REEMBOLSADO",cashMovementId:movement.id};
        }else{
          refundRecord={methodId:method.id,method:method.name,amount:remainingToApply,status:"PENDENTE_REEMBOLSO"};
        }

        const refundAccount=await tx.account.create({
          data:{
            type:"PAGAR",
            description:"Reembolso de devolução parcial da venda #"+sale.number,
            customerId:sale.customerId||undefined,
            saleId:sale.id,
            dueDate:new Date(),
            amount:remainingToApply,
            paidAmount:method.isCash?remainingToApply:0,
            status:method.isCash?"PAGO":"PENDENTE",
            notes:reason
          }
        });

        if(method.isCash){
          await tx.accountSettlement.create({
            data:{
              accountId:refundAccount.id,
              amount:remainingToApply,
              method:method.name,
              methodId:method.id,
              reference:"DEVOLUCAO_PARCIAL:"+sale.id,
              notes:reason
            }
          });
        }
        refundRecord.accountId=refundAccount.id;
      }

      await writeAudit(tx,{
        action:"CREATE",
        entity:"PartialSaleReturn",
        entityId:sale.id,
        userId:actor.id,
        metadata:{
          reason,
          items:returnLines,
          refundAmount,
          adjustedAccounts,
          refund:refundRecord
        }
      });

      return {
        saleId:sale.id,
        reason,
        items:returnLines,
        returnAmount:refundAmount,
        adjustedAccounts,
        refund:refundRecord
      };
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});

    const saleItemIds=b.items.map((item:any)=>String(item.saleItemId||"")).filter(Boolean);
    const movements=await db.stockMovement.findMany({where:{reference:"DEVOLUCAO_PARCIAL",referenceId:{in:saleItemIds}},select:{productId:true}});
    const siteSync=await syncPublishedProductStocks(movements.map(m=>m.productId));
    return NextResponse.json({...result,siteSync},{status:201});
  }catch(error){
    return NextResponse.json({
      error:error instanceof Error?error.message:"Não foi possível registrar a devolução parcial"
    },{status:400});
  }
}
