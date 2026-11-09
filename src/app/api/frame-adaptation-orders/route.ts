import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";

const roles=["ADMIN","GERENTE","VENDEDOR","LABORATORIO"];

export async function GET(){
  try{
    await requireRole(roles);
    const rows=await db.frameAdaptationOrder.findMany({
      include:{
        customer:{select:{id:true,name:true,cpfCnpj:true,phone:true}},
        prescription:true,
        sale:{include:{items:{include:{product:{select:{code:true,description:true}}}},seller:{select:{name:true}}}}
      },
      orderBy:{createdAt:"desc"},
      take:200
    });
    return NextResponse.json(rows);
  }catch(error){
    return NextResponse.json({error:"Não foi possível consultar as ordens de montagem",detail:String(error)},{status:String(error).includes("UNAUTHORIZED")?401:403});
  }
}

export async function PATCH(req:Request){
  try{
    const actor=await requireRole(["ADMIN","GERENTE","LABORATORIO"]);
    const b=await req.json();
    const id=String(b.id||"");
    const status=String(b.status||"");
    if(!id)throw new Error("Ordem de serviço não informada.");
    if(!["AGUARDANDO_ENVIO","ENVIADA_AO_LABORATORIO","RECEBIDA_DA_LOJA","CONFERIDA","CANCELADA"].includes(status))throw new Error("Status inválido.");
    const current=await db.frameAdaptationOrder.findUnique({where:{id}});
    if(!current) return NextResponse.json({error:"Ordem de montagem não encontrada."},{status:404});
    const updated=await db.$transaction(async tx=>{
      const row=await tx.frameAdaptationOrder.update({where:{id},data:{
        status,
        sentAt:status==="ENVIADA_AO_LABORATORIO"?(current.sentAt||new Date()):undefined,
        receivedAt:status==="RECEBIDA_DA_LOJA"?(current.receivedAt||new Date()):undefined
      }});
      await writeAudit(tx,{action:"UPDATE",entity:"FrameAdaptationOrder",entityId:id,userId:actor.id,request:req,metadata:{number:row.number,previousStatus:current.status,status}});
      return row;
    });
    return NextResponse.json(updated);
  }catch(error){
    return NextResponse.json({error:"Não foi possível atualizar a ordem de montagem",detail:error instanceof Error?error.message:String(error)},{status:String(error).includes("UNAUTHORIZED")?401:String(error).includes("FORBIDDEN")?403:400});
  }
}
