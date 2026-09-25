import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";

const types=["EXAME","ATENDIMENTO","RETIRADA","PROVA","ENTREGA","RETORNO"];
const professionals=["OFTALMOLOGISTA","OPTOMETRISTA","OUTRO"];
const statuses=["AGENDADO","CONFIRMADO","REALIZADO","CANCELADO","NAO_COMPARECEU"];

export async function GET(){
 try{
  await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
  return NextResponse.json(await db.appointment.findMany({where:{scheduledAt:{gte:new Date(Date.now()-90*24*60*60*1000)}},orderBy:{scheduledAt:"asc"},take:500,include:{customer:{select:{id:true,name:true,cpfCnpj:true,phone:true,email:true}}}}));
 }catch(error){return apiError(error,"Não foi possível carregar a agenda.");}
}
export async function POST(req:Request){
 try{
  const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
  const b=await req.json();
  if(!b.customerId||!b.professionalName||!b.scheduledAt)throw new Error("Cliente, profissional e data/hora são obrigatórios.");
  if(!types.includes(b.type)||!professionals.includes(b.professionalType)||!statuses.includes(b.status))throw new Error("Dados do agendamento inválidos.");
  const scheduledAt=new Date(b.scheduledAt);if(Number.isNaN(scheduledAt.getTime()))throw new Error("Data/hora inválida.");
  const customer=await db.customer.findUnique({where:{id:String(b.customerId),active:true}});
  if(!customer)throw new Error("Cliente não encontrado ou inativo.");
  const data=await db.$transaction(async tx=>{
   const appointment=await tx.appointment.create({data:{customerId:customer.id,type:b.type,professionalType:b.professionalType,professionalName:String(b.professionalName).trim(),scheduledAt,status:b.status,notes:b.notes?String(b.notes).trim():undefined}});
   await writeAudit(tx,{action:"CREATE",entity:"Appointment",entityId:appointment.id,userId:actor.id,metadata:{customerId:customer.id,type:b.type,professionalType:b.professionalType}});
   return appointment;
  });
  return NextResponse.json(data,{status:201});
 }catch(error){return apiError(error,"Não foi possível criar o agendamento.");}
}
