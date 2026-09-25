import {NextResponse} from "next/server";
import {db} from "@/lib/db";

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
    if(!b.code||!b.description) throw new Error("Código e descrição são obrigatórios");

    const product=await db.product.create({
      data:{
        code:String(b.code).trim(),
        barcode:b.barcode||undefined,
        description:String(b.description).trim(),
        unit:b.unit||"UN",
        cost:Number(b.cost||0),
        salePrice:Number(b.salePrice||0),
        minimumStock:Number(b.minimumStock||0),
        categoryId:b.categoryId||undefined,
        supplierId:b.supplierId||undefined
      }
    });

    return NextResponse.json(product,{status:201});
  }catch(error){
    return NextResponse.json({error:"Produto inválido",detail:String(error)},{status:400});
  }
}