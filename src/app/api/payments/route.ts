import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {Prisma} from "@prisma/client";
import {writeAudit} from "@/lib/audit";
import {requireRole} from "@/lib/auth";

export async function POST(req:Request){
  try{
    const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR","FINANCEIRO"]);
    const b=await req.json();
    if(!b.saleId) throw new Error("saleId é obrigatório");
    const amount=Number(b.amount);
    if(!Number.isFinite(amount)||amount<=0) throw new Error("Valor do pagamento inválido");
    if(!b.methodId) throw new Error("methodId é obrigatório");

    const cardMachineId=b.cardMachineId?String(b.cardMachineId):null;
    const cardInstallments=b.cardInstallments===undefined||b.cardInstallments===null||b.cardInstallments===""?null:Math.max(1,Math.floor(Number(b.cardInstallments)));
    const cardFeeRate=b.cardFeeRate===undefined||b.cardFeeRate===null||b.cardFeeRate===""?null:Number(b.cardFeeRate);
    if(cardInstallments!==null&&!Number.isFinite(cardInstallments)) throw new Error("Número de parcelas inválido");
    if(cardFeeRate!==null&&(!Number.isFinite(cardFeeRate)||cardFeeRate<0||cardFeeRate>100)) throw new Error("Taxa da maquininha inválida");

    const result=await db.$transaction(async(tx)=>{
      const sale=await tx.sale.findUnique({where:{id:b.saleId}});
      if(!sale||sale.canceled) throw new Error("Venda não encontrada ou cancelada");

      const method=await tx.paymentMethod.findUnique({where:{id:b.methodId}});
      if(!method||!method.active) throw new Error("Meio de pagamento inválido");

      const isCredit=method.name.toLocaleLowerCase("pt-BR").includes("cartão de crédito") || method.name.toLocaleLowerCase("pt-BR").includes("cartao de credito");
      let cardMachine:any=null;
      if(cardMachineId||cardInstallments!==null||cardFeeRate!==null){
        if(!isCredit) throw new Error("Dados de maquininha só podem ser usados em cartão de crédito");
        if(!cardMachineId) throw new Error("Selecione a maquininha utilizada");
        cardMachine=await tx.cardMachine.findUnique({where:{id:cardMachineId}});
        if(!cardMachine||!cardMachine.active) throw new Error("Maquininha não encontrada ou inativa");
        if(cardInstallments===null) throw new Error("Informe o número de parcelas");
        if(cardFeeRate===null) throw new Error("Informe a taxa da maquininha");
      }

      if(b.reference){
        const duplicate=await tx.payment.findFirst({where:{saleId:sale.id,reference:String(b.reference)}});
        if(duplicate) throw new Error("Pagamento com esta referência já foi registrado");
      }

      const session=method.isCash
        ? await tx.cashSession.findFirst({where:{closedAt:null},orderBy:{openedAt:"desc"}})
        : null;
      if(method.isCash&&!session) throw new Error("Não há caixa aberto");

      const paid=await tx.payment.aggregate({where:{saleId:sale.id,reversedAt:null},_sum:{amount:true}});
      const alreadyPaid=Number(paid._sum.amount||0);
      const remaining=Number(sale.total)-alreadyPaid;
      if(amount>remaining) throw new Error("Pagamento superior ao saldo da venda");

      const cardFeeAmount=cardFeeRate===null?null:Number((amount*cardFeeRate/100).toFixed(2));
      const cardNetAmount=cardFeeAmount===null?null:Number((amount-cardFeeAmount).toFixed(2));

      const payment=await tx.payment.create({
        data:{
          saleId:sale.id,
          methodId:method.id,
          amount,
          reference:b.reference||undefined,
          cardMachineId:cardMachine?.id,
          cardInstallments:cardInstallments??undefined,
          cardFeeRate:cardFeeRate??undefined,
          cardFeeAmount:cardFeeAmount??undefined,
          cardNetAmount:cardNetAmount??undefined
        }
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

      await writeAudit(tx,{action:"PAYMENT",entity:"Payment",entityId:payment.id,userId:actor.id,request:req,metadata:{saleId:sale.id,amount,isCash:method.isCash}});
      return {payment,movement,remaining:remaining-amount};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});

    return NextResponse.json(result,{status:201});
  }catch(error){
    return NextResponse.json({error:"Não foi possível registrar o pagamento",detail:String(error)},{status:400});
  }
}
