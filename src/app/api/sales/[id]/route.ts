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
          items:true,
          payments:true,
          accounts:{where:{type:"RECEBER"},include:{settlements:true}},
          fiscalDocument:true
        }
      });
      if(!sale) throw new Error("Venda não encontrada.");
      if(sale.canceled) throw new Error("Não é possível editar uma venda cancelada.");
      if(sale.fiscalDocument) throw new Error("Esta venda possui documento fiscal. Não é permitido alterar os valores por esta tela.");
      if(sale.payments.length) throw new Error("Esta venda já possui registros de pagamento. Para preservar a conciliação, os valores não podem ser editados por esta tela.");
      if(sale.accounts.some(a=>a.settlements.length||Number(a.paidAmount)>0)){
        throw new Error("Há recebimentos vinculados às contas desta venda. Não é possível editar os valores.");
      }

      const subtotal=Number(sale.subtotal);
      if(discount>subtotal) throw new Error("O desconto não pode ser maior que o subtotal.");
      const total=Math.max(0,Math.round((subtotal-discount+surcharge+Number.EPSILON)*100)/100);

      const recognition=await tx.accountingEvent.findFirst({
        where:{sourceType:"Sale",sourceId:sale.id,eventType:"SALE_RECOGNIZED"}
      });
      if(recognition&&recognition.status!=="PENDENTE"){
        throw new Error("O evento contábil desta venda já foi processado. Faça a correção pelo fluxo contábil para manter a rastreabilidade.");
      }

      const updated=await tx.sale.update({
        where:{id:sale.id},
        data:{discount,surcharge,total,notes:notes||null}
      });

      if(sale.accounts.length){
        const oldReceivableTotal=sale.accounts.reduce((sum,a)=>sum+Number(a.amount),0);
        let allocated=0;
        for(let index=0;index<sale.accounts.length;index++){
          const account=sale.accounts[index];
          const amount=index===sale.accounts.length-1
            ? Math.round((total-allocated)*100)/100
            : Math.round((oldReceivableTotal>0?total*Number(account.amount)/oldReceivableTotal:total/sale.accounts.length)*100)/100;
          allocated+=amount;
          await tx.account.update({where:{id:account.id},data:{amount:Math.max(0,amount)}});
        }
      }

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
          previousDiscount:Number(sale.discount),
          discount,
          previousSurcharge:Number(sale.surcharge),
          surcharge,
          previousTotal:Number(sale.total),
          total,
          notesChanged:(sale.notes||"")!==notes
        }
      });
      return updated;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:10000,timeout:20000});

    return NextResponse.json(result);
  }catch(error){
    return NextResponse.json({error:"Não foi possível editar a venda",detail:error instanceof Error?error.message:String(error)},{status:400});
  }
}
