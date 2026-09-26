import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {writeAudit} from "@/lib/audit";

const toBoolean=(value:unknown,defaultValue:boolean)=>{
  if(value===undefined)return defaultValue;
  if(typeof value==="boolean")return value;
  if(typeof value==="string"){
    const normalized=value.trim().toLowerCase();
    if(normalized==="true")return true;
    if(normalized==="false")return false;
  }
  throw new Error("Valor booleano inválido");
};

export async function GET(){
  const defaults=[
    {name:"PIX",isCash:false},
    {name:"Cartão de débito",isCash:false},
    {name:"Cartão de crédito",isCash:false},
    {name:"Dinheiro",isCash:true},
    {name:"Crediário / Carnê",isCash:false}
  ];
  for(const item of defaults){
    await db.paymentMethod.upsert({where:{name:item.name},update:{active:true,isCash:item.isCash},create:{name:item.name,active:true,isCash:item.isCash}});
  }
  const methods=await db.paymentMethod.findMany({where:{active:true},orderBy:{name:"asc"}});
  return NextResponse.json(methods);
}

export async function POST(req:Request){
  try{
    const b=await req.json();
    const name=String(b.name||"").trim();
    if(!name) throw new Error("Nome do meio de pagamento é obrigatório");

    const method=await db.$transaction(async tx=>{
      const created=await tx.paymentMethod.create({
        data:{name,isCash:toBoolean(b.isCash,true),active:toBoolean(b.active,true)}
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