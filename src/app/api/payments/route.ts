import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {Prisma} from "@prisma/client";
import {writeAudit} from "@/lib/audit";

export async function POST(req:Request){
  try{
    const b=await req.json();
    if(!b.saleId) throw new Error("saleId é obrigatório");
    const amount=Number(b.amount);
    if(!Number.isFinite(amount)||amount<=0) throw new Error("Valor do pagamento inválido");
    if(!b.methodId) throw new Error("methodId é obrigatório");

    const result=await db.$transaction(async(tx)=>{
      const sale=await tx.sale.findUnique({where:{id:b.saleId}});
      if(!sale||sale.canceled) throw new Error("Venda não encontrada ou cancelada");

      const method=await tx.paymentMethod.findUnique({where:{id:b.methodId}});
      if(!method||!method.active) throw new Error("Meio de pagamento inválido");

      if(b.reference){
        const duplicate=await tx.payment.findFirst({where:{saleId:sale.id,reference:String(b.reference)}});
        if(duplicate) throw new Error("Pagamento com esta referência já foi registrado");
      }

      const session=method.isCash
        ? await tx.cashSession.findFirst({where:{closedAt:null},orderBy:{openedAt:"desc"}})
        : null;
      if(method.isCash&&!session) throw new Error("Não há caixa aberto");

      const paid=await tx.payment.aggregate({where:{saleId:sale.id},_sum:{amount:true}});
      const alreadyPaid=Number(paid._sum.amount||0);
      const remaining=Number(sale.total)-alreadyPaid;
      if(amount>remaining) throw new Error("Pagamento superior ao saldo da venda");

      const payment=await tx.payment.create({
        data:{saleId:sale.id,methodId:method.id,amount,reference:b.reference||undefined}
      });

      const movement=method.isCash&&session
        ? await tx.cashMovement.create({
            data:{
              sessionId:session.id,
              kind:"ENTRADA",
              amount,
              description:"Pagamento da venda #"+sale.number,
              referenceId:sale.id
            }
          })
        : null;

      await writeAudit(tx,{action:"CREATE",entity:"Payment",entityId:payment.id,metadata:{saleId:sale.id,amount,isCash:method.isCash}});
      return {payment,movement,remaining:remaining-amount};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});

    return NextResponse.json(result,{status:201});
  }catch(error){
    return NextResponse.json({error:"Não foi possível registrar o pagamento",detail:String(error)},{status:400});
  }
}
