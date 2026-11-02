import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {apiError} from "@/lib/api-error";

type FiscalRow={id?:unknown;code?:unknown;ncm?:unknown;cest?:unknown;cfop?:unknown;origin?:unknown;taxCode?:unknown};

export async function POST(request:Request){
  try{
    const actor=await requireRole(["ADMIN","GERENTE"]);
    const body=await request.json();
    if(!Array.isArray(body?.products)||body.products.length===0)
      return NextResponse.json({error:"Envie uma lista de produtos com dados fiscais conferidos."},{status:422});
    if(body.products.length>500)
      return NextResponse.json({error:"O limite por importação é de 500 produtos."},{status:422});

    const issues:string[]=[];
    const updates:{id:string;data:Record<string,string>}[]=[];
    const seen=new Set<string>();
    for(let i=0;i<body.products.length;i++){
      const row=body.products[i] as FiscalRow;
      const id=String(row?.id??"").trim();
      if(!id){issues.push(`Linha ${i+2}: identificador do produto ausente.`);continue;}
      if(seen.has(id)){issues.push(`Linha ${i+2}: produto duplicado na planilha.`);continue;}
      seen.add(id);
      const data:Record<string,string>={};
      for(const key of ["ncm","cest","cfop","origin","taxCode"] as const){
        const raw=row[key];
        if(raw===undefined||raw===null||String(raw).trim()==="")continue;
        let value=String(raw).trim();
        // Treat common spreadsheet placeholders as empty and accept standard punctuation in formatted fiscal codes.
        if(["-","—","–","N/A","NA","NULL"].includes(value.toUpperCase()))continue;
        if(key==="ncm"||key==="cest"||key==="cfop")value=value.replace(/[.\\s/-]/g,"");
        if(key==="ncm"&&!/^\\d{8}$/.test(value))issues.push(`Linha ${i+2}: NCM inválido ("${String(raw).trim()}"). Informe 8 dígitos, por exemplo 90049010.`);
        else if(key==="cest"&&!/^\\d{7}$/.test(value))issues.push(`Linha ${i+2}: CEST inválido ("${String(raw).trim()}"). Informe 7 dígitos ou deixe o campo vazio se não estiver validado.`);
        else if(key==="cfop"&&!/^\\d{4}$/.test(value))issues.push(`Linha ${i+2}: CFOP inválido ("${String(raw).trim()}"). Informe 4 dígitos ou deixe o campo vazio se não estiver validado.`);
        else if(key==="origin"&&!/^[0-8]$/.test(value))issues.push(`Linha ${i+2}: origem inválida ("${String(raw).trim()}"). Informe um dígito de 0 a 8 ou deixe vazio.`);
        else if(key==="taxCode"&&value.length>30)issues.push(`Linha ${i+2}: código tributário excede 30 caracteres.`);
        else data[key]=value;
      }
      // Linhas sem qualquer dado fiscal são permitidas no CSV exportado completo.
      // Elas são ignoradas, pois o arquivo pode conter todos os produtos, embora só alguns tenham sido revisados.
      if(Object.keys(data).length===0)continue;
      updates.push({id,data});
    }
    if(issues.length)return NextResponse.json({error:"A importação não foi aplicada. Corrija as pendências da planilha.",details:issues.slice(0,100),totalIssues:issues.length},{status:422});
    if(updates.length===0)return NextResponse.json({error:"Nenhuma linha contém dados fiscais para importar. Preencha ao menos um campo fiscal validado e tente novamente."},{status:422});
    const ids=updates.map(x=>x.id);
    const existing=await db.product.findMany({where:{id:{in:ids}},select:{id:true}});
    if(existing.length!==updates.length)
      return NextResponse.json({error:"Um ou mais produtos não existem mais. Nenhuma alteração foi aplicada; exporte uma nova planilha."},{status:409});
    await db.$transaction(async tx=>{
      for(const item of updates)await tx.product.update({where:{id:item.id},data:item.data});
      await tx.auditLog.create({data:{
        action:"FISCAL_PRODUCTS_BULK_UPDATED",entity:"ProductFiscalBatch",entityId:updates[0]?.id??null,userId:actor.id,
        metadata:{count:updates.length,fields:[...new Set(updates.flatMap(x=>Object.keys(x.data)))],source:"validated CSV import",taxRegime:"SIMEI"}
      }});
    });
    return NextResponse.json({ok:true,updated:updates.length,message:`${updates.length} produto(s) atualizado(s). Apenas campos explicitamente preenchidos e validados foram gravados.`});
  }catch(error){return apiError(error,"Não foi possível importar os dados fiscais em lote.");}
}
