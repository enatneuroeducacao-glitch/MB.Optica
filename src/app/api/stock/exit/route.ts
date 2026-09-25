import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {writeAudit} from "@/lib/audit";

export async function POST(req:Request){
  try{
    const b=await req.json();
    if(!b.productId) throw new Error("productId é obrigatório");
    const quantity=Number(b.quantity);
    if(!Number.isFinite(quantity)||quantity<=0) throw new Error("Quantidade inválida");

    const result=await db.$transaction(async(tx)=>{
      const lots=await tx.stockLot.findMany({
        where:{productId:b.productId,archived:false,quantity:{gt:0}},
        orderBy:{receivedAt:"asc"}
      });

      let remaining=quantity;
      const consumed:{lotId:string,quantity:number}[]=[];

      for(const lot of lots){
        if(remaining<=0) break;
        const take=Math.min(Number(lot.quantity),remaining);
        await tx.stockLot.update({
          where:{id:lot.id},
          data:{quantity:{decrement:take}}
        });
        consumed.push({lotId:lot.id,quantity:take});
        remaining-=take;
      }

      if(remaining>0) throw new Error("Estoque insuficiente");

      const movement=await tx.stockMovement.create({
        data:{
          productId:b.productId,
          type:"SAIDA",
          quantity,
          reference:"MANUAL",\n          notes:b.reason||"Saída de estoque",
          referenceId:b.referenceId||undefined
        }
      });

      await writeAudit(tx,{action:"CREATE",entity:"StockMovement",entityId:movement.id,metadata:{type:"SAIDA",quantity,consumed}});
      return {movement,consumed};
    });

    return NextResponse.json(result);
  }catch(error){
    return NextResponse.json({error:"Não foi possível registrar a saída",detail:String(error)},{status:400});
  }
}