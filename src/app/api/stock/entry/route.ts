import {NextResponse} from "next/server";
import {db} from "@/lib/db";

export async function POST(req:Request){
  try{
    const b=await req.json();
    if(!b.productId) throw new Error("productId é obrigatório");
    const quantity=Number(b.quantity);
    if(!Number.isFinite(quantity)||quantity<=0) throw new Error("Quantidade inválida");

    const result=await db.$transaction(async(tx)=>{
      const product=await tx.product.findUnique({where:{id:b.productId}});
      if(!product) throw new Error("Produto não encontrado");

      const lot=await tx.stockLot.create({
        data:{
          productId:product.id,
          description:b.description||product.description,
          quantity,
          entry:b.entry?new Date(b.entry):new Date(),
          archived:false
        }
      });

      const movement=await tx.stockMovement.create({
        data:{
          productId:product.id,
          type:"ENTRADA",
          quantity,
          reason:b.reason||"Entrada de estoque",
          referenceId:lot.id
        }
      });

      return {lot,movement};
    });

    return NextResponse.json(result,{status:201});
  }catch(error){
    return NextResponse.json({error:"Não foi possível registrar a entrada",detail:String(error)},{status:400});
  }
}