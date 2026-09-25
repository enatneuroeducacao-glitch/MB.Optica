import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {apiError} from "@/lib/api-error";

export async function POST(){
 try{
  await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
  let lastError:unknown;
  for(let attempt=0;attempt<2;attempt++){
   try{
    const row=await db.serviceOrderSequence.upsert({
     where:{id:"default"},
     create:{id:"default",nextNumber:2},
     update:{nextNumber:{increment:1}}
    });
    return NextResponse.json({number:row.nextNumber-1,display:`OS-${String(row.nextNumber-1).padStart(6,"0")}`});
   }catch(error){
    lastError=error;
    if(attempt===0)await new Promise(resolve=>setTimeout(resolve,50));
   }
  }
  throw lastError;
 }catch(error){
  return apiError(error,"Não foi possível gerar o número da O.S.");
 }
}
