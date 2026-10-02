export const dynamic="force-dynamic";
export const revalidate=0;
import {NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";

const optionalText=(max:number)=>z.preprocess((v)=>v===""?null:v,z.string().trim().max(max).nullable().optional());
const optionalEmail=z.preprocess((v)=>v===""?null:v,z.string().trim().email().max(160).nullable().optional());
const schema=z.object({
  name:z.string().trim().min(2).max(160),
  cpfCnpj:optionalText(30),
  phone:optionalText(30),
  whatsapp:optionalText(30),
  email:optionalEmail,
  birthDate:z.string().nullable().optional(),
  notes:z.string().max(1000).nullable().optional()
});

export async function GET(req:Request){
  try{
    const url=new URL(req.url);
    const includeArchived=url.searchParams.get("includeArchived")==="1";
    const q=(url.searchParams.get("q")||"").trim();
    await requireRole(["ADMIN","GERENTE","VENDEDOR","FINANCEIRO","LABORATORIO"]);
    const data=await db.customer.findMany({
      where:{
        ...(includeArchived?{}:{active:true}),
        ...(q.length>=2?{OR:[
          {name:{contains:q,mode:"insensitive"}},
          {cpfCnpj:{contains:q,mode:"insensitive"}}
        ]}:{}),
      },
      orderBy:{name:"asc"},
      take:q.length>=2?50:500,
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
    if(error instanceof z.ZodError){const fields=Object.fromEntries(error.issues.map(issue=>[String(issue.path[0]??"form"),issue.message]));return NextResponse.json({error:"Corrija os campos destacados.",fields},{status:422});}
    return apiError(error,"Não foi possível criar o cliente.");
  }
}
