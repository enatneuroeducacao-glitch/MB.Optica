import {NextResponse} from "next/server";
import {db} from "@/lib/db";

export async function POST(req:Request){
  try{
    const b=await req.json();
    if(!b.saleId) throw new Error("saleId é obrigatório");
    const amount=Number(b.amount);
    if(!Number.isFinite(amount)||amount<=0) throw new Error("Valor do pagamento inválido");
    if(!b.methodId) throw new Error("methodId é obrigatório");

    const result=await db.$transaction(async(tx)=>{
      const sale=await tx.sale.findUnique({where:{id:b.saleId}});
      if(!sale) throw new Error("Venda não encontrada");

      const payment=await tx.payment.create({
        data:{
          saleId:sale.id,
          methodId:b.methodId,
          amount,
          reference:b.reference||undefined
        }
      });

      return payment;
    });

    return NextResponse.json(result,{status:201});
  }catch(error){
    return NextResponse.json({error:"Não foi possível registrar o pagamento",detail:String(error)},{status:400});
  }
}