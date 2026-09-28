export const dynamic="force-dynamic";
export const revalidate=0;
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";
const NUMERIC=["odSphere","odCylinder","odAxis","odAdd","odPrism","odDnp","odHeight","oeSphere","oeCylinder","oeAxis","oeAdd","oePrism","oeDnp","oeHeight","pdTotal"] as const;
export async function GET(req:Request){
 try{await requireRole(["ADMIN","GERENTE","VENDEDOR"]);const customerId=new URL(req.url).searchParams.get("customerId")||undefined;
 return NextResponse.json(await db.prescription.findMany({where:customerId?{customerId}:{},orderBy:{date:"desc"},take:100}));
 }catch(error){return apiError(error,"Não foi possível carregar as receitas.");}
}
export async function POST(req:Request){
 try{
  const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR"]);const b=await req.json();
  if(!b.customerId)throw new Error("customerId é obrigatório");
  const customer=await db.customer.findUnique({where:{id:String(b.customerId),active:true}});
  if(!customer)throw new Error("Cliente não encontrado ou inativo");
  const validUntil=b.validUntil?new Date(b.validUntil):undefined;
  if(validUntil&&Number.isNaN(validUntil.getTime()))throw new Error("Validade da receita inválida");
  const values:Record<string,number|undefined>={};
  for(const field of NUMERIC){if(b[field]===undefined||b[field]===null||b[field]==="")values[field]=undefined;else{const value=Number(b[field]);if(!Number.isFinite(value))throw new Error("Valor inválido na receita: "+field);values[field]=value;}}
  const data=await db.$transaction(async tx=>{
   const prescription=await tx.prescription.create({data:{customerId:customer.id,professional:b.professional?String(b.professional).trim():undefined,validUntil,...values,odBase:b.odBase?String(b.odBase).trim():undefined,oeBase:b.oeBase?String(b.oeBase).trim():undefined,notes:b.notes?String(b.notes).trim():undefined,originalText:b.originalText?String(b.originalText).trim():undefined}});
   await writeAudit(tx,{action:"CREATE",entity:"Prescription",entityId:prescription.id,userId:actor.id,metadata:{customerId:customer.id}});
   return prescription;
  });
  return NextResponse.json(data,{status:201});
 }catch(error){return apiError(error,"Não foi possível registrar a receita.");}
}