import {NextResponse} from "next/server";
import {db} from "@/lib/db";

const allowed=new Set(["ENTRADA","SAIDA","SANGRIA","REFORCO"]);

export async function POST(req:Request){
  try{
    const b=await req.json();
    if(!allowed.has(String(b.kind))) throw new Error("Tipo de movimentação inválido");
    const amount=Number(b.amount);
    if(!Number.isFinite(amount)||amount<=0) throw new Error("Valor inválido");

    const result=await db.$transaction(async(tx)=>{
      const session=await tx.cashSession.findFirst({where:{closedAt:null},orderBy:{openedAt:"desc"}});
      if(!session) throw new Error("Não há caixa aberto");
      return tx.cashMovement.create({
        data:{
          sessionId:session.id,
          kind:String(b.kind),
          amount,
          description:String(b.description||"Movimentação de caixa"),
          referenceId:b.referenceId||undefined
        }
      });
    });
    return NextResponse.json(result,{status:201});
  }catch(error){
    return NextResponse.json({error:"Não foi possível registrar a movimentação",detail:String(error)},{status:400});
  }
}
