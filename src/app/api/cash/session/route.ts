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
  if(!session) return NextResponse.json(null);
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const openedDay=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(session.openedAt);
  const closingPending=openedDay<today;
  return NextResponse.json({...session,closingPending,businessDate:today});
}

export async function POST(req:Request){
  try{
    const b=await req.json();
    const openingCash=Number(b.openingCash);
    const openingAtRaw=String(b.openingAt||"");
    const openingAt=new Date(openingAtRaw);
    if(!openingAtRaw||Number.isNaN(openingAt.getTime())) throw new Error("Informe o horário de abertura");
    if(openingAt.getTime()>Date.now()+60000) throw new Error("O horário de abertura não pode estar no futuro");
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
        data:{openingCash,openedAt:openingAt,notes:sessionNotes||undefined}
      });
      await writeAudit(tx,{action:"OPEN",entity:"CashSession",entityId:session.id,metadata:{openingCash,openingAt:openingAt.toISOString(),serverRecordedAt:new Date().toISOString(),openingReason,notes:String(b.notes||"").trim()||null}});
      return session;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json(session,{status:201});
  }catch(error){
    return NextResponse.json({error:"Não foi possível abrir o caixa",detail:String(error)},{status:400});
  }
}
