import {NextResponse} from "next/server";
import {db} from "@/lib/db";

export async function GET(){
  const started=Date.now();
  try{
    await db.$queryRaw`SELECT 1`;
    const [users,settings]=await Promise.all([db.user.count(),db.storeSettings.count()]);
    return NextResponse.json({ok:true,service:"mb-optica",version:"0.3.0",database:"up",timestamp:new Date().toISOString(),latencyMs:Date.now()-started,checks:{database:"up",schema:"up",usersTable:"up",storeSettingsTable:"up"},bootstrap:{initialized:users>0,settings:settings>0}});
  }catch(error){
    return NextResponse.json({ok:false,service:"mb-optica",version:"0.3.0",database:"down",timestamp:new Date().toISOString(),latencyMs:Date.now()-started,checks:{database:"down",schema:"unknown"},detail:process.env.NODE_ENV==="development"?String(error):undefined},{status:503});
  }
}