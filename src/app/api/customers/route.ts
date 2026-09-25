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
    const data=await db.customer.create({
      data:{
        name:String(b.name).trim(),
        cpfCnpj:b.cpfCnpj||undefined,
        phone:b.phone||undefined,
        whatsapp:b.whatsapp||undefined,
        email:b.email||undefined,
        notes:b.notes||undefined
      }
    });
    return NextResponse.json(data,{status:201});
  }catch(error){
    return NextResponse.json({error:"Não foi possível criar o cliente",detail:String(error)},{status:400});
  }
}