import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";
type P=Record<string,any>;
const text=(v:any)=>v==null?"":String(v).trim();
const num=(v:any)=>{const n=Number(String(v??"").replace(",","."));return Number.isFinite(n)?n:0};
const first=(p:P,keys:string[])=>{for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&String(v).trim()!=="")return v}return ""};
const stockFromObject=(value:any):number=>{
 const keys=["estoqueAtual","saldoEstoque","quantidadeEstoque","qtdEstoque","quantidadeDisponivel","saldo","quantidade","quantity","qtd","stock","currentStock","availableStock","estoque","saldoAtual","saldoQuantidade"];
 if(value==null)return 0;
 if(Array.isArray(value)){
  let total=0;
  for(const item of value){const n=stockFromObject(item);if(n>0)total+=n}
  return total;
 }
 if(typeof value!=="object")return 0;
 for(const k of keys){
  const v=value[k];
  if(v!==undefined&&v!==null&&!Array.isArray(v)){
   const n=num(v);
   if(n>0)return n;
  }
 }
 for(const [k,v] of Object.entries(value)){
  if(keys.includes(k))continue;
  if(v&&typeof v==="object"){
   const n=stockFromObject(v);
   if(n>0)return n;
  }
 }
 return 0;
};
const mapProduct=(row:any)=>{const p=(row.payload||{}) as P;const code=text(first(p,["codigo","code","codigoProduto","referencia","ref","sku"]));const barcode=text(first(p,["codigoBarras","barcode","ean","ean13","gtin"]));const description=text(first(p,["descricao","description","nome","name","produto","produtoNome"]))||"Produto BeepStart";const brand=text(first(p,["marca","brand","fabricante"]));const model=text(first(p,["modelo","model","referenciaModelo","refModelo"]));const category=text(first(p,["categoria","category","categoriaNome"]));const supplier=text(first(p,["fornecedor","supplier","fornecedorNome"]));const cost=num(first(p,["custo","cost","precoCusto","valorCusto"]));const salePrice=num(first(p,["precoVenda","preco","valorVenda","salePrice","preco_venda"]));const stock=stockFromObject(p);const minimumStock=num(first(p,["estoqueMinimo","minimumStock","minimo"]));return {id:row.id,legacyId:row.legacyId,code:code||("BS-"+text(row.legacyId||row.id).slice(-20)),barcode,description,brand,model,category,supplier,cost,salePrice,stock,minimumStock};};
export async function GET(){try{await requireRole(["ADMIN","GERENTE"]);const rows=await db.legacyRecord.findMany({where:{source:"BEEPSTART",collectionKey:{contains:"produt",mode:"insensitive"}},select:{id:true,legacyId:true,payload:true,status:true,targetEntity:true,targetId:true},orderBy:{importedAt:"desc"},take:10000});const products=rows.map((row:any)=>({...mapProduct(row),alreadyIntegrated:row.status==="IMPORTED_SELECTIVELY"||row.targetEntity==="Product"||Boolean(row.targetId)})).filter(p=>p.stock>0);const codes=products.map(p=>p.code).filter(Boolean);const barcodes=products.map(p=>p.barcode).filter(Boolean);const existing=await db.product.findMany({where:{OR:[...(codes.length?[{code:{in:codes}}]:[]),...(barcodes.length?[{barcode:{in:barcodes}}]:[])]},select:{id:true,code:true,barcode:true}});const existingCodes=new Set(existing.map((p:any)=>p.code).filter(Boolean));const existingBarcodes=new Set(existing.map((p:any)=>p.barcode).filter(Boolean));const enriched=products.map(p=>({...p,alreadyIntegrated:p.alreadyIntegrated||existingCodes.has(p.code)||(p.barcode?existingBarcodes.has(p.barcode):false)}));return NextResponse.json({ok:true,total:enriched.length,products:enriched});}catch(e){return apiError(e,"Não foi possível carregar os produtos do estoque BeepStart.");}}
export async function POST(req:Request){try{const actor=await requireRole(["ADMIN","GERENTE"]);const body=await req.json();const ids=Array.isArray(body?.legacyRecordIds)?body.legacyRecordIds.map(String).filter(Boolean):[];if(!ids.length)return NextResponse.json({ok:false,error:"Selecione ao menos um produto."},{status:400});const rows=await db.legacyRecord.findMany({where:{id:{in:ids},source:"BEEPSTART",collectionKey:{contains:"produt",mode:"insensitive"}},select:{id:true,legacyId:true,payload:true}});const imported:any[]=[],skipped:any[]=[],errors:any[]=[];for(const row of rows){const p=mapProduct(row);if(p.stock<=0){skipped.push({id:row.id,reason:"Sem estoque disponível"});continue}try{const result=await db.$transaction(async tx=>{const existing=await tx.product.findFirst({where:{OR:[{code:p.code},...(p.barcode?[{barcode:p.barcode}]:[])]},select:{id:true,code:true,barcode:true}});if(existing)return {kind:"skip",reason:"Produto já cadastrado",product:existing};let categoryId:string|undefined;if(p.category){categoryId=(await tx.category.upsert({where:{name:p.category.slice(0,120)},update:{active:true},create:{name:p.category.slice(0,120)},select:{id:true}})).id}let supplierId:string|undefined;if(p.supplier){const s=await tx.supplier.findFirst({where:{name:{equals:p.supplier.slice(0,120),mode:"insensitive"}},select:{id:true}});supplierId=s?.id||(await tx.supplier.create({data:{name:p.supplier.slice(0,120)},select:{id:true}})).id}const product=await tx.product.create({data:{code:p.code.slice(0,60),barcode:p.barcode||undefined,description:p.description.slice(0,200),brand:p.brand||undefined,model:p.model||undefined,categoryId,supplierId,cost:p.cost,salePrice:p.salePrice,minimumStock:p.minimumStock,unit:"UN"}});const lot=await tx.stockLot.create({data:{productId:product.id,code:"BEEPSTART:"+String(p.legacyId||row.id),description:"Estoque integrado do BeepStart",quantity:p.stock,cost:p.cost||undefined}});const movement=await tx.stockMovement.create({data:{productId:product.id,type:"ENTRADA",quantity:p.stock,unitCost:p.cost||undefined,reference:"BEEPSTART_IMPORT",referenceId:String(p.legacyId||row.id),notes:"Integração seletiva: somente produto com estoque disponível."}});await tx.stockMovementLot.create({data:{movementId:movement.id,lotId:lot.id,quantity:p.stock}});await tx.legacyRecord.update({where:{id:row.id},data:{targetEntity:"Product",targetId:product.id,status:"IMPORTED_SELECTIVELY"}});await writeAudit(tx,{action:"LEGACY_SELECTIVE_IMPORT",entity:"Product",entityId:product.id,userId:actor.id,metadata:{source:"BEEPSTART",legacyRecordId:row.id,legacyId:row.legacyId,stock:p.stock}});return {kind:"import",product}});if(result.kind==="skip")skipped.push({id:row.id,reason:result.reason,product:result.product});else imported.push(result.product)}catch(e){errors.push({id:row.id,error:e instanceof Error?e.message:"Erro ao integrar produto"})}}return NextResponse.json({ok:true,importedCount:imported.length,skippedCount:skipped.length,errorCount:errors.length,imported,skipped,errors,message:imported.length+" produto(s) integrado(s) com estoque. "+skipped.length+" ignorado(s) e "+errors.length+" erro(s)."})}catch(e){return apiError(e,"Não foi possível integrar os produtos selecionados.")}}