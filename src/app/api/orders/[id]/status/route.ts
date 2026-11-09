import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {OrderStatus} from "@prisma/client";
import {writeAudit} from "@/lib/audit";

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const b=await req.json();

    if(Object.prototype.hasOwnProperty.call(b,"dueDate")){
      const current=await db.opticalOrder.findUnique({where:{id}});
      if(!current) return NextResponse.json({error:"Pedido não encontrado"},{status:404});
      const raw=String(b.dueDate||"").trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("Informe uma data de entrega válida.");
      const nextDate=new Date(`${raw}T12:00:00.000Z`);
      if(Number.isNaN(nextDate.getTime())||nextDate.toISOString().slice(0,10)!==raw) throw new Error("Data de entrega inválida.");
      const previous=current.dueDate?current.dueDate.toISOString().slice(0,10):null;
      const updated=await db.$transaction(async tx=>{
        await tx.opticalOrder.update({where:{id},data:{dueDate:nextDate}});
        await tx.orderEvent.create({data:{orderId:id,status:current.status,message:`Previsão de entrega alterada de ${previous||"não definida"} para ${raw}.`}});
        const withEvents=await tx.opticalOrder.findUnique({where:{id},include:{customer:true,prescription:true,items:true,events:{orderBy:{createdAt:"asc"}}}});
        await writeAudit(tx,{action:"UPDATE_DELIVERY_DATE",entity:"OpticalOrder",entityId:id,metadata:{previousDueDate:previous,newDueDate:raw,status:current.status}});
        return withEvents;
      });
      return NextResponse.json(updated);
    }

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
      CONFERENCIA:["PRONTO","RETORNO_GARANTIA","CANCELADO"],
      RETORNO_GARANTIA:["AGUARDANDO_LABORATORIO","CANCELADO"],
      PRONTO:["ENTREGUE","CANCELADO"],
      ENTREGUE:["DEVOLVIDO"],
      DEVOLVIDO:[],
      CANCELADO:[]
    };
    if(current.status===b.status){
      return NextResponse.json(current);
    }
    if(b.status==="AGUARDANDO_LABORATORIO"&&!String(current.laboratory||"").trim()){ throw new Error("Informe o laboratório antes de enviar o pedido para produção."); }
    if(b.status==="PRONTO"&&!current.dueDate){ throw new Error("Informe a data prevista de entrega antes de marcar o pedido como pronto."); }
    if(!transitions[current.status]?.includes(b.status)){
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

    if(b.status==="RETORNO_GARANTIA") { data.warrantyReturnAt=new Date(); data.warrantyReason=b.warranty?.reason?String(b.warranty.reason).trim():undefined; data.warrantyOriginalFiscalNumber=b.warranty?.originalFiscalNumber?String(b.warranty.originalFiscalNumber).trim():undefined; data.warrantyOriginalFiscalKey=b.warranty?.originalFiscalKey?String(b.warranty.originalFiscalKey).trim():undefined; data.warrantyNotes=b.warranty?.notes?String(b.warranty.notes).trim():undefined; }
    if(b.status==="AGUARDANDO_LABORATORIO") data.laboratorySentAt=new Date();
    if(b.status==="RECEBIDO") data.receivedAt=new Date();
    if(b.status==="ENTREGUE") data.deliveredAt=new Date();

    const order=await db.$transaction(async tx=>{
      const updated=await tx.opticalOrder.update({
        where:{id},
        data,
        include:{customer:true,prescription:true,items:true,events:{orderBy:{createdAt:"asc"}}}
      });

      await writeAudit(tx,{
        action:"STATUS_CHANGE",
        entity:"OpticalOrder",
        entityId:id,
        metadata:{from:current.status,to:b.status,message:b.message||null}
      });

      return updated;
    });

    return NextResponse.json(order);
  }catch(error){
    return NextResponse.json({
      error:"Não foi possível atualizar o pedido",
      detail:String(error)
    },{status:400});
  }
}