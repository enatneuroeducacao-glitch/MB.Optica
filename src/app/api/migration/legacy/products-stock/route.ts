import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";
type P=Record<string,any>;
const text=(v:any)=>v==null?"":String(v).trim();
const num=(v:any)=>{const n=Number(String(v??"").replace(",","."));return Number.isFinite(n)?n:0};
const first=(p:P,keys:string[])=>{for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&String(v).trim()!=="")return v}return ""};
const stockFromObject=(value:any):number=>{
 const keys=["estoqueAtual","saldoEstoque","quantidadeEstoque","qtdEstoque","quantidadeDisponivel","saldo","quantidade","quantity","qtd","stock","currentStock","availableStock","estoque","saldoAtual","saldoQuantidade"];
 if(value==null)return 0;
 if(Array.isArray(value)){
  let total=0;
  for(const item of value){const n=stockFromObject(item);if(n>0)total+=n}
  return total;
 }
 if(typeof value!=="object")return 0;
 for(const k of keys){
  const v=value[k];
  if(v!==undefined&&v!==null&&!Array.isArray(v)){
   const n=num(v);
   if(n>0)return n;
  }
 }
 for(const [k,v] of Object.entries(value)){
  if(keys.includes(k))continue;
  if(v&&typeof v==="object"){
   const n=stockFromObject(v);
   if(n>0)return n;
  }
 }
 return 0;
};
const mapProduct=(row:any,stockOverride?:number)=>{
 const p=(row.payload||{}) as P;
 const code=text(first(p,["codigo","code","codigoProduto","referencia","ref","sku"]));
 const barcode=text(first(p,["codigoBarras","barcode","ean","ean13","gtin"]));
 const description=text(first(p,["descricao","description","nome","name","produto","produtoNome"]))||"Produto BeepStart";
 const brand=text(first(p,["marca","brand","fabricante"]));
 const model=text(first(p,["modelo","model","referenciaModelo","refModelo"]));
 const category=text(first(p,["categoria","category","categoriaNome"]));
 const supplier=text(first(p,["fornecedor","supplier","fornecedorNome"]));
 const cost=num(first(p,["custo","cost","precoCusto","valorCusto"]));
 const salePrice=num(first(p,["precoVenda","preco","valorVenda","salePrice","preco_venda"]));
 const stock=stockOverride!==undefined?stockOverride:stockFromObject(p);
 const minimumStock=num(first(p,["estoqueMinimo","minimumStock","minimo"]));
 return {id:row.id,legacyId:row.legacyId,code:code||("BS-"+text(row.legacyId||row.id).slice(-20)),barcode,description,brand,model,category,supplier,cost,salePrice,stock,minimumStock};
};

const lotStockByProduct=(lots:any[])=>{
 const totals=new Map<string,number>();
 for(const lot of lots){
  const p=(lot.payload||{}) as P;
  const produtoID=text(first(p,["produtoID","productId","produtoId"]));
  if(!produtoID||p.archived===true)continue;
  const quantity=num(first(p,["quantidade","quantity","qtd"]));
  totals.set(produtoID,(totals.get(produtoID)||0)+quantity);
 }
 return totals;
};
export async function GET(){
 try{
  await requireRole(["ADMIN","GERENTE"]);
  const rows=await db.legacyRecord.findMany({
   where:{source:"BEEPSTART",collectionKey:{equals:"Produto",mode:"insensitive"}},
   select:{id:true,legacyId:true,payload:true,status:true,targetEntity:true,targetId:true},
   orderBy:{importedAt:"desc"},
   take:10000
  });
  const lots=await db.legacyRecord.findMany({
   where:{source:"BEEPSTART",collectionKey:{equals:"Lote",mode:"insensitive"}},
   select:{payload:true},
   take:100000
  });
  const lotStock=lotStockByProduct(lots);
  const products=rows.map((row:any)=>({...mapProduct(row,lotStock.get(String(row.legacyId||""))||0),alreadyIntegrated:row.status==="IMPORTED_SELECTIVELY"||row.targetEntity==="Product"||Boolean(row.targetId)})).filter(p=>p.stock>0);
  const codes=products.map(p=>p.code).filter(Boolean);
  const barcodes=products.map(p=>p.barcode).filter(Boolean);
  const existing=await db.product.findMany({where:{OR:[...(codes.length?[{code:{in:codes}}]:[]),...(barcodes.length?[{barcode:{in:barcodes}}]:[])]},select:{id:true,code:true,barcode:true}});
  const existingCodes=new Set(existing.map((p:any)=>p.code).filter(Boolean));
  const existingBarcodes=new Set(existing.map((p:any)=>p.barcode).filter(Boolean));
  const enriched=products.map(p=>({...p,alreadyIntegrated:p.alreadyIntegrated||existingCodes.has(p.code)||(p.barcode?existingBarcodes.has(p.barcode):false)}));
  return NextResponse.json({ok:true,total:enriched.length,products:enriched});
 }catch(e){return apiError(e,"Não foi possível carregar os produtos do estoque BeepStart.");}
}}