import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
const valid=["RECEBIDA","EM_AVALIACAO","AGUARDANDO_CLIENTE","AUTORIZADA","RECUSADA","CONCLUIDA"];
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
 try{const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR","LABORATORIO"]);const {id}=await params;const b=await req.json();const status=String(b.status||"");if(!valid.includes(status))throw new Error("Situação inválida.");const existing=await db.thirdPartyFrameIntake.findUnique({where:{id}});if(!existing) return NextResponse.json({error:"Registro não encontrado"},{status:404});const updated=await db.$transaction(async tx=>{const row=await tx.thirdPartyFrameIntake.update({where:{id},data:{status}});await writeAudit(tx,{action:"UPDATE",entity:"ThirdPartyFrameIntake",entityId:id,userId:actor.id,request:req,metadata:{previousStatus:existing.status,status}});return row});return NextResponse.json(updated)}
 catch(error){return NextResponse.json({error:"Não foi possível atualizar a situação",detail:String(error)}, {status:String(error).includes("UNAUTHORIZED")?401:String(error).includes("FORBIDDEN")?403:400})}
}
