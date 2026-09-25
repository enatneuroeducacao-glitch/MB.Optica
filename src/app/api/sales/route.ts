import {NextResponse} from "next/server";
import {db} from "@/lib/db";

export async function POST(req:Request){
  try{
    const b=await req.json();
    if(!b.customerId) throw new Error("customerId é obrigatório");
    const total=Number(b.total||0);
    if(!Number.isFinite(total)||total<0) throw new Error("Valor total inválido");

    const result=await db.$transaction(async(tx)=>{
      const sale=await tx.sale.create({
        data:{
          customerId:b.customerId,
          sellerId:b.sellerId||undefined,
          total,
          discount:Number(b.discount||0),
          notes:b.notes||undefined,
          items:{
            create:(Array.isArray(b.items)?b.items:[]).map((item:any)=>({
              productId:item.productId||undefined,
              description:String(item.description||"Item"),
              quantity:Number(item.quantity||1),
              unitPrice:Number(item.unitPrice||0),
              total:Number(item.total||0)
            }))
          }
        },
        include:{items:true}
      });

      if(Array.isArray(b.stock)){
        for(const item of b.stock){
          const quantity=Number(item.quantity||0);
          if(quantity>0){
            const lots=await tx.stockLot.findMany({
              where:{productId:item.productId,archived:false,quantity:{gt:0}},
              orderBy:{entry:"asc"}
            });
            let remaining=quantity;
            for(const lot of lots){
              if(remaining<=0) break;
              const take=Math.min(Number(lot.quantity),remaining);
              await tx.stockLot.update({where:{id:lot.id},data:{quantity:{decrement:take}}});
              remaining-=take;
            }
            if(remaining>0) throw new Error("Estoque insuficiente para "+item.productId);
            await tx.stockMovement.create({
              data:{productId:item.productId,type:"SAIDA",quantity,reason:"Venda",referenceId:sale.id}
            });
          }
        }
      }
      return sale;
    });

    return NextResponse.json(result,{status:201});
  }catch(error){
    return NextResponse.json({error:"Não foi possível registrar a venda",detail:String(error)},{status:400});
  }
}