import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {writeAudit} from "@/lib/audit";
import {requireRole} from "@/lib/auth";

export async function GET(){
  const data=await db.opticalOrder.findMany({
    include:{
      customer:true,
      prescription:true,
      items:true,
      events:{orderBy:{createdAt:"asc"}}
    },
    orderBy:{createdAt:"desc"},
    take:100
  });
  return NextResponse.json(data);
}

export async function POST(req:Request){
  try{
    const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR","LABORATORIO"]);
    const b=await req.json();
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

    const items=Array.isArray(b.items)?b.items:[];
    if(!items.length) throw new Error("O pedido precisa ter pelo menos um item");
    const normalizedItems=items.map((item:any)=>{
      const quantity=Number(item.quantity??1);
      const unitPrice=Number(item.unitPrice??0);
      if(!Number.isFinite(quantity)||quantity<=0) throw new Error("Quantidade de item inválida");
      if(!Number.isFinite(unitPrice)||unitPrice<0) throw new Error("Preço de item inválido");
      return {productId:item.productId?String(item.productId):undefined,description:String(item.description||"Item óptico").trim(),kind:String(item.kind||"OUTRO").trim(),eye:item.eye?String(item.eye).trim():undefined,quantity,unitPrice};
    });
    const total=normalizedItems.reduce((sum:number,item:{quantity:number;unitPrice:number})=>sum+item.quantity*item.unitPrice,0);
    if(b.total!==undefined&&(!Number.isFinite(Number(b.total))||Number(b.total)<0)) throw new Error("Total inválido");

    const order=await db.$transaction(async(tx)=>{
      const created=await tx.opticalOrder.create({
        data:{
          customerId:customer.id,
          prescriptionId:b.prescriptionId?String(b.prescriptionId):undefined,
          sellerId:b.sellerId?String(b.sellerId):undefined,
          dueDate:b.dueDate?new Date(b.dueDate):undefined,
          laboratory:b.laboratory?String(b.laboratory).trim():undefined,
          notes:b.notes?String(b.notes).trim():undefined,
          total,
          items:{create:normalizedItems},
          events:{create:{status:"ORCAMENTO",message:"Pedido óptico criado"}}
        },
        include:{items:true,events:true}
      });
      await writeAudit(tx,{action:"CREATE",entity:"OpticalOrder",entityId:created.id,userId:actor.id,request:req,metadata:{customerId:created.customerId,total:created.total.toString(),items:created.items.length}});
      return created;
    });
    return NextResponse.json(order,{status:201});
  }catch(error){
    return NextResponse.json({
      error:"Não foi possível criar o pedido óptico",
      detail:String(error)
    },{status:400});
  }
}