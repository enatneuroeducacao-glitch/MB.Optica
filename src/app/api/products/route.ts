import {NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";

const schema=z.object({
 code:z.string().trim().max(60).optional(),barcode:z.string().trim().max(60).nullable().optional(),initialStock:z.coerce.number().min(0).optional(),description:z.string().trim().min(2).max(200),brand:z.string().trim().max(80).nullable().optional(),model:z.string().trim().max(120).nullable().optional(),color:z.string().trim().max(80).nullable().optional(),frameSize:z.string().trim().max(30).nullable().optional(),lensWidth:z.coerce.number().int().min(0).max(200).nullable().optional(),bridgeWidth:z.coerce.number().int().min(0).max(200).nullable().optional(),templeLength:z.coerce.number().int().min(0).max(250).nullable().optional(),material:z.string().trim().max(80).nullable().optional(),frameShape:z.string().trim().max(80).nullable().optional(),photoData:z.string().max(1500000).nullable().optional(),
 unit:z.string().trim().min(1).max(20).optional(),cost:z.coerce.number().min(0),salePrice:z.coerce.number().min(0),minimumStock:z.coerce.number().min(0),stockControlled:z.boolean().optional(),
 categoryId:z.string().nullable().optional(),supplierId:z.string().nullable().optional(),ncm:z.string().max(20).nullable().optional(),
 cest:z.string().max(20).nullable().optional(),cfop:z.string().max(10).nullable().optional(),origin:z.string().max(10).nullable().optional(),
 taxCode:z.string().max(30).nullable().optional()
});
export async function GET(){
 try{
  await requireRole(["ADMIN","GERENTE","VENDEDOR","LABORATORIO"]);
  const products=await db.product.findMany({where:{active:true},include:{category:true,supplier:true,lots:{where:{archived:false},orderBy:{receivedAt:"asc"}}},orderBy:{description:"asc"},take:500});
  const ids=products.map(p=>p.id);
  let legacyByProduct=new Map<string,any>();
  if(ids.length){
   try{
    const legacyLinks=await db.legacyRecord.findMany({where:{targetEntity:"Product",targetId:{in:ids}},select:{targetId:true,status:true,legacyId:true},orderBy:{importedAt:"desc"}});
    legacyLinks.forEach((x:any)=>{if(x.targetId&&!legacyByProduct.has(x.targetId))legacyByProduct.set(x.targetId,x)});
   }catch(error){
    console.error("Falha ao carregar vínculos BeepStart dos produtos:",error);
   }
  }
  return NextResponse.json(products.map(p=>{const stock=p.lots.reduce((sum,l)=>sum+Number(l.quantity),0);return {...p,stock,lowStock:p.stockControlled&&stock<=Number(p.minimumStock),integratedFromBeepStart:legacyByProduct.has(p.id),legacyIntegration:legacyByProduct.get(p.id)||null};}));
 }catch(e){return apiError(e,"Não foi possível carregar os produtos.");}
}
export async function POST(req:Request){
 try{
  const actor=await requireRole(["ADMIN","GERENTE"]);
  const b=schema.parse(await req.json());
  const product=await db.$transaction(async tx=>{
   if(b.categoryId){
    const category=await tx.category.findUnique({where:{id:b.categoryId,active:true}});
    if(!category) throw new Error("CATEGORY_NOT_FOUND");
   }
   if(b.supplierId){
    const supplier=await tx.supplier.findUnique({where:{id:b.supplierId,active:true}});
    if(!supplier) throw new Error("SUPPLIER_NOT_FOUND");
   }

   let code=b.code?.trim();
   if(!code){
    let n=1;
    const last=await tx.product.findFirst({
     where:{code:{startsWith:"P-"}},
     orderBy:{code:"desc"},
     select:{code:true}
    });
    if(last?.code){
     const match=last.code.match(/P-(\d+)$/);
     if(match) n=Number(match[1])+1;
    }
    code="P-"+String(n).padStart(6,"0");
    while(await tx.product.findUnique({where:{code}})){
     code="P-"+String(++n).padStart(6,"0");
    }
   }

   let barcode=b.barcode?.trim()||"";
   if(!barcode){
    const base="20"+String(Date.now()%10000000000).padStart(10,"0");
    const digits=base.split("").map(Number);
    const sum=digits.reduce((total,digit,index)=>total+digit*(index%2===0?1:3),0);
    barcode=base+String((10-(sum%10))%10);
   }
   if(await tx.product.findUnique({where:{barcode}})){
    throw new Error("BARCODE_EXISTS");
   }

   const product=await tx.product.create({
    data:{
     code,
     barcode,
     description:b.description,
     brand:b.brand||undefined,
     model:b.model||undefined,
     color:b.color||undefined,
     frameSize:b.frameSize||undefined,
     lensWidth:b.lensWidth??undefined,
     bridgeWidth:b.bridgeWidth??undefined,
     templeLength:b.templeLength??undefined,
     material:b.material||undefined,
     frameShape:b.frameShape||undefined,
     unit:b.unit??"UN",
     cost:b.cost,
     salePrice:b.salePrice,
     minimumStock:b.minimumStock,
     stockControlled:b.stockControlled??true,
     categoryId:b.categoryId||undefined,
     supplierId:b.supplierId||undefined,
     ncm:b.ncm||undefined,
     cest:b.cest||undefined,
     cfop:b.cfop||undefined,
     origin:b.origin||undefined,
     taxCode:b.taxCode||undefined,
     photoData:b.photoData||undefined
    }
   });

   const initialStock=Number(b.initialStock??0);
   if(initialStock>0 && product.stockControlled){
    const lot=await tx.stockLot.create({
     data:{
      productId:product.id,
      description:product.description,
      quantity:initialStock,
      cost:Number(b.cost)
     }
    });
    const movement=await tx.stockMovement.create({
     data:{
      productId:product.id,
      type:"ENTRADA",
      quantity:initialStock,
      unitCost:Number(b.cost),
      reference:"CADASTRO_INICIAL",
      referenceId:lot.id,
      notes:"Estoque inicial no cadastro do produto"
     }
    });
    await tx.stockMovementLot.create({
     data:{
      movementId:movement.id,
      lotId:lot.id,
      quantity:initialStock
     }
    });
   }

   await writeAudit(tx,{
    action:"CREATE",
    entity:"Product",
    entityId:product.id,
    userId:actor.id,
    metadata:{
     code:product.code,
     barcode:product.barcode,
     description:product.description,
     initialStock
    }
   });

   return product;
  });

  return NextResponse.json(product,{status:201});
 }catch(e){
  if(e instanceof z.ZodError){
   return NextResponse.json({error:"Dados do produto inválidos."},{status:422});
  }
  if(e instanceof Error && (e.message==="CATEGORY_NOT_FOUND" || e.message==="SUPPLIER_NOT_FOUND")){
   return NextResponse.json({
    error:e.message==="CATEGORY_NOT_FOUND"?"Categoria não encontrada.":"Fornecedor não encontrado."
   },{status:404});
  }
  if(e instanceof Error && e.message==="BARCODE_EXISTS"){
   return NextResponse.json({error:"Código de barras já cadastrado."},{status:409});
  }
  return apiError(e,"Não foi possível criar o produto.");
 }
}
