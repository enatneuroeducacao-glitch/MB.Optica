import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {Prisma} from "@prisma/client";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await requireRole(["ADMIN","GERENTE","FINANCEIRO"]);
    const {id}=await params;
    const body=await req.json();
    const discount=Number(body.discount);
    const surcharge=Number(body.surcharge);
    const notes=body.notes===null||body.notes===undefined?"":String(body.notes).trim();

    if(!Number.isFinite(discount)||discount<0||!Number.isFinite(surcharge)||surcharge<0){
      throw new Error("Informe desconto e acréscimo válidos.");
    }
    if(notes.length>2000) throw new Error("As observações devem ter no máximo 2.000 caracteres.");

    const result=await db.$transaction(async(tx)=>{
      const sale=await tx.sale.findUnique({
        where:{id},
        include:{
          payments:true,
          accounts:{include:{settlements:{include:{payment:true}}}},
          fiscalDocument:true
        }
      });
      if(!sale) throw new Error("Venda não encontrada.");
      if(sale.canceled) throw new Error("Não é possível editar uma venda cancelada.");
      if(sale.fiscalDocument && !["CANCELADO","REJEITADO","INUTILIZADO"].includes(sale.fiscalDocument.status)){
        throw new Error("Esta venda possui documento fiscal ativo. Regularize o documento fiscal antes de alterar os valores.");
      }

      const subtotal=Number(sale.subtotal);
      if(discount>subtotal) throw new Error("O desconto não pode ser maior que o subtotal.");
      const total=Math.max(0,Math.round((subtotal-discount+surcharge+Number.EPSILON)*100)/100);

      const recognition=await tx.accountingEvent.findFirst({
        where:{sourceType:"Sale",sourceId:sale.id,eventType:"SALE_RECOGNIZED"}
      });
      if(recognition&&recognition.status!=="PENDENTE"){
        throw new Error("O evento contábil desta venda já foi processado. A correção precisa ser feita pelo fluxo contábil para manter a rastreabilidade.");
      }

      // Recebimentos diretos e baixas sem pagamento vinculado contam como valores já recebidos.
      // Pagamentos vinculados a uma baixa não são somados duas vezes.
      const activePayments=sale.payments.filter(p=>!p.reversedAt);
      const directPaid=activePayments.reduce((sum,p)=>sum+Number(p.amount),0);
      const unlinkedSettlements=sale.accounts.flatMap(a=>a.settlements)
        .filter(s=>!s.reversedAt&&(!s.payment||s.payment.reversedAt))
        .reduce((sum,s)=>sum+Number(s.amount),0);
      const received=Math.round((directPaid+unlinkedSettlements+Number.EPSILON)*100)/100;
      const desiredReceivable=Math.max(0,Math.round((total-received+Number.EPSILON)*100)/100);

      const receivables=sale.accounts.filter(a=>a.type==="RECEBER"&&a.status!=="CANCELADO");
      const currentOpen=receivables.reduce((sum,a)=>sum+Math.max(0,Number(a.amount)-Number(a.paidAmount)),0);
      let difference=Math.round((desiredReceivable-currentOpen+Number.EPSILON)*100)/100;

      // Só ajusta saldo ainda em aberto. O valor já baixado e cada conciliação permanecem intactos.
      if(difference<0){
        let reduction=-difference;
        const adjustable=[...receivables].sort((a,b)=>b.dueDate.getTime()-a.dueDate.getTime());
        for(const account of adjustable){
          if(reduction<=0.009) break;
          const amount=Number(account.amount);
          const paidAmount=Number(account.paidAmount);
          const open=Math.max(0,amount-paidAmount);
          const take=Math.min(open,reduction);
          if(take<=0) continue;
          const nextAmount=Math.round((amount-take+Number.EPSILON)*100)/100;
          await tx.account.update({
            where:{id:account.id},
            data:{
              amount:Math.max(paidAmount,nextAmount),
              status:Math.max(paidAmount,nextAmount)<=paidAmount+0.009?"PAGO":paidAmount>0?"PARCIAL":"PENDENTE"
            }
          });
          reduction=Math.round((reduction-take+Number.EPSILON)*100)/100;
        }
        difference=0;
      }else if(difference>0.009){
        await tx.account.create({
          data:{
            type:"RECEBER",
            description:"Ajuste de valor da venda #"+sale.number,
            customerId:sale.customerId||undefined,
            saleId:sale.id,
            dueDate:new Date(),
            amount:difference,
            paidAmount:0,
            status:"PENDENTE",
            notes:"Saldo complementar gerado pela edição controlada da venda."
          }
        });
      }

      // Se o total ficar abaixo do que já foi recebido, registra reembolso a fazer.
      // O lançamento fica pendente: não afirma que houve devolução no banco/cartão/PIX.
      const refundTarget=Math.max(0,Math.round((received-total+Number.EPSILON)*100)/100);
      const refundPrefix="Reembolso pendente por ajuste da venda #"+sale.number;
      const refundAccounts=sale.accounts.filter(a=>a.type==="PAGAR"&&a.description.startsWith(refundPrefix));
      const alreadyRefunded=refundAccounts.reduce((sum,a)=>sum+Number(a.paidAmount),0);
      const refundOutstanding=Math.max(0,refundTarget-alreadyRefunded);
      if(refundAccounts.length){
        let remaining=refundOutstanding;
        for(const account of refundAccounts){
          const paidAmount=Number(account.paidAmount);
          const allocation=Math.min(Math.max(0,Number(account.amount)-paidAmount),remaining);
          const nextAmount=Math.round((paidAmount+allocation+Number.EPSILON)*100)/100;
          await tx.account.update({
            where:{id:account.id},
            data:{amount:nextAmount,status:nextAmount<=paidAmount+0.009?"PAGO":paidAmount>0?"PARCIAL":"PENDENTE"}
          });
          remaining=Math.max(0,Math.round((remaining-allocation+Number.EPSILON)*100)/100);
        }
        if(remaining>0.009){
          await tx.account.create({data:{
            type:"PAGAR",description:refundPrefix,customerId:sale.customerId||undefined,saleId:sale.id,
            dueDate:new Date(),amount:remaining,paidAmount:0,status:"PENDENTE",
            notes:"Reembolso ainda não realizado. Registre a liquidação somente após a devolução efetiva."
          }});
        }
      }else if(refundOutstanding>0.009){
        await tx.account.create({data:{
          type:"PAGAR",description:refundPrefix,customerId:sale.customerId||undefined,saleId:sale.id,
          dueDate:new Date(),amount:refundOutstanding,paidAmount:0,status:"PENDENTE",
          notes:"Reembolso ainda não realizado. Registre a liquidação somente após a devolução efetiva."
        }});
      }

      const updated=await tx.sale.update({
        where:{id:sale.id},
        data:{discount,surcharge,total,notes:notes||null}
      });

      const payload={amount:total,entryDate:sale.createdAt.toISOString(),description:"Reconhecimento da venda #"+sale.number+" (valor atualizado)"};
      if(recognition){
        await tx.accountingEvent.update({where:{id:recognition.id},data:{payload,status:"PENDENTE",errorMessage:null}});
      }else if(total>0){
        await tx.accountingEvent.create({
          data:{
            eventType:"SALE_RECOGNIZED",
            sourceType:"Sale",
            sourceId:sale.id,
            idempotencyKey:"SALE_RECOGNIZED:"+sale.id,
            payload,
            status:"PENDENTE"
          }
        });
      }

      await writeAudit(tx,{
        action:"UPDATE",
        entity:"Sale",
        entityId:sale.id,
        userId:actor.id,
        request:req,
        metadata:{
          previousDiscount:Number(sale.discount),discount,
          previousSurcharge:Number(sale.surcharge),surcharge,
          previousTotal:Number(sale.total),total,
          activePaymentsTotal:directPaid,
          unlinkedSettlementsTotal:unlinkedSettlements,
          receivableOpenBefore:currentOpen,
          receivableOpenAfter:desiredReceivable,
          refundPending:refundTarget,
          notesChanged:(sale.notes||"")!==notes
        }
      });
      return {...updated,financialAdjustment:{received,receivableOpen:desiredReceivable,refundPending:refundTarget}};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:10000,timeout:20000});

    return NextResponse.json(result);
  }catch(error){
    return NextResponse.json({error:"Não foi possível editar a venda",detail:error instanceof Error?error.message:String(error)},{status:400});
  }
}
