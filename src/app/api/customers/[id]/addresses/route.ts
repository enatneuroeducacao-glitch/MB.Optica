import {NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";

const schema=z.object({
  label:z.string().max(60).nullable().optional(),street:z.string().max(160).nullable().optional(),
  number:z.string().max(30).nullable().optional(),complement:z.string().max(100).nullable().optional(),
  district:z.string().max(100).nullable().optional(),city:z.string().max(100).nullable().optional(),
  state:z.string().max(2).nullable().optional(),postalCode:z.string().max(20).nullable().optional()
});

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
    const {id}=await params; const b=schema.parse(await req.json());
    const result=await db.$transaction(async tx=>{
      const customer=await tx.customer.findUnique({where:{id,active:true}});
      if(!customer)throw new Error("CUSTOMER_NOT_FOUND");
      const address=await tx.address.create({data:{customerId:id,...b}});
      await writeAudit(tx,{action:"CREATE",entity:"Address",entityId:address.id,userId:actor.id,metadata:{customerId:id}});
      return address;
    });
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Endereço inválido."},{status:422});
    if(error instanceof Error&&error.message==="CUSTOMER_NOT_FOUND")return NextResponse.json({error:"Cliente não encontrado."},{status:404});
    return apiError(error,"Não foi possível criar o endereço.");
  }
}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
    const {id}=await params; const b=schema.parse(await req.json());
    const addressId=new URL(req.url).searchParams.get("addressId");
    if(!addressId)return NextResponse.json({error:"addressId é obrigatório."},{status:400});
    const result=await db.$transaction(async tx=>{
      const address=await tx.address.findFirst({where:{id:addressId,customerId:id}});
      if(!address)throw new Error("ADDRESS_NOT_FOUND");
      const updated=await tx.address.update({where:{id:addressId},data:b});
      await writeAudit(tx,{action:"UPDATE",entity:"Address",entityId:addressId,userId:actor.id,metadata:{customerId:id}});
      return updated;
    });
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Endereço inválido."},{status:422});
    if(error instanceof Error&&error.message==="ADDRESS_NOT_FOUND")return NextResponse.json({error:"Endereço não encontrado."},{status:404});
    return apiError(error,"Não foi possível atualizar o endereço.");
  }
}
