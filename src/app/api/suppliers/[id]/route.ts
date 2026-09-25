import {NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";

const schema=z.object({
  name:z.string().trim().min(2).max(160).optional(),document:z.string().trim().max(30).nullable().optional(),
  phone:z.string().trim().max(30).nullable().optional(),email:z.string().trim().email().max(160).nullable().optional(),
  notes:z.string().max(1000).nullable().optional(),active:z.boolean().optional()
});

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    await requireRole(["ADMIN","GERENTE","FINANCEIRO"]);
    const {id}=await params;
    const supplier=await db.supplier.findUnique({
      where:{id},include:{products:{orderBy:{description:"asc"}},accounts:{orderBy:{dueDate:"asc"}},}
    });
    if(!supplier)return NextResponse.json({error:"Fornecedor não encontrado."},{status:404});
    return NextResponse.json(supplier);
  }catch(error){return apiError(error,"Não foi possível carregar o fornecedor.");}
}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await requireRole(["ADMIN","GERENTE"]);
    const {id}=await params; const b=schema.parse(await req.json());
    const result=await db.$transaction(async tx=>{
      const current=await tx.supplier.findUnique({where:{id}});
      if(!current)throw new Error("SUPPLIER_NOT_FOUND");
      const updated=await tx.supplier.update({where:{id},data:b});
      await writeAudit(tx,{action:"UPDATE",entity:"Supplier",entityId:id,userId:actor.id,metadata:{before:{name:current.name,document:current.document},after:{name:updated.name,document:updated.document},fields:Object.keys(b)}});
      return updated;
    });
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Dados do fornecedor inválidos."},{status:422});
    if(error instanceof Error&&error.message==="SUPPLIER_NOT_FOUND")return NextResponse.json({error:"Fornecedor não encontrado."},{status:404});
    return apiError(error,"Não foi possível atualizar o fornecedor.");
  }
}

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await requireRole(["ADMIN","GERENTE"]);
    const {id}=await params;
    const result=await db.$transaction(async tx=>{
      const current=await tx.supplier.findUnique({where:{id}});
      if(!current)throw new Error("SUPPLIER_NOT_FOUND");
      const updated=await tx.supplier.update({where:{id},data:{active:false}});
      await writeAudit(tx,{action:"ARCHIVE",entity:"Supplier",entityId:id,userId:actor.id,metadata:{name:current.name}});
      return updated;
    });
    return NextResponse.json({ok:true,supplier:result});
  }catch(error){
    if(error instanceof Error&&error.message==="SUPPLIER_NOT_FOUND")return NextResponse.json({error:"Fornecedor não encontrado."},{status:404});
    return apiError(error,"Não foi possível arquivar o fornecedor.");
  }
}
