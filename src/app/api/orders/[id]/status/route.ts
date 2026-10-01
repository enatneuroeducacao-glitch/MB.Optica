import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {OrderStatus} from "@prisma/client";
import {writeAudit} from "@/lib/audit";

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