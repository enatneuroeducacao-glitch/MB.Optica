import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const actor=await requireRole(["ADMIN","GERENTE"]);
  const {id}=await params;
  const current=await db.appointment.findUnique({where:{id}});
  if(!current)return NextResponse.json({error:"Agendamento não encontrado."},{status:404});
  await db.$transaction(async tx=>{
   await tx.appointment.delete({where:{id}});
   await writeAudit(tx,{action:"DELETE",entity:"Appointment",entityId:id,userId:actor.id,metadata:{customerId:current.customerId}});
  });
  return NextResponse.json({ok:true});
 }catch(error){return apiError(error,"Não foi possível excluir o agendamento.");}
}
