import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const schema=z.object({name:z.string().trim().min(2).max(120),email:z.string().email().max(160),mbEmail:z.string().email().max(160).nullable().optional(),password: z.string().min(8).max(200),role:z.enum(["ADMIN","GERENTE","VENDEDOR","FINANCEIRO","LABORATORIO"]),permissions:z.record(z.string(),z.boolean()).optional()}); 

export async function GET(){
  try{
    await requireRole(["ADMIN","GERENTE"]);
    const users=await db.user.findMany({orderBy:{name:"asc"},select:{id:true,name:true,email:true,mbEmail:true,role:true,active:true,lastLoginAt:true,createdAt:true,permissions:true,mustChangePassword:true}});
    return NextResponse.json({users});
  }catch(error){return apiError(error,"Não foi possível carregar os usuários.");}
}
export async function POST(request:Request){
  try{
    const actor=await requireRole(["ADMIN"]);
    const body=schema.parse(await request.json());
    const passwordHash=await bcrypt.hash(body.password,12);
    const user=await db.user.create({data:{name:body.name,email:body.email.trim().toLowerCase(),mbEmail:body.mbEmail?.trim().toLowerCase()||null,passwordHash,mustChangePassword:true,role:body.role,permissions:body.permissions??{}}});
    await db.auditLog.create({data:{action:"USER_CREATED",entity:"User",entityId:user.id,userId:actor.id,metadata:{role:user.role}}});
    return NextResponse.json({user:{id:user.id,name:user.name,email:user.email,mbEmail:user.mbEmail,role:user.role,active:user.active,permissions:user.permissions,mustChangePassword:user.mustChangePassword}},{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Dados de usuário inválidos."},{status:422});
    return apiError(error,"Não foi possível criar o usuário.");
  }
}