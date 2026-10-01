import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {apiError} from "@/lib/api-error";

function diagnostic(product:any){
  const issues:string[]=[];
  const ncm=String(product.ncm??"").replace(/\D/g,"");
  const cest=String(product.cest??"").replace(/\D/g,"");
  const cfop=String(product.cfop??"").trim();
  const origin=String(product.origin??"").trim();
  const taxCode=String(product.taxCode??"").trim();

  if(!ncm) issues.push("NCM não informado");
  else if(ncm.length!==8) issues.push("NCM deve conter 8 dígitos");

  if(!cfop) issues.push("CFOP não informado");
  else if(!/^\d{4}$/.test(cfop)) issues.push("CFOP deve conter 4 dígitos");

  if(!origin) issues.push("Origem fiscal não informada");
  else if(!/^[0-8]$/.test(origin)) issues.push("Origem fiscal deve estar entre 0 e 8");

  if(!taxCode) issues.push("Código tributário não informado");

  const cestStatus=cest
    ? (/^\d{7}$/.test(cest) ? null : "CEST deve conter 7 dígitos")
    : null;
  if(cestStatus) issues.push(cestStatus);

  return {
    id:product.id,
    code:product.code,
    description:product.description,
    category:product.category?.name??null,
    ncm:product.ncm??null,
    cest:product.cest??null,
    cfop:product.cfop??null,
    origin:product.origin??null,
    taxCode:product.taxCode??null,
    issues,
    blocking:issues.some((x)=>!x.startsWith("CEST")),
    status:issues.length?"PENDENTE":"OK",
  };
}

export async function GET(){
  try{
    await requireRole(["ADMIN","GERENTE"]);
    const products=await db.product.findMany({
      where:{active:true},
      select:{id:true,code:true,description:true,ncm:true,cest:true,cfop:true,origin:true,taxCode:true,category:{select:{name:true}}},
      orderBy:{description:"asc"},
    });
    const diagnostics=products.map(diagnostic);
    const pending=diagnostics.filter((x)=>x.status==="PENDENTE");
    const blocking=pending.filter((x)=>x.blocking);
    return NextResponse.json({
      total:diagnostics.length,
      ok:diagnostics.length-pending.length,
      pendentes:pending.length,
      bloqueantes:blocking.length,
      informativas:pending.length-blocking.length,
      produtos:diagnostics,
      resumo:{
        semNcm:diagnostics.filter((x)=>!String(x.ncm??"").trim()).length,
        ncmInvalido:diagnostics.filter((x)=>String(x.ncm??"").replace(/\D/g,"").length>0 && String(x.ncm??"").replace(/\D/g,"").length!==8).length,
        semCfop:diagnostics.filter((x)=>!String(x.cfop??"").trim()).length,
        cfopInvalido:diagnostics.filter((x)=>String(x.cfop??"").trim()&&!/^\d{4}$/.test(String(x.cfop??"").trim())).length,
        semOrigem:diagnostics.filter((x)=>!String(x.origin??"").trim()).length,
        origemInvalida:diagnostics.filter((x)=>String(x.origin??"").trim()&&!/^[0-8]$/.test(String(x.origin??"").trim())).length,
        semCodigoTributario:diagnostics.filter((x)=>!String(x.taxCode??"").trim()).length,
        cestInvalido:diagnostics.filter((x)=>{const v=String(x.cest??"").replace(/\D/g,"");return !!v&&v.length!==7}).length,
      },
    });
  }catch(e){return apiError(e,"Não foi possível diagnosticar os dados fiscais dos produtos.");}
}
