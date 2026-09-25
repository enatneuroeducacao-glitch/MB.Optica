import {NextResponse} from "next/server";
import {db} from "@/lib/db";

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const data=await db.customer.findUnique({
    where:{id},
    include:{
      addresses:true,
      prescriptions:{orderBy:{date:"desc"}},
      orders:{orderBy:{createdAt:"desc"},take:50},
      sales:{orderBy:{createdAt:"desc"},take:50}
    }
  });
  if(!data) return NextResponse.json({error:"Cliente não encontrado"},{status:404});
  return NextResponse.json(data);
}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const b=await req.json();
    const data=await db.customer.update({
      where:{id},
      data:{
        name:b.name!==undefined?String(b.name).trim():undefined,
        cpfCnpj:b.cpfCnpj,
        phone:b.phone,
        whatsapp:b.whatsapp,
        email:b.email,
        notes:b.notes
      }
    });
    return NextResponse.json(data);
  }catch(error){
    return NextResponse.json({error:"Não foi possível atualizar o cliente",detail:String(error)},{status:400});
  }
}

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    await db.customer.update({where:{id},data:{active:false}});
    return NextResponse.json({ok:true});
  }catch(error){
    return NextResponse.json({error:"Não foi possível arquivar o cliente",detail:String(error)},{status:400});
  }
}