import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";

export async function POST(req:Request){
  try{
    await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
    const body=await req.json().catch(()=>({}));
    const quantity=Math.floor(Number(body?.quantity??1));
    if(!Number.isInteger(quantity)||quantity<1||quantity>100){
      return NextResponse.json({error:"A quantidade deve estar entre 1 e 100 O.S."},{status:400});
    }
    const result=await db.$transaction(async(tx)=>{
      const current=await tx.serviceOrderSequence.findUnique({where:{id:"MANUAL_OS"}});
      const start=current?.nextNumber??1;
      if(!current){
        await tx.serviceOrderSequence.create({data:{id:"MANUAL_OS",nextNumber:start+quantity}});
      }else{
        await tx.serviceOrderSequence.update({
          where:{id:"MANUAL_OS"},
          data:{nextNumber:{increment:quantity}}
        });
      }
      const numbers=Array.from({length:quantity},(_,index)=>start+index);
      return {numbers,start,end:start+quantity-1};
    });
    return NextResponse.json({number:result.start,formatted:String(result.start).padStart(6,"0"),numbers:result.numbers});
  }catch(error){
    return NextResponse.json({error:"Não foi possível gerar a numeração das O.S. manuais",detail:String(error)},{status:400});
  }
}
