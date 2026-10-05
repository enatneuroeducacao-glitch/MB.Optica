import {NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";

const NUMERIC=["odSphere","odCylinder","odAxis","odAdd","odPrism","odDnp","odHeight","oeSphere","oeCylinder","oeAxis","oeAdd","oePrism","oeDnp","oeHeight","pdTotal"] as const;

function parseDecimal(value: unknown, field: string): Prisma.Decimal | null {
  if(value===undefined || value===null || value==="") return null;
  const raw=String(value).trim();
  if(!raw) return null;
  if(/^pl(?:ano)?$/i.test(raw)) return new Prisma.Decimal(0);
  const normalized=raw.replace(",",".");
  const number=Number(normalized);
  if(!Number.isFinite(number)) throw new Error("Valor inválido na receita: "+field);
  return new Prisma.Decimal(normalized);
}

async function parseUpdate(body:any){
  let validUntil:Date|null=null;
  if(body.validUntil){
    const raw=String(body.validUntil).trim();
    validUntil=new Date(raw+"T12:00:00");
    if(Number.isNaN(validUntil.getTime())) throw new Error("Validade da receita inválida");
  }
  const values:Record<string,Prisma.Decimal|null>={};
  for(const field of NUMERIC) values[field]=parseDecimal(body[field],field);
  return {
    ...(body.professional!==undefined?{professional:body.professional?String(body.professional).trim():null}:{}),
    ...(body.validUntil!==undefined?{validUntil}:{}),
    ...values,
    ...(body.notes!==undefined?{notes:body.notes?String(body.notes).trim():null}:{}),
    ...(body.odBase!==undefined?{odBase:body.odBase?String(body.odBase).trim():null}:{}),
    ...(body.oeBase!==undefined?{oeBase:body.oeBase?String(body.oeBase).trim():null}:{}),
    ...(body.originalText!==undefined?{originalText:body.originalText?String(body.originalText).trim():null}:{}),
  };
}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await requireRole(["ADMIN","GERENTE"]);
    const {id}=await params;
    const body=await req.json();
    const result=await db.$transaction(async tx=>{
      const prescription=await tx.prescription.findUnique({
        where:{id},
        include:{customer:{select:{id:true,name:true,active:true}}}
      });
      if(!prescription) throw new Error("Receita não encontrada.");
      const data=await parseUpdate(body);
      const updated=await tx.prescription.update({where:{id},data});
      await writeAudit(tx,{
        action:"UPDATE",
        entity:"Prescription",
        entityId:id,
        userId:actor.id,
        metadata:{customerId:prescription.customer.id,customerName:prescription.customer.name},
        result:"SUCCESS"
      });
      return updated;
    });
    return NextResponse.json(result);
  }catch(error){
    return apiError(error,"Não foi possível atualizar a receita.");
  }
}

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await requireRole(["ADMIN","GERENTE"]);
    const {id}=await params;
    const result=await db.$transaction(async tx=>{
      const prescription=await tx.prescription.findUnique({
        where:{id},
        include:{
          customer:{select:{id:true,name:true,active:true}},
          _count:{select:{orders:true,quotes:true}}
        }
      });
      if(!prescription)throw new Error("Receita não encontrada.");
      if(prescription._count.orders>0||prescription._count.quotes>0){
        return {blocked:true,reason:"Esta receita está vinculada a pedido ou orçamento e não pode ser excluída isoladamente."};
      }
      await tx.prescription.delete({where:{id}});
      await writeAudit(tx,{action:"DELETE",entity:"Prescription",entityId:id,userId:actor.id,metadata:{customerId:prescription.customer.id,customerName:prescription.customer.name,customerActive:prescription.customer.active},result:"SUCCESS"});
      return {blocked:false,customerName:prescription.customer.name};
    });
    if(result.blocked)return NextResponse.json({error:result.reason},{status:409});
    return NextResponse.json({ok:true,...result});
  }catch(error){
    return apiError(error,"Não foi possível excluir a receita.");
  }
}
