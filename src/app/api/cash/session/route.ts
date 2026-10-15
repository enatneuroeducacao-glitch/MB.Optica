import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {Prisma} from "@prisma/client";
import {writeAudit} from "@/lib/audit";

export async function GET(){
  const session=await db.cashSession.findFirst({
    where:{closedAt:null},
    orderBy:{openedAt:"desc"},
    include:{movements:{orderBy:{createdAt:"asc"}}}
  });
  return NextResponse.json(session);
}

export async function POST(req:Request){
  try{
    const b=await req.json();
    const openingCash=Number(b.openingCash);
    const openingReason=String(b.openingReason||"");
    const allowedReasons=new Set(["INICIO_EXPEDIENTE","REABERTURA","TROCA_OPERADOR","OUTRO"]);
    if(!Number.isFinite(openingCash)||openingCash<0) throw new Error("Valor de abertura inválido");
    if(!allowedReasons.has(openingReason)) throw new Error("Selecione um motivo válido para a abertura");
    if(openingReason==="OUTRO"&&!String(b.notes||"").trim()) throw new Error("Descreva o motivo da abertura");
    const openingReasonLabel=({INICIO_EXPEDIENTE:"Início do expediente",REABERTURA:"Reabertura após intervalo",TROCA_OPERADOR:"Troca de operador",OUTRO:"Outro motivo"} as Record<string,string>)[openingReason];
    const sessionNotes=["Abertura: "+openingReasonLabel,String(b.notes||"").trim()].filter(Boolean).join(" — ");

    const session=await db.$transaction(async(tx)=>{
      const open=await tx.cashSession.findFirst({where:{closedAt:null}});
      if(open) throw new Error("Já existe um caixa aberto");
      const session=await tx.cashSession.create({
        data:{openingCash,notes:sessionNotes||undefined}
      });
      await writeAudit(tx,{action:"OPEN",entity:"CashSession",entityId:session.id,metadata:{openingCash,openingReason,notes:String(b.notes||"").trim()||null}});
      return session;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json(session,{status:201});
  }catch(error){
    return NextResponse.json({error:"Não foi possível abrir o caixa",detail:String(error)},{status:400});
  }
}
