import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {Prisma} from "@prisma/client";
import {writeAudit} from "@/lib/audit";

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const b=await req.json().catch(()=>({}));
    const result=await db.$transaction(async(tx)=>{
      const payment=await tx.payment.findUnique({where:{id},include:{sale:true,method:true}});
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

      const reversed=await tx.payment.update({
        where:{id},
        data:{reversedAt:new Date(),reversalReference:b.reference?String(b.reference):undefined}
      });
      await writeAudit(tx,{action:"REVERSE",entity:"Payment",entityId:id,metadata:{saleId:payment.saleId,amount:payment.amount.toString(),isCash:payment.method.isCash,reason:b.reason||null}});
      return {payment:reversed,movement};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json(result);
  }catch(error){
    return NextResponse.json({error:"Não foi possível estornar o pagamento",detail:String(error)},{status:400});
  }
}
