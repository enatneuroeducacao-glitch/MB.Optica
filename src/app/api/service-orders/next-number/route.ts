import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";

export async function POST(){
  try{
    await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
    const sequence=await db.$transaction(async(tx)=>{
      const current=await tx.serviceOrderSequence.findUnique({where:{id:"MANUAL_OS"}});
      if(!current){
        await tx.serviceOrderSequence.create({data:{id:"MANUAL_OS",nextNumber:2}});
        return 1;
      }
      const updated=await tx.serviceOrderSequence.update({
        where:{id:"MANUAL_OS"},
        data:{nextNumber:{increment:1}}
      });
      return updated.nextNumber-1;
    });
    return NextResponse.json({number:sequence,formatted:String(sequence).padStart(6,"0")});
  }catch(error){
    return NextResponse.json({error:"Não foi possível gerar o número da O.S. manual",detail:String(error)},{status:400});
  }
}
