import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {writeAudit} from "@/lib/audit";

export async function GET(){
  const [methods,receivables,payables]=await Promise.all([
    db.paymentMethod.findMany({where:{active:true},orderBy:{name:"asc"}}),
    db.account.findMany({
      where:{type:"RECEBER",status:{in:["PENDENTE","PARCIAL"]}},
      orderBy:{dueDate:"asc"},
      take:200,
      include:{customer:{select:{id:true,name:true}},sale:{select:{id:true,number:true,total:true}},settlements:{orderBy:{paidAt:"desc"}}}
    }),
    db.account.findMany({
      where:{type:"PAGAR",status:{in:["PENDENTE","PARCIAL"]}},
      orderBy:{dueDate:"asc"},
      take:200,
      include:{supplier:{select:{id:true,name:true}},settlements:{orderBy:{paidAt:"desc"}}}
    })
  ]);

  return NextResponse.json({methods,receivables,payables});
}

export async function POST(req:Request){
  try{
    const b=await req.json();
    if(!b.type||!["RECEBER","PAGAR"].includes(b.type)) throw new Error("Tipo de conta inválido");
    if(!b.description||!String(b.description).trim()) throw new Error("Descrição é obrigatória");

    const amount=Number(b.amount);
    if(!Number.isFinite(amount)||amount<=0) throw new Error("Valor inválido");

    const dueDate=b.dueDate?new Date(b.dueDate):new Date();
    if(Number.isNaN(dueDate.getTime())) throw new Error("Data de vencimento inválida");

    const account=await db.$transaction(async tx=>{
      const customerId=b.customerId?String(b.customerId):undefined;
      const supplierId=b.supplierId?String(b.supplierId):undefined;
      const saleId=b.saleId?String(b.saleId):undefined;

      if(b.type==="RECEBER"&&supplierId) throw new Error("Conta a receber não pode estar vinculada a fornecedor");
      if(b.type==="PAGAR"&&customerId) throw new Error("Conta a pagar não pode estar vinculada a cliente");

      if(customerId){
        const customer=await tx.customer.findUnique({where:{id:customerId,active:true}});
        if(!customer) throw new Error("Cliente não encontrado ou inativo");
      }

      if(supplierId){
        const supplier=await tx.supplier.findUnique({where:{id:supplierId,active:true}});
        if(!supplier) throw new Error("Fornecedor não encontrado ou inativo");
      }

      if(saleId){
        if(b.type!=="RECEBER") throw new Error("Venda só pode gerar conta a receber");
        const sale=await tx.sale.findUnique({where:{id:saleId}});
        if(!sale) throw new Error("Venda não encontrada");
        if(sale.canceled) throw new Error("Venda cancelada não pode gerar conta");
      }

      const created=await tx.account.create({
        data:{
          type:b.type,
          description:String(b.description).trim(),
          amount,
          dueDate,
          customerId,
          supplierId,
          saleId,
          notes:b.notes?String(b.notes).trim():undefined
        }
      });

      await writeAudit(tx,{
        action:"CREATE",
        entity:"Account",
        entityId:created.id,
        metadata:{
          type:created.type,
          amount:created.amount.toString(),
          dueDate:created.dueDate.toISOString(),
          customerId:created.customerId,
          supplierId:created.supplierId,
          saleId:created.saleId
        }
      });

      return created;
    });

    return NextResponse.json(account,{status:201});
  }catch(error){
    return NextResponse.json({error:"Não foi possível lançar a conta",detail:String(error)},{status:400});
  }
}