import {NextResponse} from "next/server";
import {db} from "@/lib/db";

export async function POST(req:Request){
  try{
    const b=await req.json().catch(()=>({}));
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
      const expected=Number(session.openingCash)+entradas-saidas;

      return tx.cashSession.update({
        where:{id:session.id},
        data:{closedAt:new Date(),closingCash:expected,notes:b.notes||session.notes||undefined}
      });
    });
    return NextResponse.json(result);
  }catch(error){
    return NextResponse.json({error:"Não foi possível fechar o caixa",detail:String(error)},{status:400});
  }
}
