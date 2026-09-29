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

    const related=await db.legacyRecord.findMany({
      where:{source:"BEEPSTART",OR:[
        {collectionKey:{equals:"Venda",mode:"insensitive"}},
        {collectionKey:{equals:"ContaAReceber",mode:"insensitive"}},
        {collectionKey:{equals:"EnderecoLocal",mode:"insensitive"}}
      ]},
      select:{id:true,collectionKey:true,legacyId:true,payload:true,targetEntity:true,targetId:true}
    });
    const sales=related.filter(r=>String(r.collectionKey).toLowerCase()==="venda" && text((r.payload as Record<string,unknown>)?.clienteID)===text(legacy.legacyId));
    const receivables=related.filter(r=>String(r.collectionKey).toLowerCase()==="contaareceber" && text((r.payload as Record<string,unknown>)?.clienteID)===text(legacy.legacyId));

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

      if(addressLegacy){
        await tx.legacyRecord.update({where:{id:addressLegacy.id},data:{customerId:customer.id,status:"LINKED_TO_CUSTOMER"}});
      }
      for(const sale of sales){
        await tx.legacyRecord.update({where:{id:sale.id},data:{customerId:customer.id,status:"LINKED_TO_CUSTOMER"}});
      }

      let accountsCreated=0;
      for(const rec of receivables){
        const p=(rec.payload||{}) as Record<string,unknown>;
        const value=Number(p.valor);
        if(!Number.isFinite(value)||value<=0||p.archived===true) continue;
        const installments=Array.isArray(p.parcelas)?(p.parcelas as unknown[]).map(v=>Number(v)).filter(Number.isFinite):[];
        const paidCount=Array.isArray(p.pagos)?p.pagos.length:0;
        const paid=installments.length
          ? installments.slice(0,Math.min(paidCount,installments.length)).reduce((s,v)=>s+v,0)
          : Math.max(0,Number(p.valorPago||p.pago||0));
        const open=installments.length
          ? Math.max(0,installments.slice(Math.min(paidCount,installments.length)).reduce((s,v)=>s+v,0))
          : Math.max(0,value-paid);
        if(open<=0) continue;
        const marker="LEGACY_BEEPSTART:"+String(rec.legacyId||rec.id);
        const duplicate=await tx.account.findFirst({where:{customerId:customer.id,type:"RECEBER",notes:{contains:marker}},select:{id:true}});
        if(duplicate) continue;
        const dueRaw=Array.isArray(p.vencimentos)&&p.vencimentos.length ? p.vencimentos[0] : (p.vencimento||p.data||Date.now());
        const dueNumber=Number(dueRaw);
        const dueDate=Number.isFinite(dueNumber)&&dueNumber>1000000000 ? new Date(dueNumber) : new Date();
        await tx.account.create({
          data:{
            type:"RECEBER",
            description:text(p.descricao||p.description||"Conta a receber histórica — BeepStart"),
            customerId:customer.id,
            dueDate,
            amount:open,
            paidAmount:0,
            status:"PENDENTE",
            notes:marker+" | Registro histórico preservado no BeepStart."
          }
        });
        await tx.legacyRecord.update({where:{id:rec.id},data:{customerId:customer.id,targetEntity:"Account",status:"IMPORTED_SELECTIVELY"}});
        accountsCreated++;
      }

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
          addressLegacyId:addressLegacy?.legacyId||null,
          linkedSales:sales.length,
          importedReceivables:accountsCreated
        }
      });
      return {customer,linkedSales:sales.length,accountsCreated};
    });

    return NextResponse.json({
      ok:true,
      imported:true,
      customer:created.customer,
      linkedSales:created.linkedSales,
      accountsCreated:created.accountsCreated,
      message:"Cliente enviado para o cadastro com endereço, vínculo do histórico e contas a receber históricas em aberto preservadas como BeepStart."
    },{status:201});
  }catch(error){ return apiError(error,"Não foi possível importar o cliente legado para o cadastro."); }
}
