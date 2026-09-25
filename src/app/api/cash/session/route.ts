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
    if(!Number.isFinite(openingCash)||openingCash<0) throw new Error("Valor de abertura inválido");

    const session=await db.$transaction(async(tx)=>{
      const open=await tx.cashSession.findFirst({where:{closedAt:null}});
      if(open) throw new Error("Já existe um caixa aberto");
      const session=await tx.cashSession.create({
        data:{openingCash,notes:b.notes||undefined}
      });
      await writeAudit(tx,{action:"OPEN",entity:"CashSession",entityId:session.id,metadata:{openingCash}});
      return session;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json(session,{status:201});
  }catch(error){
    return NextResponse.json({error:"Não foi possível abrir o caixa",detail:String(error)},{status:400});
  }
}
