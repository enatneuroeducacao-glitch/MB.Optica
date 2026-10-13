import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";

const allowedRoles=["ADMIN","GERENTE","VENDEDOR","LABORATORIO"];
export async function GET(){
 try{await requireRole(allowedRoles);const rows=await db.thirdPartyFrameIntake.findMany({orderBy:{createdAt:"desc"},take:200});return NextResponse.json(rows)}
 catch(error){return NextResponse.json({error:"Não foi possível consultar os registros",detail:String(error)}, {status:String(error).includes("UNAUTHORIZED")?401:403})}
}
export async function POST(req:Request){
 try{
  const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
  const b=await req.json();
  const customerName=String(b.customerName||"").trim();
  if(!customerName)throw new Error("Informe o nome do cliente.");
  if(b.customerAcknowledged!==true)throw new Error("Registre a ciência do cliente antes de salvar.");
  const source=String(b.source||"MARKETPLACE");
  if(!["MARKETPLACE","OUTRA_OTICA","PRESENTE","OUTRA"].includes(source))throw new Error("Origem inválida.");
  const condition=String(b.condition||"");
  if(!["SEM_AVARIAS_APARENTES","DESGASTE","TRINCA_OU_DANO","AVALIACAO_NECESSARIA"].includes(condition))throw new Error("Condição da armação inválida.");
  const serviceRequested=String(b.serviceRequested||"");
  if(!["MONTAGEM_DE_LENTES","AJUSTE","REPARO","AVALIACAO"].includes(serviceRequested))throw new Error("Serviço solicitado inválido.");
  const servicePrice=b.servicePrice===""||b.servicePrice==null?null:Number(b.servicePrice);
  if(servicePrice!==null&&(!Number.isFinite(servicePrice)||servicePrice<0))throw new Error("Preço de serviço inválido.");
  if(b.customerId){const customer=await db.customer.findUnique({where:{id:String(b.customerId)}});if(!customer)throw new Error("O ID informado não corresponde a um cliente cadastrado.");}
  const record=await db.$transaction(async tx=>{
   const created=await tx.thirdPartyFrameIntake.create({data:{customerName,customerId:b.customerId?String(b.customerId):null,brand:String(b.brand||"").trim()||null,model:String(b.model||"").trim()||null,source,purchaseDate:b.purchaseDate?new Date(b.purchaseDate):null,condition,risks:String(b.risks||"").trim()||null,serviceRequested,inspectionNotes:String(b.inspectionNotes||"").trim()||null,photoReferences:String(b.photoReferences||"").trim()||null,customerAcknowledged:b.customerAcknowledged===true,servicePrice,createdByUserId:actor.id}});
   await writeAudit(tx,{action:"CREATE",entity:"ThirdPartyFrameIntake",entityId:created.id,userId:actor.id,request:req,metadata:{source,condition,serviceRequested,customerAcknowledged:created.customerAcknowledged}});
   return created;
  });
  return NextResponse.json(record,{status:201});
 }catch(error){return NextResponse.json({error:"Não foi possível registrar a armação",detail:String(error)}, {status:String(error).includes("UNAUTHORIZED")?401:String(error).includes("FORBIDDEN")?403:400})}
}
