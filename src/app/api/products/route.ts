import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {writeAudit} from "@/lib/audit";

export async function GET(){
  const data=await db.product.findMany({
    where:{active:true},
    include:{category:true,supplier:true,lots:true},
    orderBy:{description:"asc"},
    take:200
  });
  return NextResponse.json(data);
}

export async function POST(req:Request){
  try{
    const b=await req.json();
    const code=String(b.code||"").trim();
    const description=String(b.description||"").trim();
    if(!code||!description) throw new Error("Código e descrição são obrigatórios");
    const cost=Number(b.cost??0);
    const salePrice=Number(b.salePrice??0);
    const minimumStock=Number(b.minimumStock??0);
    if(!Number.isFinite(cost)||cost<0||!Number.isFinite(salePrice)||salePrice<0||!Number.isFinite(minimumStock)||minimumStock<0) throw new Error("Valores financeiros ou estoque inválidos");
    const categoryId=b.categoryId?String(b.categoryId):undefined;
    const supplierId=b.supplierId?String(b.supplierId):undefined;
    if(categoryId){
      const category=await db.category.findUnique({where:{id:categoryId,active:true}});
      if(!category) throw new Error("Categoria não encontrada ou inativa");
    }
    if(supplierId){
      const supplier=await db.supplier.findUnique({where:{id:supplierId,active:true}});
      if(!supplier) throw new Error("Fornecedor não encontrado ou inativo");
    }

    const product=await db.$transaction(async tx=>{
      const created=await tx.product.create({
      data:{
        code,
        barcode:b.barcode?String(b.barcode).trim():undefined,
        description,
        unit:b.unit?String(b.unit).trim():"UN",
        cost,
        salePrice,
        minimumStock,
        categoryId,
        supplierId
      }
    });

      await writeAudit(tx,{action:"CREATE",entity:"Product",entityId:created.id,metadata:{code:created.code,description:created.description,salePrice:created.salePrice.toString()}});
      return created;
    });
    return NextResponse.json(product,{status:201});
  }catch(error){
    return NextResponse.json({error:"Produto inválido",detail:String(error)},{status:400});
  }
}