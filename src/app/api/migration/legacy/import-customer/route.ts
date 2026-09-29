import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { apiError } from "@/lib/api-error";

function text(v: unknown){ return v==null ? "" : String(v).trim(); }
function digits(v: unknown){ return text(v).replace(/\\D/g,""); }

export async function POST(request: Request){
  try{
    const actor=await requireRole(["ADMIN","GERENTE"]);
    const body=await request.json();
    const legacyRecordId=text(body?.legacyRecordId);
    if(!legacyRecordId) return NextResponse.json({ok:false,error:"Registro legado não informado."},{status:400});

    const legacy=await db.legacyRecord.findUnique({where:{id:legacyRecordId}});
    if(!legacy) return NextResponse.json({ok:false,error:"Registro legado não encontrado."},{status:404});
    if(legacy.source!=="BEEPSTART" || legacy.collectionKey?.toLowerCase()!=="cliente"){
      return NextResponse.json({ok:false,error:"Somente registros da coleção Cliente podem ser enviados ao cadastro."},{status:400});
    }
    if(legacy.targetEntity==="Customer" && legacy.targetId){
      const existing=await db.customer.findUnique({where:{id:legacy.targetId}});
      if(existing) return NextResponse.json({ok:true,alreadyImported:true,customer:existing,message:"Este cliente legado já está vinculado ao cadastro do MB Óptica."});
    }

    const p=(legacy.payload||{}) as Record<string,unknown>;
    const name=text(p.name||p.nome);
    const cpfCnpj=text(p.cnp||p.cpf||p.cpfCnpj||p.cnpj||p.documento);
    const phone=text(p.phone||p.telefone||p.celular);
    const email=text(p.email);
    const enderecoId=text(p.enderecoID||p.enderecoId);

    if(name.length<2) return NextResponse.json({ok:false,error:"O registro legado não possui um nome válido."},{status:422});

    const existingByDocument=cpfCnpj
      ? await db.customer.findMany({select:{id:true,name:true,cpfCnpj:true,phone:true,email:true},where:{cpfCnpj:{not:null}}})
      : [];
    const normalizedCpf=digits(cpfCnpj);
    const duplicate=existingByDocument.find(c=>digits(c.cpfCnpj)===normalizedCpf);

    if(duplicate){
      return NextResponse.json({
        ok:true,
        alreadyExists:true,
        customer:duplicate,
        message:"Já existe um cadastro no MB Óptica com o mesmo CPF/CNPJ. Nenhum cliente duplicado foi criado."
      });
    }

    const addressLegacy=enderecoId
      ? await db.legacyRecord.findFirst({where:{source:"BEEPSTART",collectionKey:{equals:"EnderecoLocal",mode:"insensitive"},legacyId:enderecoId},orderBy:{importedAt:"desc"}})
      : null;
    const a=(addressLegacy?.payload||{}) as Record<string,unknown>;

    const created=await db.$transaction(async tx=>{
      const customer=await tx.customer.create({
        data:{
          name,
          cpfCnpj:cpfCnpj||undefined,
          phone:phone||undefined,
          email:email||undefined,
          notes:"Importado seletivamente do legado BeepStart. ID legado: "+(legacy.legacyId||"sem ID"),
          ...(addressLegacy ? {addresses:{create:{
            label:"Endereço legado",
            street:text(a.logradouro||a.street),
            number:text(a.numero||a.number),
            complement:text(a.complemento||a.complement),
            district:text(a.distrito||a.district),
            city:text(a.cidade||a.city),
            state:text(a.estado||a.state),
            postalCode:text(a.cep||a.postalCode)
          }}} : {})
        }
      });
      await tx.legacyRecord.update({
        where:{id:legacy.id},
        data:{customerId:customer.id,targetEntity:"Customer",targetId:customer.id,status:"IMPORTED_SELECTIVELY"}
      });
      await writeAudit(tx,{
        action:"LEGACY_SELECTIVE_IMPORT",
        entity:"Customer",
        entityId:customer.id,
        userId:actor.id,
        request,
        metadata:{
          source:"BEEPSTART",
          legacyRecordId:legacy.id,
          legacyId:legacy.legacyId,
          legacyKey:legacy.legacyKey,
          addressLegacyId:addressLegacy?.legacyId||null
        }
      });
      return customer;
    });

    return NextResponse.json({
      ok:true,
      imported:true,
      customer:created,
      message:"Cliente enviado para o cadastro do MB Óptica com rastreabilidade do registro legado."
    },{status:201});
  }catch(error){ return apiError(error,"Não foi possível importar o cliente legado para o cadastro."); }
}
