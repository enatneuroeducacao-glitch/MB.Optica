import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const schema=z.object({
  legalName:z.string().trim().max(160).nullable().optional(),
  tradeName:z.string().trim().max(120).nullable().optional(),
  cnpj:z.string().trim().max(30).nullable().optional(),
  stateRegistration:z.string().trim().max(40).nullable().optional(),
  municipalRegistration:z.string().trim().max(40).nullable().optional(),
  uf:z.string().trim().length(2),
  city:z.string().trim().max(100).nullable().optional(),
  taxRegime:z.enum(["SIMEI","SIMPLES_NACIONAL","LUCRO_PRESUMIDO","LUCRO_REAL"]),
  integrationMode:z.enum(["NFF","NFAE_SAT","PAF_NFCE","MANUAL"]),
  series:z.string().trim().max(10).nullable().optional(),
  environment:z.enum(["HOMOLOGACAO","PRODUCAO"]),
  secretReference:z.string().trim().max(255).nullable().optional(),
  certificateType:z.enum(["A1","A3","SE-S","SE-H"]).nullable().optional(),
  certificateExpiresAt:z.coerce.date().nullable().optional(),
  certificateAuthority:z.string().trim().max(160).nullable().optional(),
  certificateLastCheckedAt:z.coerce.date().nullable().optional(),
  active:z.boolean()
});

const defaults={
  legalName:null,tradeName:null,cnpj:null,stateRegistration:null,municipalRegistration:null,
  uf:"SC",city:null,taxRegime:"SIMEI" as const,integrationMode:"NFF" as const,
  series:null,environment:"HOMOLOGACAO" as const,secretReference:null,
  certificateType:null,certificateExpiresAt:null,certificateAuthority:null,certificateLastCheckedAt:null,active:true
};

function certificateState(config:{secretReference:string|null;certificateType:string|null;certificateExpiresAt:Date|null}){
  if(!config.secretReference)return {status:"SEM_REFERENCIA",daysRemaining:null};
  if(!config.certificateType)return {status:"SEM_TIPO",daysRemaining:null};
  if(!config.certificateExpiresAt)return {status:"SEM_VALIDADE",daysRemaining:null};
  const daysRemaining=Math.ceil((config.certificateExpiresAt.getTime()-Date.now())/86400000);
  if(daysRemaining<0)return {status:"EXPIRADO",daysRemaining};
  if(daysRemaining<=30)return {status:"VENCE_EM_30_DIAS",daysRemaining};
  return {status:"VALIDO",daysRemaining};
}

export async function GET(){
  try{
    await requireUser();
    const config=await db.fiscalConfig.findFirst({orderBy:{updatedAt:"desc"}});
    const resolved=config ?? defaults;
    return NextResponse.json({config:resolved,certificate:certificateState(resolved)});
  }catch(error){return apiError(error,"Não foi possível carregar a configuração fiscal.");}
}

export async function PATCH(request:Request){
  try{
    const actor=await requireRole(["ADMIN","GERENTE"]);
    const body=schema.parse(await request.json());
    const existing=await db.fiscalConfig.findFirst({orderBy:{updatedAt:"desc"}});
    const config=existing
      ? await db.fiscalConfig.update({where:{id:existing.id},data:body})
      : await db.fiscalConfig.create({data:body});
    await db.auditLog.create({data:{
      action:existing?"FISCAL_CONFIG_UPDATED":"FISCAL_CONFIG_CREATED",
      entity:"FiscalConfig",entityId:config.id,userId:actor.id,
      metadata:{environment:config.environment,integrationMode:config.integrationMode,active:config.active}
    }});
    return NextResponse.json({config,certificate:certificateState(config)});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Dados fiscais inválidos. Revise os campos obrigatórios."},{status:422});
    return apiError(error,"Não foi possível salvar a configuração fiscal.");
  }
}
