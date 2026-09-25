import {NextResponse} from "next/server";
import {db} from "@/lib/db";

export async function POST(req:Request){
  try{
    const b=await req.json();
    if(!b.productId) throw new Error("productId é obrigatório");
    const quantity=Number(b.quantity);
    if(!Number.isFinite(quantity)||quantity<=0) throw new Error("Quantidade inválida");
    const result=await db.$transaction(async tx=>{
      const product=await tx.product.findUnique({where:{id:b.productId}});
      if(!product) throw new Error("Produto não encontrado");
      const lot=await tx.stockLot.create({data:{productId:product.id,code:b.code||undefined,description:b.description||product.description,quantity,cost:b.cost!==undefined?Number(b.cost):Number(product.cost),receivedAt:b.entry?new Date(b.entry):new Date(),expiresAt:b.expiresAt?new Date(b.expiresAt):undefined}});
      const movement=await tx.stockMovement.create({data:{productId:product.id,type:"ENTRADA",quantity,unitCost:Number(b.cost??product.cost),reference:"LOTE",referenceId:lot.id,notes:b.reason||"Entrada de estoque"}});
      return {lot,movement};
    });
    return NextResponse.json(result,{status:201});
  }catch(error){return NextResponse.json({error:"Não foi possível registrar a entrada",detail:String(error)},{status:400});}
}