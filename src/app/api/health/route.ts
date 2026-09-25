import {NextResponse} from "next/server";
import {db} from "@/lib/db";

export async function GET(){
  try{
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ok:true,service:"mb-optica",version:"0.2.0",database:"up",timestamp:new Date().toISOString(),checks:{database:"up"}});
  }catch(error){
    return NextResponse.json({ok:false,service:"mb-optica",version:"0.1.0",database:"down",timestamp:new Date().toISOString(),checks:{database:"down"},detail:String(error)},{status:503});
  }
}
