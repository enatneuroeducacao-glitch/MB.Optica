import {NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";

const schema=z.object({name:z.string().trim().min(2).max(100),active:z.boolean().optional()});
export async function GET(){try{await requireRole(["ADMIN","GERENTE","VENDEDOR","LABORATORIO"]);return NextResponse.json(await db.category.findMany({where:{active:true},orderBy:{name:"asc"}}));}catch(e){return apiError(e,"Não foi possível carregar as categorias.");}}
export async function POST(req:Request){try{const actor=await requireRole(["ADMIN","GERENTE"]);const b=schema.parse(await req.json());const c=await db.$transaction(async tx=>{const x=await tx.category.create({data:{name:b.name,active:b.active??true}});await writeAudit(tx,{action:"CREATE",entity:"Category",entityId:x.id,userId:actor.id,metadata:{name:x.name}});return x;});return NextResponse.json(c,{status:201});}catch(e){if(e instanceof z.ZodError)return NextResponse.json({error:"Categoria inválida."},{status:422});return apiError(e,"Não foi possível criar a categoria.");}}
