import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";

type P=Record<string,any>;
const text=(v:any)=>v==null?"":String(v).trim();
const num=(v:any)=>{const n=Number(String(v??"").replace(",","."));return Number.isFinite(n)?n:0};
const first=(p:P,keys:string[])=>{for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&String(v).trim()!=="")return v}return ""};
const stockFromObject=(p:P):number=>{
 const keys=["estoqueAtual","saldoEstoque","quantidadeEstoque","qtdEstoque","quantidadeDisponivel","saldo","quantidade","quantity","qtd","stock","currentStock","availableStock"];
 for(const k of keys){if(p[k]!==undefined&&p[k]!==null&&!Array.isArray(p[k])){const n=num(p[k]);if(n>0)return n}}
 for(const v of Object.values(p)){if(v&&typeof v==="object"&&!Array.isArray(v)){const n=stockFromObject(v as P);if(n>0)return n}}
 return 0;
};
const mapProduct=(row:any,stockOverride?:number)=>{
 const p=(row.payload||{}) as P;
 const code=text(first(p,["codigo","code","codigoProduto","referencia","ref","sku"]));
 const barcode=text(first(p,["codigoBarras","barcode","ean","ean13","gtin"]));
 const description=text(first(p,["descricao","description","nome","name","produto","produtoNome"]))||"Produto BeepStart";
 const brand=text(first(p,["marca","brand","fabricante"]));
 const model=text(first(p,["modelo","model","referenciaModelo","refModelo"]));
 const category=text(first(p,["categoria","category","categoriaNome"]));
 const supplier=text(first(p,["fornecedor","supplier","fornecedorNome"]));
 const cost=num(first(p,["custo","cost","precoCusto","valorCusto"]));
 const salePrice=num(first(p,["precoVenda","preco","valorVenda","salePrice","preco_venda"]));
 const stock=stockOverride!==undefined?stockOverride:stockFromObject(p);
 const minimumStock=num(first(p,["estoqueMinimo","minimumStock","minimo"]));
 return {code:code||("BS-"+text(row.legacyId||row.id).slice(-20)),barcode,description,brand,model,category,supplier,cost,salePrice,stock,minimumStock};
};

const lotStockByProduct=(lots:any[])=>{
 const totals=new Map<string,number>();
 for(const lot of lots){
  const p=(lot.payload||{}) as P;
  const produtoID=text(first(p,["produtoID","productId","produtoId"]));
  if(!produtoID||p.archived===true)continue;
  const quantity=num(first(p,["quantidade","quantity","qtd"]));
  totals.set(produtoID,(totals.get(produtoID)||0)+quantity);
 }
 return totals;
};

