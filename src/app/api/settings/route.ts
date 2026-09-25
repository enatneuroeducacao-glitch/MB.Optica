import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const schema=z.object({legalName:z.string().max(160).nullable().optional(),tradeName:z.string().min(2).max(120).optional(),document:z.string().max(30).nullable().optional(),phone:z.string().max(30).nullable().optional(),whatsapp:z.string().max(30).nullable().optional(),email:z.string().email().nullable().optional(),street:z.string().max(160).nullable().optional(),number:z.string().max(30).nullable().optional(),complement:z.string().max(100).nullable().optional(),district:z.string().max(100).nullable().optional(),city:z.string().max(100).nullable().optional(),state:z.string().length(2).nullable().optional(),postalCode:z.string().max(20).nullable().optional(),timezone:z.string().max(80).optional(),currency:z.string().length(3).optional()});

export async function GET(){
  try{
    await requireUser();
    let settings=await db.storeSettings.findFirst({where:{key:"default"}});
    if(!settings)settings=await db.storeSettings.create({data:{tradeName:"MB Óptica",state:"SC"}});
    return NextResponse.json({settings});
  }catch(error){return apiError(error,"Não foi possível carregar as configurações.");}
}
export async function PATCH(request:Request){
  try{
    const actor=await requireRole(["ADMIN","GERENTE"]); const body=schema.parse(await request.json());
    let settings=await db.storeSettings.findFirst({where:{active:true}});
    if(!settings)settings=await db.storeSettings.create({data:{tradeName:"MB Óptica",state:"SC"}});
    settings=await db.storeSettings.update({where:{id:settings.id},data:body});
    await db.auditLog.create({data:{action:"STORE_SETTINGS_UPDATED",entity:"StoreSettings",entityId:settings.id,userId:actor.id}});
    return NextResponse.json({settings});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Configurações inválidas."},{status:422});
    return apiError(error,"Não foi possível salvar as configurações.");
  }
}