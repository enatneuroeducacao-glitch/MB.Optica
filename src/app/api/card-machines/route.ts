import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";

export async function GET(){
  try{
    const defaults=["Ton","Infinity","Mercado Pago"];
    for(const name of defaults){
      await db.cardMachine.upsert({
        where:{name},
        update:{active:true},
        create:{name,active:true}
      });
    }
    const machines=await db.cardMachine.findMany({
      where:{active:true},
      orderBy:{name:"asc"}
    });
    return NextResponse.json(machines);
  }catch(error){
    return NextResponse.json({error:"Não foi possível carregar as maquininhas",detail:String(error)},{status:500});
  }
}

export async function POST(req:Request){
  try{
    const actor=await requireRole(["ADMIN","GERENTE"]);
    const body=await req.json();
    const name=String(body.name||"").trim();
    if(!name) throw new Error("Informe o nome da maquininha");

    const machine=await db.$transaction(async tx=>{
      const created=await tx.cardMachine.create({
        data:{name,active:true}
      });
      await writeAudit(tx,{
        action:"CREATE",
        entity:"CardMachine",
        entityId:created.id,
        userId:actor.id,
        request:req,
        metadata:{name:created.name}
      });
      return created;
    });

    return NextResponse.json(machine,{status:201});
  }catch(error){
    return NextResponse.json({error:"Não foi possível cadastrar a maquininha",detail:String(error)},{status:400});
  }
}
