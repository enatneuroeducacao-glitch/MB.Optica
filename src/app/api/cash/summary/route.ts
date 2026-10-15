import {NextResponse} from "next/server";
import {db} from "@/lib/db";

export async function GET(){
  try{
    const session=await db.cashSession.findFirst({
      where:{closedAt:null},
      orderBy:{openedAt:"desc"},
      include:{movements:{orderBy:{createdAt:"asc"}}}
    });
    if(!session) return NextResponse.json({error:"Não há caixa aberto"},{status:404});
    const payments=await db.payment.findMany({
      where:{paidAt:{gte:session.openedAt},reversedAt:null},
      orderBy:{paidAt:"asc"},
      include:{
        method:{select:{name:true,isCash:true}},
        sale:{select:{number:true,customer:{select:{name:true}}}}
      }
    });
    const entries=session.movements.filter(m=>m.kind==="ENTRADA"||m.kind==="REFORCO").reduce((sum,m)=>sum+Number(m.amount),0);
    const exits=session.movements.filter(m=>m.kind==="SAIDA"||m.kind==="SANGRIA").reduce((sum,m)=>sum+Number(m.amount),0);
    const cashPayments=payments.filter(p=>p.method.isCash).reduce((sum,p)=>sum+Number(p.amount),0);
    const nonCashPayments=payments.filter(p=>!p.method.isCash).reduce((sum,p)=>sum+Number(p.amount),0);
    const expectedCash=Number(session.openingCash)+cashPayments+entries-exits;
    return NextResponse.json({
      session:{id:session.id,openedAt:session.openedAt,openingCash:Number(session.openingCash)},
      totals:{cashPayments,nonCashPayments,entries,exits,expectedCash},
      payments:payments.map(p=>({id:p.id,date:p.paidAt,saleNumber:p.sale.number,customer:p.sale.customer?.name||"Cliente não identificado",method:p.method.name,isCash:p.method.isCash,amount:Number(p.amount),reference:p.reference||""})),
      movements:session.movements.map(m=>({id:m.id,date:m.createdAt,kind:m.kind,description:m.description,amount:Number(m.amount)}))
    });
  }catch(error){
    return NextResponse.json({error:"Não foi possível montar a conferência do caixa",detail:String(error)},{status:500});
  }
}
