import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {writeAudit} from "@/lib/audit";

export async function POST(req:Request){
  try{
    const b=await req.json();
    if(!b.accountId) throw new Error("accountId é obrigatório");
    const amount=Number(b.amount);
    if(!Number.isFinite(amount)||amount<=0) throw new Error("Valor inválido");

    const result=await db.$transaction(async(tx)=>{
      const account=await tx.account.findUnique({where:{id:b.accountId}});
      if(!account) throw new Error("Conta não encontrada");

      let methodRecord=null;
      if(b.methodId){
        methodRecord=await tx.paymentMethod.findUnique({where:{id:String(b.methodId)}});
        if(!methodRecord||!methodRecord.active) throw new Error("Meio de pagamento inválido");
      }
      const paid=Number(account.paidAmount||0)+amount;
      const total=Number(account.amount);
      if(paid>total) throw new Error("Pagamento superior ao saldo da conta");

      const status=paid===total?"PAGO":"PARCIAL";

      const updated=await tx.account.update({
        where:{id:account.id},
        data:{paidAmount:paid,status}
      });

      const settlement=await tx.accountSettlement.create({
        data:{
          accountId:account.id,
          amount,
          method:b.method||methodRecord?.name||undefined,
          methodId:methodRecord?.id,
          reference:b.reference||undefined,
          notes:b.notes||undefined
        }
      });

      const session=methodRecord?.isCash
        ? await tx.cashSession.findFirst({where:{closedAt:null},orderBy:{openedAt:"desc"}})
        : null;
      if(methodRecord?.isCash&&!session) throw new Error("Não há caixa aberto para registrar a quitação");

      const movement=methodRecord?.isCash&&session
        ? await tx.cashMovement.create({
            data:{
              sessionId:session.id,
              kind:account.type==="RECEBER"?"ENTRADA":"SAIDA",
              amount,
              description:"Pagamento: "+account.description,
              referenceId:account.id
            }
          })
        : null;

      await writeAudit(tx,{action:"SETTLE",entity:"Account",entityId:account.id,metadata:{amount,method:b.method||methodRecord?.name||null,isCash:methodRecord?.isCash??null}});
      return {account:updated,settlement,movement};
    });

    return NextResponse.json(result,{status:201});
  }catch(error){
    return NextResponse.json({error:"Não foi possível registrar a quitação",detail:String(error)},{status:400});
  }
}