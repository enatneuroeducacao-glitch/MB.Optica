import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {apiError} from "@/lib/api-error";

const ENVIRONMENTS=["HOMOLOGACAO","PRODUCAO"];
const MODES=["NFF","NFAE_SAT","PAF_NFCE","MANUAL"];

function digits(value:any){return String(value??"").replace(/\D/g,"");}

function addIssue(list:any[],code:string,message:string,blocking=true){
  list.push({code,message,blocking});
}

function validateSale(sale:any,config:any,certificate:any,store:any){
  const blocking:any[]=[];
  const warnings:any[]=[];
  const add=(code:string,message:string,hard=true)=>hard?addIssue(blocking,code,message,true):addIssue(warnings,code,message,false);

  if(!config) add("FISCAL_CONFIG","Configuração fiscal não cadastrada.");
  else{
    if(!config.active) add("FISCAL_INACTIVE","Configuração fiscal está inativa.");
    if(!config.legalName) add("EMITENTE_RAZAO","Razão social do emitente não informada.");
    const cnpj=digits(config.cnpj);
    if(!cnpj) add("EMITENTE_CNPJ","CNPJ do emitente não informado.");
    else if(cnpj.length!==14) add("EMITENTE_CNPJ_INVALIDO","CNPJ do emitente deve conter 14 dígitos.");
    if(!config.stateRegistration) add("EMITENTE_IE","Inscrição estadual não informada.");
    if(!config.uf||!/^[A-Z]{2}$/.test(String(config.uf).toUpperCase())) add("EMITENTE_UF","UF do emitente não informada ou inválida.");
    if(!config.city) add("EMITENTE_CIDADE","Município do emitente não informado.");
    if(!config.taxRegime) add("REGIME_TRIBUTARIO","Regime tributário não informado.");
    if(!MODES.includes(String(config.integrationMode))) add("MODO_INTEGRACAO","Modo de integração fiscal inválido.");
    if(!config.series) add("SERIE","Série fiscal não informada.");
    if(!ENVIRONMENTS.includes(String(config.environment))) add("AMBIENTE","Ambiente fiscal inválido.");
  }

  if(!certificate?.secretReference) add("CERT_REFERENCIA","Referência do certificado/segredo não cadastrada.");
  if(!certificate?.certificateType) add("CERT_TIPO","Tipo do certificado não cadastrado.");
  if(!certificate?.certificateExpiresAt) add("CERT_VALIDADE","Validade do certificado não cadastrada.");
  if(certificate?.certificateExpiresAt){
    const days=Math.ceil((new Date(certificate.certificateExpiresAt).getTime()-Date.now())/86400000);
    if(days<0) add("CERT_EXPIRADO","Certificado cadastrado como expirado.");
    else if(days<=30) add("CERT_VENCIMENTO","Certificado próximo do vencimento.",false);
  }

  if(!sale) add("VENDA","Venda não encontrada.");
  else{
    if(sale.canceled) add("VENDA_CANCELADA","Venda está cancelada.");
    if(!sale.customer) add("CLIENTE","Cliente da venda não encontrado.");
    else{
      if(!sale.customer.active) add("CLIENTE_INATIVO","Cliente está inativo.");
      if(!sale.customer.name?.trim()) add("CLIENTE_NOME","Nome do cliente não informado.");
      const doc=digits(sale.customer.cpfCnpj);
      if(doc && doc.length!==11 && doc.length!==14) add("CLIENTE_DOCUMENTO","CPF/CNPJ do cliente possui formato inválido.",false);
      if(!doc) add("CLIENTE_DOCUMENTO_AUSENTE","CPF/CNPJ do cliente não informado; a emissão pode exigir identificação do destinatário.",false);
    }

    const total=Number(sale.total);
    const subtotal=Number(sale.subtotal);
    const discount=Number(sale.discount);
    const surcharge=Number(sale.surcharge);
    if(!Number.isFinite(total)||total<=0) add("VALOR_TOTAL","Valor total da venda deve ser maior que zero.");
    if(!Number.isFinite(subtotal)||subtotal<0) add("SUBTOTAL","Subtotal da venda é inválido.");
    if(!Number.isFinite(discount)||discount<0) add("DESCONTO","Desconto da venda é inválido.");
    if(!Number.isFinite(surcharge)||surcharge<0) add("ACRESCIMO","Acréscimo da venda é inválido.");
    if(Number.isFinite(subtotal)&&Number.isFinite(discount)&&Number.isFinite(surcharge)&&Number.isFinite(total)){
      const expected=Math.max(0,subtotal-discount+surcharge);
      if(Math.abs(expected-total)>0.01) add("TOTAL_INCONSISTENTE","Total da venda não corresponde ao subtotal, desconto e acréscimo.");
    }

    if(!sale.items?.length) add("ITENS","A venda não possui itens.");
    for(const [index,item] of (sale.items||[]).entries()){
      const prefix="ITEM_"+(index+1);
      const quantity=Number(item.quantity);
      const unitPrice=Number(item.unitPrice);
      const lineTotal=Number(item.total);
      if(!item.product) add(prefix+"_PRODUTO","Item "+(index+1)+" não está vinculado a um produto fiscal.");
      else{
        const p=item.product;
        const ncm=digits(p.ncm);
        const cfop=String(p.cfop??"").trim();
        const origin=String(p.origin??"").trim();
        const taxCode=String(p.taxCode??"").trim();
        if(!ncm) add(prefix+"_NCM","Item "+(index+1)+" ("+p.description+"): NCM não informado.");
        else if(ncm.length!==8) add(prefix+"_NCM_INVALIDO","Item "+(index+1)+" ("+p.description+"): NCM deve conter 8 dígitos.");
        if(!cfop) add(prefix+"_CFOP","Item "+(index+1)+" ("+p.description+"): CFOP não informado.");
        else if(!/^\d{4}$/.test(cfop)) add(prefix+"_CFOP_INVALIDO","Item "+(index+1)+" ("+p.description+"): CFOP deve conter 4 dígitos.");
        if(!origin) add(prefix+"_ORIGEM","Item "+(index+1)+" ("+p.description+"): origem fiscal não informada.");
        else if(!/^[0-8]$/.test(origin)) add(prefix+"_ORIGEM_INVALIDA","Item "+(index+1)+" ("+p.description+"): origem fiscal deve estar entre 0 e 8.");
        if(!taxCode) add(prefix+"_TRIBUTACAO","Item "+(index+1)+" ("+p.description+"): código tributário não informado.");
        const cest=digits(p.cest);
        if(cest && cest.length!==7) add(prefix+"_CEST","Item "+(index+1)+" ("+p.description+"): CEST deve conter 7 dígitos.",false);
      }
      if(!Number.isFinite(quantity)||quantity<=0) add(prefix+"_QUANTIDADE","Quantidade do item "+(index+1)+" deve ser maior que zero.");
      if(!Number.isFinite(unitPrice)||unitPrice<0) add(prefix+"_VALOR_UNITARIO","Valor unitário do item "+(index+1)+" é inválido.");
      if(!Number.isFinite(lineTotal)||lineTotal<0) add(prefix+"_TOTAL_ITEM","Total do item "+(index+1)+" é inválido.");
    }
  }

  if(store){
    if(!store.city && !config?.city) add("EMPRESA_CIDADE","Município da empresa não informado.");
    if(!store.state && !config?.uf) add("EMPRESA_UF","UF da empresa não informada.");
  }

  const all=[...blocking,...warnings];
  return {
    valid:blocking.length===0,
    status:blocking.length===0?(warnings.length?"ATENCAO":"APTO"):"BLOQUEADO",
    blocking,
    warnings,
    totalIssues:all.length,
    message:blocking.length
      ?"Emissão fiscal bloqueada. Corrija as pendências bloqueantes antes de transmitir."
      :warnings.length
        ?"Validação fiscal concluída com alertas que devem ser revisados."
        :"Venda apta para a próxima etapa fiscal."
  };
}

