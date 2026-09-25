import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {Prisma} from "@prisma/client";
import {writeAudit} from "@/lib/audit";

export async function POST(req:Request){
  try{
    const b=await req.json();
    if(!b.customerId) throw new Error("customerId é obrigatório");
    if(!b.sellerId) throw new Error("sellerId é obrigatório");
    if(!Array.isArray(b.items)||b.items.length===0) throw new Error("A venda precisa ter itens");

    const discount=Number(b.discount||0);
    const surcharge=Number(b.surcharge||0);
    if(!Number.isFinite(discount)||discount<0||!Number.isFinite(surcharge)||surcharge<0) throw new Error("Desconto ou acréscimo inválido");

    const result=await db.$transaction(async(tx)=>{
      const customer=await tx.customer.findUnique({where:{id:b.customerId}});
      if(!customer||!customer.active) throw new Error("Cliente não encontrado ou inativo");

      const seller=await tx.user.findUnique({where:{id:b.sellerId}});
      if(!seller||!seller.active) throw new Error("Vendedor não encontrado ou inativo");

      let linkedOrder:any=null;
      if(b.orderId){
        linkedOrder=await tx.opticalOrder.findUnique({where:{id:String(b.orderId)}});
        if(!linkedOrder) throw new Error("Pedido óptico não encontrado");
        if(linkedOrder.customerId!==customer.id) throw new Error("Pedido óptico não pertence ao cliente");
        if(["CANCELADO","DEVOLVIDO"].includes(linkedOrder.status)) throw new Error("Pedido óptico não pode gerar venda");
        const existingSale=await tx.sale.findUnique({where:{orderId:linkedOrder.id}});
        if(existingSale) throw new Error("Pedido óptico já possui uma venda");
      }

      let subtotal=0;
      const items:any[]=[];
      for(const item of b.items){
        const quantity=Number(item.quantity);
        const unitPrice=Number(item.unitPrice);
        const itemDiscount=Number(item.discount||0);
        if(!Number.isFinite(quantity)||quantity<=0) throw new Error("Quantidade de item inválida");
        if(!Number.isFinite(unitPrice)||unitPrice<0) throw new Error("Preço de item inválido");
        if(!Number.isFinite(itemDiscount)||itemDiscount<0) throw new Error("Desconto de item inválido");
        const lineTotal=Math.max(0,quantity*unitPrice-itemDiscount);

        let unitCost=Number(item.unitCost||0);
        if(item.productId){
          const product=await tx.product.findUnique({where:{id:item.productId}});
          if(!product||!product.active) throw new Error("Produto não encontrado ou inativo");
          if(!item.description) item.description=product.description;
          if(!Number.isFinite(unitCost)||unitCost<0) unitCost=Number(product.cost);
        }

        subtotal+=lineTotal;
        items.push({
          productId:item.productId||undefined,
          description:String(item.description||"Item"),
          quantity,
          unitPrice,
          unitCost,
          discount:itemDiscount,
          total:lineTotal
        });
      }

      const total=Math.max(0,subtotal-discount+surcharge);

      const sale=await tx.sale.create({
        data:{
          customerId:customer.id,
          sellerId:seller.id,
          orderId:linkedOrder?.id,
          subtotal,
          discount,
          surcharge,
          total,
          notes:b.notes||undefined,
          items:{create:items}
        },
        include:{items:true}
      });

      if(Array.isArray(b.stock)){
        const requested=new Map<string,number>();
        for(const item of b.stock){
          const productId=String(item.productId||"");
          const quantity=Number(item.quantity||0);
          if(!productId||quantity<=0) continue;
          if(!Number.isFinite(quantity)) throw new Error("Quantidade de estoque inválida");
          requested.set(productId,(requested.get(productId)||0)+quantity);
        }

        for(const [productId,quantity] of requested){
          const product=await tx.product.findUnique({where:{id:productId}});
          if(!product||!product.active) throw new Error("Produto de estoque inválido: "+productId);

          const lots=await tx.stockLot.findMany({
            where:{productId:product.id,archived:false,quantity:{gt:0}},
            orderBy:{receivedAt:"asc"}
          });
          let remaining=quantity;
          const consumedLots:{lotId:string,quantity:number}[]=[];
          for(const lot of lots){
            if(remaining<=0) break;
            const take=Math.min(Number(lot.quantity),remaining);
            if(take<=0) continue;
            const updated=await tx.stockLot.updateMany({
              where:{id:lot.id,quantity:{gte:take}},
              data:{quantity:{decrement:take}}
            });
            if(updated.count===1){ consumedLots.push({lotId:lot.id,quantity:take}); remaining-=take; }
          }
          if(remaining>0) throw new Error("Estoque insuficiente para "+product.description);

          const movement=await tx.stockMovement.create({
            data:{
              productId:product.id,
              type:"SAIDA",
              quantity,
              reference:"VENDA",
              referenceId:sale.id,
              notes:"Saída por venda",
              lotLinks:{create:consumedLots}
            }
          });
        }
      }

      await writeAudit(tx,{action:"CREATE",entity:"Sale",entityId:sale.id,userId:seller.id,metadata:{total:sale.total.toString(),items:sale.items.length}});
      return sale;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});

    return NextResponse.json(result,{status:201});
  }catch(error){
    return NextResponse.json({error:"Não foi possível registrar a venda",detail:String(error)},{status:400});
  }
}
