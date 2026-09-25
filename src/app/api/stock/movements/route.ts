import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";

export async function GET(){
 try{
  await requireRole(["ADMIN","GERENTE","VENDEDOR","LABORATORIO"]);
  const movements=await db.stockMovement.findMany({
   include:{product:true,lotLinks:{include:{lot:true}}},
   orderBy:{createdAt:"desc"},
   take:100
  });
  return NextResponse.json(movements);
 }catch(error){
  return NextResponse.json({error:error instanceof Error?error.message:"Não foi possível carregar as movimentações."},{status:400});
 }
}
