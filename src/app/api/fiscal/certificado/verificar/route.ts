import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export async function POST(){
  try{
    const actor=await requireRole(["ADMIN","GERENTE"]);
    const config=await db.fiscalConfig.findFirst({orderBy:{updatedAt:"desc"}});
    const checkedAt=new Date();
    if(!config){
      return NextResponse.json({
        ready:false,status:"SEM_CONFIGURACAO",issues:["Configuração fiscal ainda não cadastrada."],
        checkedAt:checkedAt.toISOString(),message:"Configuração fiscal não encontrada."
      },{status:422});
    }

    const issues:string[]=[];
    if(!config.secretReference)issues.push("Referência do segredo/certificado não cadastrada.");
    if(!config.certificateType)issues.push("Tipo do certificado não cadastrado.");
    if(!config.certificateExpiresAt)issues.push("Validade do certificado não cadastrada.");

    const daysRemaining=config.certificateExpiresAt
      ? Math.ceil((config.certificateExpiresAt.getTime()-checkedAt.getTime())/86400000)
      : null;

    if(daysRemaining!==null&&daysRemaining<0)issues.push("Certificado cadastrado como expirado.");
    if(daysRemaining!==null&&daysRemaining>=0&&daysRemaining<=30)issues.push("Certificado próximo do vencimento: atenção necessária.");

    await db.fiscalConfig.update({
      where:{id:config.id},
      data:{certificateLastCheckedAt:checkedAt}
    });

    await db.auditLog.create({data:{
      action:"FISCAL_CERTIFICATE_CHECKED",
      entity:"FiscalConfig",
      entityId:config.id,
      userId:actor.id,
      metadata:{
        environment:config.environment,
        certificateType:config.certificateType,
        ready:issues.length===0,
        daysRemaining
      }
    }});

    const warning=daysRemaining!==null&&daysRemaining>=0&&daysRemaining<=30;
    return NextResponse.json({
      ready:issues.length===0,
      status:daysRemaining===null?"PENDENTE":daysRemaining<0?"EXPIRADO":warning?"VENCE_EM_30_DIAS":"VALIDO",
      issues,
      checkedAt:checkedAt.toISOString(),
      message:issues.length===0
        ?"Cadastro do certificado está completo. A disponibilidade criptográfica será validada na integração fiscal."
        :warning
          ?"Cadastro válido, mas o certificado está próximo do vencimento."
          :"Cadastro do certificado possui pendências."
    });
  }catch(error){
    return apiError(error,"Não foi possível verificar o cadastro do certificado.");
  }
}
