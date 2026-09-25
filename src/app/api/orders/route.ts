import {NextResponse} from "next/server";
import {db} from "@/lib/db";

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
    const b=await req.json();
    if(!b.customerId) throw new Error("customerId é obrigatório");

    const items=Array.isArray(b.items)?b.items:[];
    if(!items.length) throw new Error("O pedido precisa ter pelo menos um item");

    const order=await db.opticalOrder.create({
      data:{
        customerId:b.customerId,
        prescriptionId:b.prescriptionId||undefined,
        sellerId:b.sellerId||undefined,
        dueDate:b.dueDate?new Date(b.dueDate):undefined,
        laboratory:b.laboratory||undefined,
        notes:b.notes||undefined,
        total:Number(b.total||0),
        items:{
          create:items.map((item:any)=>({
            productId:item.productId||undefined,
            description:String(item.description||"Item óptico"),
            kind:String(item.kind||"OUTRO"),
            eye:item.eye||undefined,
            quantity:Number(item.quantity||1),
            unitPrice:Number(item.unitPrice||0)
          }))
        },
        events:{
          create:{
            status:"ORCAMENTO",
            message:"Pedido óptico criado"
          }
        }
      },
      include:{items:true,events:true}
    });

    return NextResponse.json(order,{status:201});
  }catch(error){
    return NextResponse.json({
      error:"Não foi possível criar o pedido óptico",
      detail:String(error)
    },{status:400});
  }
}