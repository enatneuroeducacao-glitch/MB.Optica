import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {Prisma} from "@prisma/client";
import {writeAudit} from "@/lib/audit";

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const b=await req.json().catch(()=>({}));
    const result=await db.$transaction(async(tx)=>{
      const payment=await tx.payment.findUnique({
        where:{id},
        include:{
          sale:true,
          method:true,
          accountSettlement:{include:{account:true}}
        }
      });
      if(!payment) throw new Error("Pagamento não encontrado");
      if(payment.reversedAt) throw new Error("Pagamento já estornado");
      if(payment.sale.canceled) throw new Error("Venda cancelada");

      let movement=null;
      if(payment.method.isCash){
        const session=await tx.cashSession.findFirst({where:{closedAt:null},orderBy:{openedAt:"desc"}});
        if(!session) throw new Error("É necessário um caixa aberto para estornar pagamento em dinheiro");
        movement=await tx.cashMovement.create({
          data:{
            sessionId:session.id,
            kind:"SAIDA",
            amount:payment.amount,
            description:"Estorno do pagamento da venda #"+payment.sale.number,
            referenceId:payment.saleId
          }
        });
      }

      const reversedAt=new Date();
      const reversed=await tx.payment.update({
        where:{id},
        data:{reversedAt,reversalReference:b.reference?String(b.reference):undefined}
      });

      let reversedSettlement=null;
      let updatedAccount=null;
      if(payment.accountSettlement){
        const settlement=payment.accountSettlement;
        if(settlement.reversedAt) throw new Error("Liquidação da conta já foi estornada");

        reversedSettlement=await tx.accountSettlement.update({
          where:{id:settlement.id},
          data:{reversedAt}
        });

        const nextPaidAmount=Math.max(0,Number(settlement.account.paidAmount)-Number(settlement.amount));
        const nextStatus=nextPaidAmount<=0
          ?"PENDENTE"
          :nextPaidAmount+0.001>=Number(settlement.account.amount)
            ?"PAGO"
            :"PARCIAL";

        updatedAccount=await tx.account.update({
          where:{id:settlement.accountId},
          data:{paidAmount:nextPaidAmount,status:nextStatus}
        });
      }

      await writeAudit(tx,{
        action:"REVERSE",
        entity:"Payment",
        entityId:id,
        metadata:{
          saleId:payment.saleId,
          amount:payment.amount.toString(),
          isCash:payment.method.isCash,
          reason:b.reason||null,
          accountSettlementId:payment.accountSettlement?.id||null,
          reversedSettlement:!!reversedSettlement,
          accountId:updatedAccount?.id||null
        }
      });
      return {payment:reversed,movement,reversedSettlement,account:updatedAccount};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json(result);
  }catch(error){
    return NextResponse.json({error:"Não foi possível estornar o pagamento",detail:String(error)},{status:400});
  }
}
