import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

type R = Record<string, any>;
const norm=(v:any)=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const text=(v:any)=>v===undefined||v===null?"":String(v).trim();
const first=(o:R,keys:string[])=>{for(const k of keys)if(o[k]!==undefined&&o[k]!==null&&String(o[k]).trim()!=="")return o[k];return null;};
const legacyKey=(r:R,fingerprint:string)=>"BEEPSTART:"+fingerprint+":"+String(r.collection_key??"SEM_COLLECTION")+":"+(r.id==null?crypto.createHash("sha256").update(JSON.stringify(r)).digest("hex"):String(r.id));
function add(map:Map<string,string[]>,key:string,id:string){if(key)map.set(key,[...(map.get(key)??[]),id]);}

export async function POST(request:Request){
  try{
    await requireRole(["ADMIN"]);
    const body=await request.json();
    const records=body?.records;
    if(!Array.isArray(records))return NextResponse.json({ok:false,error:"O backup precisa ser uma lista JSON."},{status:400});
    const fingerprint=crypto.createHash("sha256").update(JSON.stringify(records)).digest("hex");
    const byCollection=new Map<string,R[]>();
    for(const r of records as R[]){const k=String(r.collection_key??"SEM_COLLECTION");byCollection.set(k,[...(byCollection.get(k)??[]),r]);}
    const customers=byCollection.get("Cliente")??[];
    const products=byCollection.get("Produto")??[];
    const [existingCustomers,existingProducts,existingLegacyRecords]=await Promise.all([
      db.customer.findMany({select:{id:true,name:true,cpfCnpj:true,phone:true}}),
      db.product.findMany({select:{id:true,code:true,barcode:true,description:true,brand:true,model:true}}),
      db.legacyRecord.findMany({select:{collectionKey:true,legacyId:true,targetEntity:true,targetId:true,status:true}}),
    ]);
    const cpfMap=new Map<string,string[]>(), namePhoneMap=new Map<string,string[]>(), nameMap=new Map<string,string[]>();
    for(const c of existingCustomers){if(c.cpfCnpj)add(cpfMap,norm(c.cpfCnpj),c.id);if(c.phone)add(namePhoneMap,norm(c.name)+"|"+norm(c.phone),c.id);if(c.name)add(nameMap,norm(c.name),c.id);}
    const customerIds=new Set(existingCustomers.map(c=>c.id));
    const productIds=new Set(existingProducts.map(p=>p.id));
    const reconciledMap=new Map<string,{targetEntity:string|null;targetId:string|null;status:string}>();
    for(const l of existingLegacyRecords){
      if(!l.collectionKey||!l.legacyId||!l.targetId)continue;
      const targetExists=l.targetEntity==="Customer"?customerIds.has(String(l.targetId)):l.targetEntity==="Product"?productIds.has(String(l.targetId)):true;
      if(targetExists)reconciledMap.set(String(l.collectionKey)+":"+String(l.legacyId),{targetEntity:l.targetEntity,targetId:l.targetId,status:l.status});
    }
    const codeMap=new Map<string,string[]>(), barcodeMap=new Map<string,string[]>(), identityMap=new Map<string,string[]>(), descBrandMap=new Map<string,string[]>();
    for(const p of existingProducts){if(p.code)add(codeMap,norm(p.code),p.id);if(p.barcode)add(barcodeMap,norm(p.barcode),p.id);add(identityMap,norm(p.description)+"|"+norm(p.brand)+"|"+norm(p.model),p.id);add(descBrandMap,norm(p.description)+"|"+norm(p.brand),p.id);}
    const sourceCpf=new Map<string,number>(),sourceBarcode=new Map<string,number>(),sourceCode=new Map<string,number>();
    for(const c of customers){const v=text(first(c,["cpf","cnp","cpfCnpj","document"]));if(v)sourceCpf.set(norm(v),(sourceCpf.get(norm(v))??0)+1);}
    for(const p of products){const b=text(first(p,["barcode","codigoBarras","ean"]));if(b)sourceBarcode.set(norm(b),(sourceBarcode.get(norm(b))??0)+1);const c=text(first(p,["codigo","code","codigoProduto"]));if(c)sourceCode.set(norm(c),(sourceCode.get(norm(c))??0)+1);}
    const customerCandidates:any[]=[],productCandidates:any[]=[];
    for(const c of customers){
      const key=legacyKey(c,fingerprint),name=text(first(c,["name","nome"])),cpf=text(first(c,["cpf","cnp","cpfCnpj","document"])),phone=text(first(c,["phone","telefone","celular"]));
      const cpfHits=cpf?(cpfMap.get(norm(cpf))??[]):[],npHits=phone?(namePhoneMap.get(norm(name)+"|"+norm(phone))??[]):[],nameHits=name?(nameMap.get(norm(name))??[]):[];
      let status="NEW",method="",matchedId="",reason="Nenhuma correspondência segura encontrada.";
      const reconciled=reconciledMap.get("Cliente:"+(c.id==null?"":String(c.id)));
      if(reconciled){status="RECONCILED";method="Reconciliação já concluída";matchedId=reconciled.targetId||"";reason="Este registro já foi reconciliado anteriormente e não será incluído novamente."}
      else if(cpf&&(sourceCpf.get(norm(cpf))??0)>1){status="REVIEW";method="CPF/CNPJ duplicado no backup";reason="O mesmo documento aparece em mais de um registro do backup.";}
      else if(cpfHits.length===1){status="MATCHED";method="CPF/CNPJ exato";matchedId=cpfHits[0];reason="Correspondência segura.";}
      else if(cpfHits.length>1){status="REVIEW";method="CPF/CNPJ ambíguo";reason="Há mais de um cadastro atual com este documento.";}
      else if(npHits.length===1){status="MATCHED";method="Nome + telefone";matchedId=npHits[0];reason="Correspondência segura sem documento.";}
      else if(npHits.length>1){status="REVIEW";method="Nome + telefone ambíguo";reason="Há mais de um cadastro atual compatível.";}
      else if(nameHits.length===1&&!cpf&&!phone){status="REVIEW";method="Nome exato";matchedId=nameHits[0];reason="Nome coincide, mas falta documento/telefone para confirmação automática.";}
      const matched=matchedId?existingCustomers.find(x=>x.id===matchedId):null;
      customerCandidates.push({legacyKey:key,legacyId:c.id==null?null:String(c.id),name:name||"Sem nome",document:cpf,phone,status,method,reason,matchedId:matchedId||null,matchedName:matched?.name||null});
    }
    for(const p of products){
      const key=legacyKey(p,fingerprint),description=text(first(p,["description","descricao","name"])),brand=text(first(p,["brand","marca"])),model=text(first(p,["model","modelo"])),barcode=text(first(p,["barcode","codigoBarras","ean"])),code=text(first(p,["codigo","code","codigoProduto"]))||(p.id==null?"":String(p.id));
      const barcodeHits=barcode?(barcodeMap.get(norm(barcode))??[]):[],codeHits=code?(codeMap.get(norm(code))??[]):[],identityHits=identityMap.get(norm(description)+"|"+norm(brand)+"|"+norm(model))??[],dbHits=descBrandMap.get(norm(description)+"|"+norm(brand))??[];
      let status="NEW",method="",matchedId="",reason="Nenhuma correspondência segura encontrada.";
      const reconciled=reconciledMap.get("Produto:"+(p.id==null?"":String(p.id)));
      if(reconciled){status="RECONCILED";method="Reconciliação já concluída";matchedId=reconciled.targetId||"";reason="Este produto já foi reconciliado anteriormente e não será incluído novamente."}
      else if(barcode&&(sourceBarcode.get(norm(barcode))??0)>1){status="REVIEW";method="Código de barras duplicado no backup";reason="O mesmo código de barras aparece em mais de um produto do backup.";}
      else if(barcodeHits.length===1){status="MATCHED";method="Código de barras exato";matchedId=barcodeHits[0];reason="Correspondência segura.";}
      else if(barcodeHits.length>1){status="REVIEW";method="Código de barras ambíguo";reason="Há mais de um produto atual com este código.";}
      else if(code&&(sourceCode.get(norm(code))??0)>1){status="REVIEW";method="Código duplicado no backup";reason="O mesmo código aparece em mais de um produto do backup.";}
      else if(codeHits.length===1){status="MATCHED";method="Código exato";matchedId=codeHits[0];reason="Correspondência segura.";}
      else if(codeHits.length>1){status="REVIEW";method="Código ambíguo";reason="Há mais de um produto atual com este código.";}
      else if(identityHits.length===1){status="MATCHED";method="Descrição + marca + modelo";matchedId=identityHits[0];reason="Identidade do produto coincide.";}
      else if(identityHits.length>1){status="REVIEW";method="Identidade ambígua";reason="Mais de um produto atual possui a mesma identidade.";}
      else if(dbHits.length>0){status="REVIEW";method="Descrição + marca";reason="Há produto(s) parecido(s), mas falta modelo/identidade completa para confirmar.";}
      const matched=matchedId?existingProducts.find(x=>x.id===matchedId):null;
      productCandidates.push({legacyKey:key,legacyId:p.id==null?null:String(p.id),description:description||"Sem descrição",brand,model,code,barcode,status,method,reason,matchedId:matchedId||null,matchedName:matched?.description||null});
    }
    const counts=(items:any[])=>items.reduce((a,x)=>{a[x.status]=(a[x.status]??0)+1;return a;},{MATCHED:0,NEW:0,REVIEW:0} as Record<string,number>);
    return NextResponse.json({ok:true,preview:{fingerprint,totalRecords:records.length,customerSource:customers.length,productSource:products.length,otherRecords:records.length-customers.length-products.length,customers:customerCandidates,products:productCandidates,customerCounts:counts(customerCandidates),productCounts:counts(productCandidates)}});
  }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Falha ao pesquisar a reconciliação."},{status:500});}
}
