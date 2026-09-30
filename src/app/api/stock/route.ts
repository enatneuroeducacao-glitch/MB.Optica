import {NextResponse} from "next/server";
import {db} from "@/lib/db";

export async function GET(){
  const products=await db.product.findMany({
    where:{active:true},
    include:{lots:{where:{archived:false}}},
    orderBy:{description:"asc"}
  });

  const result=products.map(product=>{
    const stock=product.lots.reduce((sum,lot)=>sum+Number(lot.quantity),0);
    const minimumStock=Number(product.minimumStock);
    return {id:product.id,code:product.code,barcode:product.barcode,description:product.description,unit:product.unit,cost:Number(product.cost),minimumStock,stockControlled:product.stockControlled,stock,critical:product.stockControlled&&stock<=minimumStock};
  });

  return NextResponse.json(result);
}