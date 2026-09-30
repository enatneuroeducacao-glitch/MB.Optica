export const dynamic="force-dynamic";
export const revalidate=0;
import {NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";

const NUMERIC=["odSphere","odCylinder","odAxis","odAdd","odPrism","odDnp","odHeight","oeSphere","oeCylinder","oeAxis","oeAdd","oePrism","oeDnp","oeHeight","pdTotal"] as const;

function parseDecimal(value: unknown, field: string): Prisma.Decimal | undefined {
  if (value===undefined || value===null || value==="") return undefined;
  const normalized=String(value).trim().replace(",",".");
  if (!normalized) return undefined;
  const number=Number(normalized);
  if (!Number.isFinite(number)) throw new Error("Valor inválido na receita: "+field);
  return new Prisma.Decimal(normalized);
}

export async function GET(req:Request){
 try{
  await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
  const customerId=new URL(req.url).searchParams.get("customerId")||undefined;
  const where=customerId?{customerId}:{};
  return NextResponse.json(await db.prescription.findMany({where,include:{customer:{select:{id:true,name:true,active:true,cpfCnpj:true}}},orderBy:{date:"desc"},take:100}));
 }catch(error){
  return apiError(error,"Não foi possível carregar as receitas.");
 }
}

export async function POST(req:Request){
 try{
  const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
  const b=await req.json();

  if(!b.customerId) throw new Error("customerId é obrigatório");

  const customer=await db.customer.findUnique({
    where:{id:String(b.customerId),active:true}
  });
  if(!customer) throw new Error("Cliente não encontrado ou inativo");

  let validUntil:Date|undefined;
  if(b.validUntil){
    const raw=String(b.validUntil).trim();
    validUntil=new Date(raw+"T12:00:00");
    if(Number.isNaN(validUntil.getTime())) throw new Error("Validade da receita inválida");
  }

  const values:Record<string,Prisma.Decimal>={};
  for(const field of NUMERIC){
    const value=parseDecimal(b[field],field);
    if(value!==undefined) values[field]=value;
  }

  const data=await db.$transaction(async tx=>{
    const prescription=await tx.prescription.create({
      data:{
        customerId:customer.id,
        ...(b.professional?{professional:String(b.professional).trim()}:{}),
        ...(validUntil?{validUntil}:{}),
        ...values,
        ...(b.odBase?{odBase:String(b.odBase).trim()}:{}),
        ...(b.oeBase?{oeBase:String(b.oeBase).trim()}:{}),
        ...(b.notes?{notes:String(b.notes).trim()}:{}),
        ...(b.originalText?{originalText:String(b.originalText).trim()}:{}),
      }
    });

    await writeAudit(tx,{
      action:"CREATE",
      entity:"Prescription",
      entityId:prescription.id,
      userId:actor.id,
      metadata:{customerId:customer.id},
      result:"SUCCESS"
    });

    return prescription;
  });

  return NextResponse.json(data,{status:201});
 }catch(error){
  console.error("[prescriptions] POST failed",error);
  return apiError(error,"Não foi possível registrar a receita.");
 }
}