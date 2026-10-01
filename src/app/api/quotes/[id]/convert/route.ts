import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";

export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
  const {id}=await params;
  const result=await db.$transaction(async tx=>{
   const quote=await tx.quote.findUnique({where:{id},include:{items:true,order:true}});
   if(!quote)throw new Error("Orçamento não encontrado.");
   if(quote.order)return quote.order;
   if(quote.status!=="APROVADO")throw new Error("O orçamento precisa estar APROVADO antes de ser convertido em O.S.");
   const order=await tx.opticalOrder.create({
    data:{
     customerId:quote.customerId,prescriptionId:quote.prescriptionId||undefined,sellerId:quote.sellerId||actor.id,
     status:"PEDIDO",dueDate:quote.deliveryDate||undefined,notes:quote.notes||undefined,total:quote.total,
     quoteId:quote.id,
     items:{create:quote.items.map(item=>({productId:item.productId||undefined,description:item.description,kind:item.kind||"ORÇAMENTO",eye:item.eye||undefined,quantity:item.quantity,unitPrice:item.unitPrice}))},
     events:{create:{status:"PEDIDO",message:"Orçamento convertido em pedido/O.S."}}
    }
   });
   await tx.quote.update({where:{id},data:{status:"CONVERTIDO"}});
   await writeAudit(tx,{action:"CONVERT",entity:"Quote",entityId:id,userId:actor.id,metadata:{quoteNumber:quote.number,orderId:order.id,orderNumber:order.number}});
   return order;
  });
  return NextResponse.json(result,{status:201});
 }catch(error){return apiError(error,"Não foi possível converter o orçamento em O.S.");}
}
