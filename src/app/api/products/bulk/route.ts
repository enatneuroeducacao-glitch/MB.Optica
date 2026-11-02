import {NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";

const schema=z.object({
  ids:z.array(z.string().min(1)).min(1).max(200),
  action:z.enum(["archive","delete"]),
});

export async function POST(req:Request){
  try{
    const actor=await requireRole(["ADMIN","GERENTE"]);
    const {ids,action}=schema.parse(await req.json());
    const uniqueIds=[...new Set(ids)];
    const results:{id:string;description?:string;status:"success"|"blocked"|"not_found";reason?:string}[]=[];

    for(const id of uniqueIds){
      try{
        const result=await db.$transaction(async tx=>{
          const product=await tx.product.findUnique({where:{id}});
          if(!product)return {id,status:"not_found" as const,reason:"Produto não encontrado."};
          if(action==="archive"){
            if(!product.active)return {id,description:product.description,status:"success" as const,reason:"Já estava arquivado."};
            await tx.product.update({where:{id},data:{active:false,publishedOnSite:false}});
            await writeAudit(tx,{action:"ARCHIVE",entity:"Product",entityId:id,userId:actor.id,metadata:{code:product.code,bulk:true}});
            return {id,description:product.description,status:"success" as const};
          }

          const [lots,movements,orderItems,quoteItems,saleItems,legacyLinks]=await Promise.all([
            tx.stockLot.count({where:{productId:id}}),
            tx.stockMovement.count({where:{productId:id}}),
            tx.opticalOrderItem.count({where:{productId:id}}),
            tx.quoteItem.count({where:{productId:id}}),
            tx.saleItem.count({where:{productId:id}}),
            tx.legacyRecord.count({where:{targetEntity:"Product",targetId:id}}),
          ]);
          const dependencies=[
            lots? "lotes de estoque":null,
            movements? "movimentações de estoque":null,
            orderItems? "pedidos":null,
            quoteItems? "orçamentos":null,
            saleItems? "vendas":null,
            legacyLinks? "vínculo de importação BeepStart":null,
            product.publishedOnSite? "publicação no site":null,
          ].filter(Boolean);
          if(dependencies.length){
            return {id,description:product.description,status:"blocked" as const,reason:"Exclusão definitiva bloqueada: existem "+dependencies.join(", ")+". Use Arquivar para preservar o histórico."};
          }
          await writeAudit(tx,{action:"DELETE",entity:"Product",entityId:id,userId:actor.id,metadata:{code:product.code,description:product.description,bulk:true}});
          await tx.product.delete({where:{id}});
          return {id,description:product.description,status:"success" as const};
        });
        results.push(result);
      }catch(error){
        results.push({id,status:"blocked",reason:error instanceof Error?error.message:"Falha ao processar este produto."});
      }
    }
    const succeeded=results.filter(x=>x.status==="success").length;
    const blocked=results.filter(x=>x.status!=="success").length;
    return NextResponse.json({ok:blocked===0,action,requested:uniqueIds.length,succeeded,blocked,results});
  }catch(e){
    if(e instanceof z.ZodError)return NextResponse.json({error:"Selecione pelo menos um produto e informe uma ação válida."},{status:422});
    return apiError(e,"Não foi possível processar a seleção de produtos.");
  }
}
