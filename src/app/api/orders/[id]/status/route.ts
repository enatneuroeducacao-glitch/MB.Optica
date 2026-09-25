import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {OrderStatus} from "@prisma/client";

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const b=await req.json();

    if(!Object.values(OrderStatus).includes(b.status)){
      throw new Error("Status inválido");
    }

    const current=await db.opticalOrder.findUnique({where:{id}});
    if(!current) return NextResponse.json({error:"Pedido não encontrado"},{status:404});

    const transitions:Record<string,string[]>={
      ORCAMENTO:["APROVADO","CANCELADO"],
      APROVADO:["PEDIDO","CANCELADO"],
      PEDIDO:["AGUARDANDO_LABORATORIO","CANCELADO"],
      AGUARDANDO_LABORATORIO:["EM_PRODUCAO","CANCELADO"],
      EM_PRODUCAO:["RECEBIDO","CANCELADO"],
      RECEBIDO:["CONFERENCIA","CANCELADO"],
      CONFERENCIA:["PRONTO","CANCELADO"],
      PRONTO:["ENTREGUE","CANCELADO"],
      ENTREGUE:["DEVOLVIDO"],
      DEVOLVIDO:[],
      CANCELADO:[]
    };
    if(current.status!==b.status && !transitions[current.status]?.includes(b.status)){
      throw new Error(`Transição não permitida: ${current.status} → ${b.status}`);
    }

    const data:any={
      status:b.status,
      events:{
        create:{
          status:b.status,
          message:b.message||"Status do pedido atualizado"
        }
      }
    };

    if(b.status==="RECEBIDO") data.receivedAt=new Date();
    if(b.status==="ENTREGUE") data.deliveredAt=new Date();

    const order=await db.opticalOrder.update({
      where:{id},
      data,
      include:{customer:true,prescription:true,items:true,events:{orderBy:{createdAt:"asc"}}}
    });

    return NextResponse.json(order);
  }catch(error){
    return NextResponse.json({
      error:"Não foi possível atualizar o pedido",
      detail:String(error)
    },{status:400});
  }
}