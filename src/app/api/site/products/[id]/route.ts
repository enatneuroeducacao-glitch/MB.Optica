import {NextResponse} from "next/server";
import {requireRole} from "@/lib/auth";
import {db} from "@/lib/db";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";

const SITE_URL=()=>String(process.env.MB_SITE_SUPABASE_URL||"").replace(/\/$/,"");
const SITE_KEY=()=>String(process.env.MB_SITE_SUPABASE_SERVICE_ROLE_KEY||"");

function configError(){return !SITE_URL()||!SITE_KEY()?"A integração com o site ainda não está configurada no Render. Defina MB_SITE_SUPABASE_URL e MB_SITE_SUPABASE_SERVICE_ROLE_KEY.":null}
async function siteRequest(path:string,init:RequestInit={}) {
  const key=SITE_KEY();
  const headers=new Headers(init.headers);
  headers.set("apikey",key); headers.set("Authorization","Bearer "+key); headers.set("Content-Type","application/json");
  const r=await fetch(SITE_URL()+path,{...init,headers,cache:"no-store"});
  const text=await r.text();
  let data:any=null; try{data=text?JSON.parse(text):null}catch{}
  if(!r.ok) throw new Error(data?.message||data?.error_description||data?.error||("Site Supabase HTTP "+r.status));
  return data;
}
function slugify(value:string){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")}
function photoBytes(data:string){const m=String(data||"").match(/^data:(image\/[^;]+);base64,(.+)$/);if(!m)return null;return {contentType:m[1],bytes:Buffer.from(m[2],"base64")}}

async function publishProduct(product:any,stock:number){
  const config=configError(); if(config)throw new Error(config);
  const categorySlug=product.siteCollectionSlug||slugify(product.category?.name||"outros")||"outros";
  const collections=await siteRequest("/rest/v1/collections?select=id,name,slug&slug=eq."+encodeURIComponent(categorySlug)+"&limit=1");
  if(!collections?.length)throw new Error("Coleção do site não encontrada: "+categorySlug+". Crie a coleção na Central do site ou informe outro slug.");
  let imageUrl="";
  const existing=await siteRequest("/rest/v1/products?select=id,image_url&source_product_id=eq."+encodeURIComponent(product.id)+"&limit=1");
  imageUrl=existing?.[0]?.image_url||"";
  const photo=photoBytes(product.photoData||"");
  if(photo){
    const ext=photo.contentType.split("/")[1]?.replace("jpeg","jpg")||"jpg";
    const objectPath="products/"+product.id+"."+ext;
    const key=SITE_KEY();
    const h=new Headers({"Authorization":"Bearer "+key,"apikey":key,"Content-Type":photo.contentType,"x-upsert":"true"});
    const up=await fetch(SITE_URL()+"/storage/v1/object/site-assets/"+objectPath,{method:"POST",headers:h,body:photo.bytes});
    if(!up.ok){const t=await up.text();throw new Error("Não foi possível enviar a foto para o site: "+t)}
    imageUrl=SITE_URL()+"/storage/v1/object/public/site-assets/"+objectPath;
  }
  const payload={
    name:product.description,
    category:categorySlug,
    description:product.siteDescription??product.description??"",
    price:product.sitePrice==null?Number(product.salePrice||0):Number(product.sitePrice),
    image_url:imageUrl,
    featured:Boolean(product.siteFeatured),
    active:true,
    sort_order:Number(product.siteSortOrder||0),
    source_product_id:product.id,
    source_product_code:product.code,
    brand:product.brand||null,
    model:product.model||null,
    color:product.color||null,
    frame_size:product.frameSize||null,
    stock:Number(stock||0),
    stock_controlled:Boolean(product.stockControlled)
  };
  const saved=await siteRequest("/rest/v1/products?on_conflict=source_product_id",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=representation"},body:JSON.stringify(payload)});
  return saved?.[0]||saved;
}

export async function GET(){
  try{
    await requireRole(["ADMIN","GERENTE"]);
    const config=configError(); if(config)return NextResponse.json({configured:false,error:config},{status:503});
    const collections=await siteRequest("/rest/v1/collections?select=id,name,slug,active,sort_order&active=eq.true&order=sort_order");
    return NextResponse.json({configured:true,collections:Array.isArray(collections)?collections:[]});
  }catch(e){return apiError(e,"Não foi possível carregar as coleções do site.");}
}

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await requireRole(["ADMIN","GERENTE"]);
    const {id}=await params;
    const body=await req.json().catch(()=>({}));
    const publish=body.action!=="unpublish";
    const config=configError(); if(config)return NextResponse.json({error:config},{status:503});
    const product=await db.product.findUnique({where:{id},include:{category:true,lots:{where:{archived:false}}}});
    if(!product)return NextResponse.json({error:"Produto não encontrado."},{status:404});
    const stock=product.lots.reduce((sum,l)=>sum+Number(l.quantity),0);
    if(!publish){
      if(product.siteProductId){
        await siteRequest("/rest/v1/products?id=eq."+encodeURIComponent(product.siteProductId),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({active:false,updated_at:new Date().toISOString()})});
      }else{
        await siteRequest("/rest/v1/products?source_product_id=eq."+encodeURIComponent(product.id),{method:"PATCH",headers:{"Prefer":"return=minimal"},body:JSON.stringify({active:false,updated_at:new Date().toISOString()})});
      }
      const updated=await db.$transaction(async tx=>{const updated=await tx.product.update({where:{id},data:{publishedOnSite:false,siteSyncStatus:"UNPUBLISHED",siteSyncError:null,siteSyncedAt:new Date()}});await writeAudit(tx,{action:"SITE_UNPUBLISH",entity:"Product",entityId:id,userId:actor.id,metadata:{code:product.code}});return updated;});
      return NextResponse.json({ok:true,product:updated});
    }
    const saved=await publishProduct(product,stock);
    const siteId=String(saved?.id||product.siteProductId||"");
    const updated=await db.$transaction(async tx=>{const updated=await tx.product.update({where:{id},data:{publishedOnSite:true,siteProductId:siteId||undefined,siteSyncStatus:"SYNCED",siteSyncError:null,siteSyncedAt:new Date()}});await writeAudit(tx,{action:"SITE_PUBLISH",entity:"Product",entityId:id,userId:actor.id,metadata:{code:product.code,siteProductId:siteId,stock}});return updated;});
    return NextResponse.json({ok:true,product:updated,siteProduct:saved});
  }catch(e){
    try{
      const {id}=await params;
      await db.product.update({where:{id},data:{siteSyncStatus:"ERROR",siteSyncError:e instanceof Error?e.message:"Erro desconhecido"}}).catch(()=>null);
    }catch{}
    return apiError(e,"Não foi possível publicar o produto no site.");
  }
}
