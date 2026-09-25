import {NextResponse} from "next/server";
import {db} from "@/lib/db";

export async function GET(){
  const data=await db.customer.findMany({
    where:{active:true},
    orderBy:{name:"asc"},
    take:100
  });
  return NextResponse.json(data);
}

export async function POST(req:Request){
  try{
    const b=await req.json();
    if(!b.name||String(b.name).trim().length<2) throw new Error("Nome obrigatório");
    const cpfCnpj=b.cpfCnpj?String(b.cpfCnpj).trim():undefined;
    const email=b.email?String(b.email).trim():undefined;
    const data=await db.customer.create({
      data:{
        name:String(b.name).trim(),
        cpfCnpj:cpfCnpj||undefined,
        phone:b.phone?String(b.phone).trim():undefined,
        whatsapp:b.whatsapp?String(b.whatsapp).trim():undefined,
        email:email||undefined,
        notes:b.notes?String(b.notes).trim():undefined
      }
    });
    return NextResponse.json(data,{status:201});
  }catch(error){
    return NextResponse.json({error:"Não foi possível criar o cliente",detail:String(error)},{status:400});
  }
}