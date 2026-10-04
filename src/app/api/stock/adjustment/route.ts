import {syncPublishedProductStock} from "@/lib/site-stock-sync";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";

export async function POST(req:Request){
 try{
  const actor=await requireRole(["ADMIN","GERENTE","LABORATORIO"]);
  const b=await req.json();
  if(!b.productId)throw new Error("productId é obrigatório");
  const quantity=Number(b.quantity);
  const direction=b.direction==="SAIDA"?"SAIDA":"ENTRADA";
  if(!Number.isFinite(quantity)||quantity<=0)throw new Error("Quantidade inválida");

  const result=await db.$transaction(async tx=>{
   const product=await tx.product.findUnique({where:{id:String(b.productId)}});
   if(!product||!product.active)throw new Error("Produto não encontrado ou inativo");
   if(!product.stockControlled)throw new Error("Este produto não controla estoque e não pode ser ajustado.");

   const consumed:{lotId:string,quantity:number}[]=[];
   let lotId:string|undefined;

   if(direction==="ENTRADA"){
    const cost=b.cost===undefined||b.cost===""?Number(product.cost):Number(b.cost);
    if(!Number.isFinite(cost)||cost<0)throw new Error("Custo inválido");
    const lot=await tx.stockLot.create({data:{productId:product.id,code:b.code?String(b.code).trim():undefined,description:"Ajuste de estoque",quantity,cost,receivedAt:new Date()}});
    lotId=lot.id;
   }else{
    const lots=await tx.stockLot.findMany({where:{productId:product.id,archived:false,quantity:{gt:0}},orderBy:{receivedAt:"asc"}});
    let remaining=quantity;
    for(const lot of lots){
     if(remaining<=0)break;
     const take=Math.min(Number(lot.quantity),remaining);
     const updated=await tx.stockLot.updateMany({where:{id:lot.id,quantity:{gte:take}},data:{quantity:{decrement:take}}});
     if(updated.count===1){consumed.push({lotId:lot.id,quantity:take});remaining-=take;}
    }
    if(remaining>0)throw new Error("Estoque insuficiente para o ajuste");
   }

   const movement=await tx.stockMovement.create({data:{productId:product.id,type:"AJUSTE",quantity,unitCost:direction==="ENTRADA"?Number(b.cost??product.cost):undefined,reference:"AJUSTE",referenceId:lotId,notes:b.reason?String(b.reason).trim():"Ajuste de estoque",lotLinks:direction==="SAIDA"?{create:consumed}:undefined}});
   if(lotId)await tx.stockMovementLot.create({data:{movementId:movement.id,lotId,quantity}});
   await writeAudit(tx,{action:"CREATE",entity:"StockMovement",entityId:movement.id,userId:actor.id,metadata:{type:"AJUSTE",direction,quantity,consumed,lotId}});
   return {movement,direction,consumed,lotId};
  });
  const siteSync=await syncPublishedProductStock(result.movement.productId);\n  return NextResponse.json({...result,siteSync},{status:201});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Não foi possível ajustar o estoque."},{status:400});}
}
