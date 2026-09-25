import {NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";

const schema=z.object({
  name:z.string().trim().min(2).max(160),
  document:z.string().trim().max(30).nullable().optional(),
  phone:z.string().trim().max(30).nullable().optional(),
  email:z.string().trim().email().max(160).nullable().optional(),
  notes:z.string().max(1000).nullable().optional()
});

export async function GET(){
  try{
    await requireRole(["ADMIN","GERENTE","FINANCEIRO"]);
    const data=await db.supplier.findMany({
      where:{active:true},orderBy:{name:"asc"},take:500,
      include:{products:{where:{active:true},select:{id:true,code:true,description:true,cost:true,salePrice:true}},_count:{select:{products:true,accounts:true}}}
    });
    return NextResponse.json(data);
  }catch(error){return apiError(error,"Não foi possível carregar os fornecedores.");}
}

export async function POST(req:Request){
  try{
    const actor=await requireRole(["ADMIN","GERENTE"]);
    const b=schema.parse(await req.json());
    const result=await db.$transaction(async tx=>{
      const supplier=await tx.supplier.create({data:{name:b.name,document:b.document||undefined,phone:b.phone||undefined,email:b.email||undefined,notes:b.notes||undefined}});
      await writeAudit(tx,{action:"CREATE",entity:"Supplier",entityId:supplier.id,userId:actor.id,metadata:{name:supplier.name,document:supplier.document}});
      return supplier;
    });
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Dados do fornecedor inválidos."},{status:422});
    return apiError(error,"Não foi possível criar o fornecedor.");
  }
}
