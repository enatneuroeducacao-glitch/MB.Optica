import {NextResponse} from "next/server";
import {db} from "@/lib/db";

export async function GET(req:Request){
  const customerId=new URL(req.url).searchParams.get("customerId")||undefined;
  const data=await db.prescription.findMany({
    where:customerId?{customerId}:undefined,
    orderBy:{date:"desc"},
    take:100
  });
  return NextResponse.json(data);
}

export async function POST(req:Request){
  try{
    const b=await req.json();
    if(!b.customerId) throw new Error("customerId é obrigatório");
    const data=await db.prescription.create({
      data:{
        customerId:b.customerId,
        professional:b.professional||undefined,
        odSphere:b.odSphere,
        odCylinder:b.odCylinder,
        odAxis:b.odAxis,
        odAdd:b.odAdd,
        odDnp:b.odDnp,
        odHeight:b.odHeight,
        oeSphere:b.oeSphere,
        oeCylinder:b.oeCylinder,
        oeAxis:b.oeAxis,
        oeAdd:b.oeAdd,
        oeDnp:b.oeDnp,
        oeHeight:b.oeHeight,
        pdTotal:b.pdTotal,
        notes:b.notes||undefined,
        originalText:b.originalText||undefined,
        validUntil:b.validUntil?new Date(b.validUntil):undefined
      }
    });
    return NextResponse.json(data,{status:201});
  }catch(error){
    return NextResponse.json({error:"Receita inválida",detail:String(error)},{status:400});
  }
}