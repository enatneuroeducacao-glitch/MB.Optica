import {NextResponse} from "next/server";
import {db} from "@/lib/db";

export async function GET(){
  const products=await db.product.findMany({
    where:{active:true},
    include:{lots:true},
    orderBy:{description:"asc"}
  });

  const result=products.map((product:any)=>{
    const stock=product.lots.reduce((sum:number,lot:any)=>{
      return sum+(lot.archived?0:Number(lot.quantity||0));
    },0);

    return {
      id:product.id,
      code:product.code,
      barcode:product.barcode,
      description:product.description,
      unit:product.unit,
      minimumStock:product.minimumStock,
      stock,
      critical:stock<=Number(product.minimumStock||0)
    };
  });

  return NextResponse.json(result);
}