export async function POST(req:Request){
 try{
  const actor=await requireRole(["ADMIN","GERENTE"]);
  const body=await req.json().catch(()=>({}));
  const requestedIds=Array.isArray(body?.legacyRecordIds)?body.legacyRecordIds.map(String).filter(Boolean):null;
  const rows=await db.legacyRecord.findMany({
   where:{
    source:"BEEPSTART",
    ...(requestedIds?.length
      ? {id:{in:requestedIds}}
      : {OR:[
          {targetEntity:"Product"},
          {status:"IMPORTED_SELECTIVELY"},
          {targetId:{not:null}}
        ]}
    )
   },
   select:{id:true,legacyId:true,payload:true,status:true,targetEntity:true,targetId:true,collectionKey:true},
   orderBy:{importedAt:"desc"},
   take:5000
  });
  const lots=await db.legacyRecord.findMany({where:{source:"BEEPSTART",collectionKey:{equals:"Lote",mode:"insensitive"}},select:{payload:true},take:100000});
  const lotStock=lotStockByProduct(lots);

  const result={alreadyConsistent:0,relinked:0,repaired:0,skippedNoStock:0,errors:[] as any[],products:[] as any[],diagnostic:{candidates:rows.length,productTargets:rows.filter((r:any)=>r.targetEntity==="Product").length,withTargetId:rows.filter((r:any)=>Boolean(r.targetId)).length,selectivelyImported:rows.filter((r:any)=>r.status==="IMPORTED_SELECTIVELY").length}};

  for(const row of rows){
   try{
    const legacyId=String(row.legacyId||"");
    const p=mapProduct(row,lotStock.has(legacyId)?lotStock.get(legacyId):undefined);

    if(row.targetId){
     const target=await db.product.findUnique({where:{id:row.targetId},select:{id:true,code:true,barcode:true,active:true}});
     if(target){
      if(row.status!=="IMPORTED_SELECTIVELY"||row.targetEntity!=="Product"){
       await db.legacyRecord.update({where:{id:row.id},data:{targetEntity:"Product",targetId:target.id,status:"IMPORTED_SELECTIVELY"}});
       result.relinked++;
      }else result.alreadyConsistent++;
      result.products.push({legacyRecordId:row.id,productId:target.id,action:"consistent"});
      continue;
     }
    }

    const existing=await db.product.findFirst({
     where:{OR:[{code:p.code},...(p.barcode?[{barcode:p.barcode}]:[])]},
     select:{id:true,code:true,barcode:true}
    });

    if(existing){
     await db.legacyRecord.update({where:{id:row.id},data:{targetEntity:"Product",targetId:existing.id,status:"IMPORTED_SELECTIVELY"}});
     result.relinked++;
     result.products.push({legacyRecordId:row.id,productId:existing.id,action:"relinked"});
     continue;
    }

    if(p.stock<=0){
     result.skippedNoStock++;
     continue;
    }

    const created=await db.$transaction(async tx=>{
     let categoryId:string|undefined;
     if(p.category){
      categoryId=(await tx.category.upsert({
       where:{name:p.category.slice(0,120)},
       update:{active:true},
       create:{name:p.category.slice(0,120)},
       select:{id:true}
      })).id;
     }

     let supplierId:string|undefined;
     if(p.supplier){
      const s=await tx.supplier.findFirst({where:{name:{equals:p.supplier.slice(0,120),mode:"insensitive"}},select:{id:true}});
      supplierId=s?.id||(await tx.supplier.create({data:{name:p.supplier.slice(0,120)},select:{id:true}})).id;
     }

     const product=await tx.product.create({
      data:{
       code:p.code.slice(0,60),
       barcode:p.barcode||undefined,
       description:p.description.slice(0,200),
       brand:p.brand||undefined,
       model:p.model||undefined,
       categoryId,
       supplierId,
       cost:p.cost,
       salePrice:p.salePrice,
       minimumStock:p.minimumStock,
       unit:"UN"
      }
     });

     const lot=await tx.stockLot.create({
      data:{
       productId:product.id,
       code:"BEEPSTART:"+String(row.legacyId||row.id),
       description:"Estoque reconciliado do BeepStart",
       quantity:p.stock,
       cost:p.cost||undefined
      }
     });

     const movement=await tx.stockMovement.create({
      data:{
       productId:product.id,
       type:"ENTRADA",
       quantity:p.stock,
       unitCost:p.cost||undefined,
       reference:"BEEPSTART_RECONCILIATION",
       referenceId:String(row.legacyId||row.id),
       notes:"Reconciliação: produto preservado no legado e recriado no catálogo MB Óptica."
      }
     });

     await tx.stockMovementLot.create({data:{movementId:movement.id,lotId:lot.id,quantity:p.stock}});
     await tx.legacyRecord.update({where:{id:row.id},data:{targetEntity:"Product",targetId:product.id,status:"IMPORTED_SELECTIVELY"}});
     await writeAudit(tx,{action:"LEGACY_PRODUCT_RECONCILIATION",entity:"Product",entityId:product.id,userId:actor.id,metadata:{source:"BEEPSTART",legacyRecordId:row.id,legacyId:row.legacyId,stock:p.stock}});
     return product;
    });

    result.repaired++;
    result.products.push({legacyRecordId:row.id,productId:created.id,action:"repaired",code:created.code});
   }catch(e){
    result.errors.push({legacyRecordId:row.id,error:e instanceof Error?e.message:"Erro ao reconciliar produto"});
   }
  }

  const message=rows.length
   ? "Reconciliação concluída: "+result.repaired+" recriado(s), "+result.relinked+" vínculo(s) corrigido(s), "+result.alreadyConsistent+" já consistente(s), "+result.skippedNoStock+" sem estoque e "+result.errors.length+" erro(s)."
   : "Nenhum produto marcado como integrado foi encontrado para reconciliar.";
  return NextResponse.json({ok:true,...result,message});
 }catch(e){
  return apiError(e,"Não foi possível reconciliar os produtos integrados do BeepStart.");
 }
}