export async function POST(request:Request){
  try{
    const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
    const body=await request.json();
    const saleId=String(body?.saleId||"").trim();
    if(!saleId)return NextResponse.json({error:"saleId é obrigatório."},{status:422});

    const [sale,config,store]=await Promise.all([
      db.sale.findUnique({
        where:{id:saleId},
        include:{
          customer:true,
          items:{include:{product:{select:{id:true,description:true,ncm:true,cest:true,cfop:true,origin:true,taxCode:true}}}}
        }
      }),
      db.fiscalConfig.findFirst({orderBy:{updatedAt:"desc"}}),
      db.storeSettings.findFirst({orderBy:{updatedAt:"desc"}})
    ]);

    const result=validateSale(sale,config,config?{
      secretReference:config.secretReference,
      certificateType:config.certificateType,
      certificateExpiresAt:config.certificateExpiresAt
    }:null,store);

    await db.auditLog.create({data:{
      action:"FISCAL_SALE_VALIDATED",
      entity:"Sale",
      entityId:saleId,
      userId:actor.id,
      metadata:{
        valid:result.valid,
        status:result.status,
        blockingCount:result.blocking.length,
        warningCount:result.warnings.length,
        environment:config?.environment??null
      }
    }});

    return NextResponse.json({saleId, ...result});
  }catch(error){return apiError(error,"Não foi possível validar a venda para emissão fiscal.");}
}
