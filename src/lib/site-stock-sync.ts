import {db} from "@/lib/db";

const siteUrl=()=>String(process.env.MB_SITE_SUPABASE_URL||"").replace(/\/$/,"");
const siteKey=()=>String(process.env.MB_SITE_SUPABASE_SERVICE_ROLE_KEY||"");
const hideWhenOut=()=>String(process.env.MB_SITE_HIDE_OUT_OF_STOCK||"false").toLowerCase()==="true";

async function sitePatch(path:string,body:any){
 const key=siteKey();
 const r=await fetch(siteUrl()+path,{method:"PATCH",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify(body),cache:"no-store"});
 if(!r.ok){const t=await r.text();throw new Error("Supabase site HTTP "+r.status+": "+t)}
}

export async function syncPublishedProductStock(productId:string){
 try{
  const product=await db.product.findUnique({where:{id:productId},include:{lots:{where:{archived:false}}}});
  if(!product||!product.publishedOnSite)return {ok:true,skipped:true,reason:"NOT_PUBLISHED"};
  const stock=product.lots.reduce((sum,lot)=>sum+Number(lot.quantity),0);
  if(!siteUrl()||!siteKey())throw new Error("Integração com o site não configurada no Render.");
  const filter=product.siteProductId?"id=eq."+encodeURIComponent(product.siteProductId):"source_product_id=eq."+encodeURIComponent(product.id);
  const active=hideWhenOut()?stock>0:true;
  await sitePatch("/rest/v1/products?"+filter,{stock,stock_controlled:Boolean(product.stockControlled),active,updated_at:new Date().toISOString()});
  await db.product.update({where:{id:product.id},data:{siteSyncStatus:"STOCK_SYNCED",siteSyncError:null,siteSyncedAt:new Date()}});
  return {ok:true,stock,active};
 }catch(error){
  const message=error instanceof Error?error.message:"Erro desconhecido na sincronização do estoque.";
  await db.product.update({where:{id:productId},data:{siteSyncStatus:"STOCK_ERROR",siteSyncError:message}}).catch(()=>null);
  return {ok:false,error:message};
 }
}

export async function syncPublishedProductStocks(productIds:string[]){
 const ids=[...new Set(productIds.filter(Boolean))];
 return Promise.all(ids.map(id=>syncPublishedProductStock(id)));
}
