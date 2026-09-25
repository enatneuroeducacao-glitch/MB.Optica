import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {writeAudit} from "@/lib/audit";

export async function GET(){
  const methods=await db.paymentMethod.findMany({orderBy:{name:"asc"}});
  return NextResponse.json(methods);
}

export async function POST(req:Request){
  try{
    const b=await req.json();
    const name=String(b.name||"").trim();
    if(!name) throw new Error("Nome do meio de pagamento é obrigatório");

    const method=await db.$transaction(async tx=>{
      const created=await tx.paymentMethod.create({
        data:{name,isCash:b.isCash===undefined?true:Boolean(b.isCash),active:b.active===undefined?true:Boolean(b.active)}
      });
      await writeAudit(tx,{
        action:"CREATE",
        entity:"PaymentMethod",
        entityId:created.id,
        metadata:{name:created.name,isCash:created.isCash,active:created.active}
      });
      return created;
    });

    return NextResponse.json(method,{status:201});
  }catch(error){
    return NextResponse.json({error:"Não foi possível criar o meio de pagamento",detail:String(error)},{status:400});
  }
}