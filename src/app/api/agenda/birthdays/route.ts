import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";

export async function GET(){
  try{
    await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
    const [customers,reminders]=await Promise.all([
      db.customer.findMany({where:{active:true,birthDate:{not:null}},select:{id:true,name:true,birthDate:true,phone:true},orderBy:{name:"asc"}}),
      db.birthdayReminder.findMany({orderBy:{name:"asc"},include:{customer:{select:{id:true,name:true}}}})
    ]);
    return NextResponse.json({customers,reminders});
  }catch(error){return apiError(error,"Não foi possível carregar os aniversariantes.");}
}

export async function POST(req:Request){
  try{
    const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
    const body=await req.json();
    const customerId=body.customerId?String(body.customerId):null;
    const birthDate=new Date(String(body.birthDate||""));
    if(Number.isNaN(birthDate.getTime()))throw new Error("Informe uma data de nascimento válida.");
    let customer=null;
    if(customerId){
      customer=await db.customer.findUnique({where:{id:customerId,active:true},select:{id:true,name:true}});
      if(!customer)throw new Error("Cliente não encontrado ou inativo.");
    }
    const name=String(body.name||customer?.name||"").trim();
    if(name.length<2||name.length>160)throw new Error("Informe o nome do aniversariante.");
    const reminder=await db.$transaction(async tx=>{
      const created=await tx.birthdayReminder.create({data:{name,birthDate,customerId:customer?.id||null,notes:body.notes?String(body.notes).trim().slice(0,500):null},include:{customer:{select:{id:true,name:true}}}});
      await writeAudit(tx,{action:"CREATE",entity:"BirthdayReminder",entityId:created.id,userId:actor.id,metadata:{name,customerId:created.customerId}});
      return created;
    });
    return NextResponse.json(reminder,{status:201});
  }catch(error){return apiError(error,"Não foi possível incluir o aniversariante.");}
}

export async function DELETE(req:Request){
  try{
    const actor=await requireRole(["ADMIN","GERENTE"]);
    const id=new URL(req.url).searchParams.get("id");
    if(!id)throw new Error("Identificador do lembrete não informado.");
    const existing=await db.birthdayReminder.findUnique({where:{id}});
    if(!existing)throw new Error("Lembrete não encontrado.");
    await db.$transaction(async tx=>{
      await tx.birthdayReminder.delete({where:{id}});
      await writeAudit(tx,{action:"DELETE",entity:"BirthdayReminder",entityId:id,userId:actor.id,metadata:{name:existing.name}});
    });
    return NextResponse.json({ok:true});
  }catch(error){return apiError(error,"Não foi possível excluir o lembrete.");}
}
