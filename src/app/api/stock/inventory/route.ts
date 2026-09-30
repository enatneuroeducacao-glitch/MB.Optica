import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";

export async function POST(req:Request){
 try{
  const actor=await requireRole(["ADMIN","GERENTE","LABORATORIO"]);
  const b=await req.json();
  if(!Array.isArray(b.items)||!b.items.length)throw new Error("Informe os itens do inventário");

  const result=await db.$transaction(async tx=>{
   const reconciled:any[]=[];
   for(const item of b.items){
    const productId=String(item.productId||"");
    const counted=Number(item.quantity);
    if(!productId||!Number.isFinite(counted)||counted<0)throw new Error("Item de inventário inválido");

    const product=await tx.product.findUnique({where:{id:productId}});
    if(!product||!product.active)throw new Error("Produto de inventário inválido: "+productId);
    if(!product.stockControlled)continue;

    const lots=await tx.stockLot.findMany({where:{productId,archived:false},orderBy:{receivedAt:"asc"}});
    const current=lots.reduce((sum,lot)=>sum+Number(lot.quantity),0);
    const difference=counted-current;
    if(Math.abs(difference)<0.0005){reconciled.push({productId,current,counted,difference:0});continue;}

    if(difference>0){
     const lot=await tx.stockLot.create({data:{productId,description:"Inventário",quantity:difference,cost:Number(product.cost),receivedAt:new Date()}});
     const movement=await tx.stockMovement.create({data:{productId,type:"AJUSTE",quantity:difference,unitCost:Number(product.cost),reference:"INVENTARIO",referenceId:lot.id,notes:b.reason?String(b.reason).trim():"Ajuste positivo de inventário"}});
     await tx.stockMovementLot.create({data:{movementId:movement.id,lotId:lot.id,quantity:difference}});
     await writeAudit(tx,{action:"CREATE",entity:"StockMovement",entityId:movement.id,userId:actor.id,metadata:{type:"INVENTARIO",difference}});
    }else{
     let remaining=Math.abs(difference);
     const consumed:{lotId:string,quantity:number}[]=[];
     for(const lot of lots){
      if(remaining<=0)break;
      const take=Math.min(Number(lot.quantity),remaining);
      if(take<=0)continue;
      const updated=await tx.stockLot.updateMany({where:{id:lot.id,quantity:{gte:take}},data:{quantity:{decrement:take}}});
      if(updated.count===1){consumed.push({lotId:lot.id,quantity:take});remaining-=take;}
     }
     if(remaining>0)throw new Error("Não foi possível reconciliar o inventário de "+product.description);
     const movement=await tx.stockMovement.create({data:{productId,type:"AJUSTE",quantity:Math.abs(difference),reference:"INVENTARIO",notes:b.reason?String(b.reason).trim():"Ajuste negativo de inventário",lotLinks:{create:consumed}}});
     await writeAudit(tx,{action:"CREATE",entity:"StockMovement",entityId:movement.id,userId:actor.id,metadata:{type:"INVENTARIO",difference,consumed}});
    }
    reconciled.push({productId,current,counted,difference});
   }
   return reconciled;
  });
  return NextResponse.json({success:true,items:result},{status:201});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Não foi possível concluir o inventário."},{status:400});}
}
