import {NextResponse} from "next/server";
import {db} from "@/lib/db";

export async function GET(){
  const rows=await db.pixKey.findMany({where:{active:true},orderBy:{createdAt:"asc"}});
  return NextResponse.json(rows);
}

export async function POST(req:Request){
  try{
    const b=await req.json();
    const type=String(b.type||"ALEATORIA").trim();
    const key=String(b.key||"").trim();
    const holderName=String(b.holderName||"").trim();
    if(!key||!holderName) throw new Error("Chave PIX e nome do titular são obrigatórios");
    const row=await db.pixKey.create({data:{
      type,key,holderName,
      holderDocument:b.holderDocument?String(b.holderDocument).trim():undefined,
      city:b.city?String(b.city).trim().toUpperCase().slice(0,15):undefined,
      active:true
    }});
    return NextResponse.json(row,{status:201});
  }catch(error){
    return NextResponse.json({error:"Não foi possível cadastrar a chave PIX",detail:String(error)},{status:400});
  }
}

export async function DELETE(req:Request){
  try{
    const id=new URL(req.url).searchParams.get("id");
    if(!id) throw new Error("ID obrigatório");
    await db.pixKey.update({where:{id},data:{active:false}});
    return NextResponse.json({ok:true});
  }catch(error){
    return NextResponse.json({error:"Não foi possível desativar a chave PIX",detail:String(error)},{status:400});
  }
}