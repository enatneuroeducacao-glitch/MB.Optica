import {NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";

const schema=z.object({messageId:z.string().min(1),action:z.enum(["read","unread","archive","unarchive","delete","restore"])}); 

export async function POST(req:Request){
  try{
    const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR","FINANCEIRO","LABORATORIO"]);
    const body=schema.parse(await req.json());
    let data:any={};
    if(body.action==="read")data={read:true};
    if(body.action==="unread")data={read:false};
    if(body.action==="archive")data={archived:true,deleted:false};
    if(body.action==="unarchive")data={archived:false,deleted:false};
    if(body.action==="delete")data={deleted:true};
    if(body.action==="restore")data={deleted:false,archived:false};

    const state=await db.mailMessageState.upsert({
      where:{userId_messageId:{userId:actor.id,messageId:body.messageId}},
      create:{userId:actor.id,messageId:body.messageId,...data},
      update:data
    });
    return NextResponse.json({ok:true,state});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Ação inválida."},{status:422});
    return NextResponse.json({error:String(error)},{status:401});
  }
}
