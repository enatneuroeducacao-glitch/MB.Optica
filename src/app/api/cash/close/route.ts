import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {Prisma} from "@prisma/client";
import {writeAudit} from "@/lib/audit";

export async function POST(req:Request){
  try{
    const b=await req.json().catch(()=>({}));
    const countedCash=Number(b.closingCash);
    const closingAtRaw=String(b.closingAt||"");
    const closingAt=new Date(closingAtRaw);
    if(!closingAtRaw||Number.isNaN(closingAt.getTime())) throw new Error("Informe o horário de fechamento");
    if(closingAt.getTime()>Date.now()+60000) throw new Error("O horário de fechamento não pode estar no futuro");
    const closingReason=String(b.closingReason||"");
    const allowedReasons=new Set(["FIM_EXPEDIENTE","TROCA_OPERADOR","FECHAMENTO_PARCIAL","DIVERGENCIA","OUTRO"]);
    if(!Number.isFinite(countedCash)||countedCash<0) throw new Error("Informe o valor contado no fechamento");
    if(!allowedReasons.has(closingReason)) throw new Error("Selecione um motivo válido para o fechamento");
    if((closingReason==="DIVERGENCIA"||closingReason==="OUTRO")&&!String(b.notes||"").trim()) throw new Error("Justifique a divergência ou o motivo do fechamento");
    const closingReasonLabel=({FIM_EXPEDIENTE:"Fim do expediente",TROCA_OPERADOR:"Troca de operador",FECHAMENTO_PARCIAL:"Fechamento parcial",DIVERGENCIA:"Divergência de caixa",OUTRO:"Outro motivo"} as Record<string,string>)[closingReason];
    const result=await db.$transaction(async(tx)=>{
      const session=await tx.cashSession.findFirst({
        where:{closedAt:null},
        orderBy:{openedAt:"desc"},
        include:{movements:true}
      });
      if(!session) throw new Error("Não há caixa aberto");

      const entradas=session.movements
        .filter(m=>m.kind==="ENTRADA"||m.kind==="REFORCO")
        .reduce((s,m)=>s+Number(m.amount),0);
      const saidas=session.movements
        .filter(m=>m.kind==="SAIDA"||m.kind==="SANGRIA")
        .reduce((s,m)=>s+Number(m.amount),0);
      if(closingAt<session.openedAt) throw new Error("O horário de fechamento não pode ser anterior à abertura");
      const cashPayments=await tx.payment.findMany({
        where:{paidAt:{gte:session.openedAt,lte:closingAt},reversedAt:null,method:{isCash:true}},
        select:{amount:true}
      });
      const cashReceived=cashPayments.reduce((sum,p)=>sum+Number(p.amount),0);
      const expected=Number(session.openingCash)+cashReceived+entradas-saidas;

      const closed=await tx.cashSession.update({
        where:{id:session.id},
        data:{closedAt:closingAt,closingCash:countedCash,notes:[session.notes,"Fechamento: "+closingReasonLabel,String(b.notes||"").trim()].filter(Boolean).join(" — ")||undefined}
      });
      await writeAudit(tx,{action:"CLOSE",entity:"CashSession",entityId:session.id,metadata:{expected,cashReceived,countedCash,difference:countedCash-expected,closingAt:closingAt.toISOString(),serverRecordedAt:new Date().toISOString(),closingReason,notes:String(b.notes||"").trim()||null}});
      return {session:closed,expected,difference:countedCash-expected};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json(result);
  }catch(error){
    return NextResponse.json({error:"Não foi possível fechar o caixa",detail:String(error)},{status:400});
  }
}
