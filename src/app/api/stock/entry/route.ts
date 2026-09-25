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
  if(!Number.isFinite(quantity)||quantity<=0)throw new Error("Quantidade inválida");
  const cost=b.cost===undefined||b.cost===""?undefined:Number(b.cost);
  if(cost!==undefined&&(!Number.isFinite(cost)||cost<0))throw new Error("Custo inválido");
  const entryDate=b.entry?new Date(b.entry):new Date(),expiresAt=b.expiresAt?new Date(b.expiresAt):undefined;
  if(Number.isNaN(entryDate.getTime())||(expiresAt&&Number.isNaN(expiresAt.getTime())))throw new Error("Data de estoque inválida");
  if(expiresAt&&expiresAt<entryDate)throw new Error("Validade do lote não pode ser anterior à entrada");
  const result=await db.$transaction(async tx=>{
   const product=await tx.product.findUnique({where:{id:b.productId}});
   if(!product||!product.active)throw new Error("Produto não encontrado ou inativo");
   const unitCost=cost??Number(product.cost);
   const lot=await tx.stockLot.create({data:{productId:product.id,code:b.code?String(b.code).trim():undefined,description:b.description?String(b.description).trim():product.description,quantity,cost:unitCost,receivedAt:entryDate,expiresAt}});
   const movement=await tx.stockMovement.create({data:{productId:product.id,type:"ENTRADA",quantity,unitCost,reference:"LOTE",referenceId:lot.id,notes:b.reason?String(b.reason).trim():"Entrada de estoque"}});
   await tx.stockMovementLot.create({data:{movementId:movement.id,lotId:lot.id,quantity}});
   await writeAudit(tx,{action:"CREATE",entity:"StockMovement",entityId:movement.id,userId:actor.id,metadata:{type:"ENTRADA",quantity,lotId:lot.id}});
   return {lot,movement};
  });
  return NextResponse.json(result,{status:201});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Não foi possível registrar a entrada."},{status:400});}
}