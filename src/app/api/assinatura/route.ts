import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

const patchSchema = z.object({
  plan: z.enum(["BASICO", "PROFISSIONAL", "ENTERPRISE"]).optional(),
  status: z.enum(["AVALIACAO", "ATIVA", "PENDENTE", "SUSPENSA", "CANCELADA", "EXPIRADA"]).optional(),
  billingCycle: z.enum(["MENSAL", "ANUAL"]).optional(),
  price: z.coerce.number().min(0).max(999999).optional(),
  maxUsers: z.coerce.number().int().min(1).max(1000).optional(),
  modules: z.array(z.string().min(1).max(80)).max(50).optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
  currentPeriodStart: z.string().datetime().nullable().optional(),
  currentPeriodEnd: z.string().datetime().nullable().optional(),
});

function serialize(subscription:any, activeUsers:number){
  return {
    ...subscription,
    price: Number(subscription.price),
    modules: Array.isArray(subscription.modules) ? subscription.modules : [],
    activeUsers,
  };
}

export async function GET(){
  try{
    await requireUser();
    const [subscription, activeUsers] = await Promise.all([
      db.subscription.findFirst({orderBy:{createdAt:"asc"}}),
      db.user.count({where:{active:true}}),
    ]);
    return NextResponse.json({subscription: subscription ? serialize(subscription,activeUsers) : null});
  }catch(error){
    return apiError(error,"Não foi possível carregar a assinatura.");
  }
}

export async function PATCH(request:Request){
  try{
    const actor=await requireRole(["ADMIN"]);
    const body=patchSchema.parse(await request.json());
    const existing=await db.subscription.findFirst({orderBy:{createdAt:"asc"}});
    const data:any={};
    if(body.plan!==undefined)data.plan=body.plan;
    if(body.status!==undefined)data.status=body.status;
    if(body.billingCycle!==undefined)data.billingCycle=body.billingCycle;
    if(body.price!==undefined)data.price=body.price;
    if(body.maxUsers!==undefined)data.maxUsers=body.maxUsers;
    if(body.modules!==undefined)data.modules=body.modules;
    if(body.trialEndsAt!==undefined)data.trialEndsAt=body.trialEndsAt?new Date(body.trialEndsAt):null;
    if(body.currentPeriodStart!==undefined)data.currentPeriodStart=body.currentPeriodStart?new Date(body.currentPeriodStart):null;
    if(body.currentPeriodEnd!==undefined)data.currentPeriodEnd=body.currentPeriodEnd?new Date(body.currentPeriodEnd):null;
    if(body.status==="CANCELADA")data.canceledAt=new Date();
    if(body.status && body.status!=="CANCELADA")data.canceledAt=null;

    const subscription=existing
      ? await db.subscription.update({where:{id:existing.id},data})
      : await db.subscription.create({data:{
          plan:body.plan||"PROFISSIONAL",
          status:body.status||"AVALIACAO",
          billingCycle:body.billingCycle||"MENSAL",
          price:body.price??0,
          maxUsers:body.maxUsers??5,
          modules:body.modules??["Dashboard","Clientes","Produtos e estoque","Vendas","Financeiro","Relatórios","Laboratório"],
          trialEndsAt:body.trialEndsAt?new Date(body.trialEndsAt):null,
          currentPeriodStart:body.currentPeriodStart?new Date(body.currentPeriodStart):new Date(),
          currentPeriodEnd:body.currentPeriodEnd?new Date(body.currentPeriodEnd):null,
        }});

    await db.auditLog.create({data:{action:"SUBSCRIPTION_UPDATED",entity:"Subscription",entityId:subscription.id,userId:actor.id,metadata:{plan:subscription.plan,status:subscription.status,billingCycle:subscription.billingCycle}}});
    const activeUsers=await db.user.count({where:{active:true}});
    return NextResponse.json({subscription:serialize(subscription,activeUsers)});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Dados de assinatura inválidos."},{status:422});
    return apiError(error,"Não foi possível salvar a assinatura.");
  }
}
