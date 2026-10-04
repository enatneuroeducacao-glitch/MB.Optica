import {NextResponse} from "next/server";
import {requireRole} from "@/lib/auth";
import {apiError} from "@/lib/api-error";

const SITE_URL=()=>String(process.env.MB_SITE_SUPABASE_URL||"").replace(/\/$/,"");
const SITE_KEY=()=>String(process.env.MB_SITE_SUPABASE_SERVICE_ROLE_KEY||"");

export async function GET(){
  try{
    await requireRole(["ADMIN","GERENTE"]);
    if(!SITE_URL()||!SITE_KEY())return NextResponse.json({configured:false,error:"A integração com o site ainda não está configurada no Render."},{status:503});
    const key=SITE_KEY();
    const r=await fetch(SITE_URL()+"/rest/v1/collections?select=id,name,slug,active,sort_order&active=eq.true&order=sort_order",{headers:{apikey:key,Authorization:"Bearer "+key},cache:"no-store"});
    const data=await r.json().catch(()=>[]);
    if(!r.ok)throw new Error(data?.message||"Não foi possível carregar as coleções do site.");
    return NextResponse.json({configured:true,collections:Array.isArray(data)?data:[]});
  }catch(e){return apiError(e,"Não foi possível carregar as coleções do site.");}
}
