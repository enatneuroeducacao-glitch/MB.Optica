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
    const customer=await db.customer.findUnique({where:{id:String(b.customerId),active:true}});
    if(!customer) throw new Error("Cliente não encontrado ou inativo");
    const dates=b.validUntil?new Date(b.validUntil):undefined;
    if(dates&&Number.isNaN(dates.getTime())) throw new Error("Validade da receita inválida");
    const prescriptionValues:{[key:string]:number|undefined}={};
    for(const field of ["odSphere","odCylinder","odAxis","odAdd","odPrism","odDnp","odHeight","oeSphere","oeCylinder","oeAxis","oeAdd","oePrism","oeDnp","oeHeight","pdTotal"]){
      if(b[field]===undefined||b[field]===null||b[field]==="") prescriptionValues[field]=undefined;
      else {
        const value=Number(b[field]);
        if(!Number.isFinite(value)) throw new Error("Valor inválido na receita: "+field);
        prescriptionValues[field]=value;
      }
    }
    const data=await db.prescription.create({
      data:{
        customerId:b.customerId,
        professional:b.professional||undefined,
        odSphere:prescriptionValues.odSphere,
        odCylinder:prescriptionValues.odCylinder,
        odAxis:prescriptionValues.odAxis,
        odAdd:prescriptionValues.odAdd,
        odDnp:prescriptionValues.odDnp,
        odHeight:prescriptionValues.odHeight,
        oeSphere:prescriptionValues.oeSphere,
        oeCylinder:prescriptionValues.oeCylinder,
        oeAxis:prescriptionValues.oeAxis,
        oeAdd:prescriptionValues.oeAdd,
        oeDnp:prescriptionValues.oeDnp,
        oeHeight:prescriptionValues.oeHeight,
        pdTotal:prescriptionValues.pdTotal,
        notes:b.notes||undefined,
        originalText:b.originalText||undefined,
        validUntil:dates
      }
    });
    return NextResponse.json(data,{status:201});
  }catch(error){
    return NextResponse.json({error:"Receita inválida",detail:String(error)},{status:400});
  }
}