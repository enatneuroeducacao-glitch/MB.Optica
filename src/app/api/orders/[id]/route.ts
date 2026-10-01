import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {writeAudit} from "@/lib/audit";
import {requireRole} from "@/lib/auth";

const terminalStatuses=["ENTREGUE","CANCELADO","DEVOLVIDO"];

async function normalizeItems(items:any[]){
  if(!Array.isArray(items)||!items.length) throw new Error("O pedido precisa ter pelo menos um item");
  return items.map((item:any)=>{
    const quantity=Number(item.quantity??1);
    const unitPrice=Number(item.unitPrice??0);
    if(!Number.isFinite(quantity)||quantity<=0) throw new Error("Quantidade de item inválida");
    if(!Number.isFinite(unitPrice)||unitPrice<0) throw new Error("Preço de item inválido");
    const description=String(item.description||"Item óptico").trim();
    if(!description) throw new Error("Descrição do item é obrigatória");
    return {
      productId:item.productId?String(item.productId):undefined,
      description,
      kind:String(item.kind||"OUTRO").trim(),
      eye:item.eye?String(item.eye).trim():undefined,
      quantity,
      unitPrice
    };
  });
}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR","LABORATORIO"]);
    const {id}=await params;
    const b=await req.json();

    const current=await db.opticalOrder.findUnique({where:{id},include:{items:true}});
    if(!current) return NextResponse.json({error:"Pedido não encontrado"},{status:404});
    if(terminalStatuses.includes(current.status)) throw new Error("Pedidos entregues, cancelados ou devolvidos não podem ser editados.");

    if(!b.customerId) throw new Error("customerId é obrigatório");
    const customer=await db.customer.findUnique({where:{id:String(b.customerId),active:true}});
    if(!customer) throw new Error("Cliente não encontrado ou inativo");

    if(b.prescriptionId){
      const prescription=await db.prescription.findUnique({where:{id:String(b.prescriptionId)}});
      if(!prescription||prescription.customerId!==customer.id) throw new Error("Receita não pertence ao cliente");
    }

    if(b.sellerId){
      const seller=await db.user.findUnique({where:{id:String(b.sellerId),active:true}});
      if(!seller) throw new Error("Vendedor não encontrado ou inativo");
    }

    const normalizedItems=await normalizeItems(b.items);
    const total=normalizedItems.reduce((sum:number,item:any)=>sum+item.quantity*item.unitPrice,0);

    const order=await db.$transaction(async(tx)=>{
      await tx.opticalOrderItem.deleteMany({where:{orderId:id}});
      const updated=await tx.opticalOrder.update({
        where:{id},
        data:{
          customerId:customer.id,
          prescriptionId:b.prescriptionId?String(b.prescriptionId):null,
          sellerId:b.sellerId?String(b.sellerId):current.sellerId,
          dueDate:b.dueDate?new Date(b.dueDate):null,
          laboratory:b.laboratory?String(b.laboratory).trim():null,
          notes:b.notes?String(b.notes).trim():null,
          total,
          items:{create:normalizedItems},
          events:{create:{status:current.status,message:"Pedido editado"}}
        },
        include:{customer:true,prescription:true,items:true,events:{orderBy:{createdAt:"asc"}}}
      });

      await writeAudit(tx,{
        action:"UPDATE",
        entity:"OpticalOrder",
        entityId:id,
        userId:actor.id,
        request:req,
        metadata:{customerId:updated.customerId,total:String(total),items:updated.items.length}
      });
      return updated;
    });

    return NextResponse.json(order);
  }catch(error){
    return NextResponse.json({error:"Não foi possível editar o pedido",detail:String(error)},{status:400});
  }
}

export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await requireRole(["ADMIN","GERENTE"]);
    const {id}=await params;
    const current=await db.opticalOrder.findUnique({where:{id}});
    if(!current) return NextResponse.json({error:"Pedido não encontrado"},{status:404});
    if(terminalStatuses.includes(current.status)) throw new Error("Pedidos entregues, cancelados ou devolvidos não podem ser excluídos.");

    await db.$transaction(async(tx)=>{
      await tx.opticalOrderItem.deleteMany({where:{orderId:id}});
      await tx.orderEvent.deleteMany({where:{orderId:id}});
      await tx.opticalOrder.delete({where:{id}});
      await writeAudit(tx,{
        action:"DELETE",
        entity:"OpticalOrder",
        entityId:id,
        userId:actor.id,
        request:req,
        metadata:{number:current.number,customerId:current.customerId}
      });
    });

    return NextResponse.json({ok:true});
  }catch(error){
    return NextResponse.json({error:"Não foi possível excluir o pedido",detail:String(error)},{status:400});
  }
}
