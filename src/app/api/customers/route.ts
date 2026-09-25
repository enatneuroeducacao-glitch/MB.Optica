import {NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";

const schema=z.object({
  name:z.string().trim().min(2).max(160),
  cpfCnpj:z.string().trim().max(30).nullable().optional(),
  phone:z.string().trim().max(30).nullable().optional(),
  whatsapp:z.string().trim().max(30).nullable().optional(),
  email:z.string().trim().email().max(160).nullable().optional(),
  birthDate:z.string().nullable().optional(),
  notes:z.string().max(1000).nullable().optional()
});

export async function GET(){
  try{
    await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
    const data=await db.customer.findMany({
      where:{active:true},
      orderBy:{name:"asc"},
      take:500,
      include:{addresses:true,_count:{select:{orders:true,sales:true,prescriptions:true,accounts:true}}}
    });
    return NextResponse.json(data);
  }catch(error){return apiError(error,"Não foi possível carregar os clientes.");}
}

export async function POST(req:Request){
  try{
    const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
    const b=schema.parse(await req.json());
    const data=await db.$transaction(async tx=>{
      const created=await tx.customer.create({
        data:{
          name:b.name,cpfCnpj:b.cpfCnpj||undefined,phone:b.phone||undefined,whatsapp:b.whatsapp||undefined,
          email:b.email||undefined,birthDate:b.birthDate?new Date(b.birthDate):undefined,notes:b.notes||undefined
        }
      });
      await writeAudit(tx,{action:"CREATE",entity:"Customer",entityId:created.id,userId:actor.id,metadata:{name:created.name,cpfCnpj:created.cpfCnpj}});
      return created;
    });
    return NextResponse.json(data,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Dados do cliente inválidos."},{status:422});
    return apiError(error,"Não foi possível criar o cliente.");
  }
}
