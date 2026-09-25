import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const schema=z.object({name:z.string().trim().min(2).max(120).optional(),email:z.string().email().max(160).optional(),password:z.string().min(10).max(200).optional(),role:z.enum(["ADMIN","GERENTE","VENDEDOR","FINANCEIRO","LABORATORIO"]).optional(),active:z.boolean().optional()});

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await requireRole(["ADMIN"]);
    const {id}=await params; const body=schema.parse(await request.json());
    const data:{name?:string;email?:string;passwordHash?:string;role?:"ADMIN"|"GERENTE"|"VENDEDOR"|"FINANCEIRO"|"LABORATORIO";active?:boolean;sessionVersion?:{increment:number}}={};
    if(body.name!==undefined)data.name=body.name;
    if(body.email!==undefined)data.email=body.email.trim().toLowerCase();
    if(body.password!==undefined)data.passwordHash=await bcrypt.hash(body.password,12);
    if(body.role!==undefined)data.role=body.role;
    if(body.active!==undefined)data.active=body.active;
    if(body.role!==undefined || body.active!==undefined || body.password!==undefined)data.sessionVersion={increment:1};
    const user=await db.user.update({where:{id},data,select:{id:true,name:true,email:true,role:true,active:true}});
    await db.auditLog.create({data:{action:"USER_UPDATED",entity:"User",entityId:id,userId:actor.id,metadata:{fields:Object.keys(body)}}});
    return NextResponse.json({user});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Dados de usuário inválidos."},{status:422});
    return apiError(error,"Não foi possível atualizar o usuário.");
  }
}