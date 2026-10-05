import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

type R = Record<string, unknown>;

const norm=(v:unknown)=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const first=(r:R,keys:string[])=>{for(const k of keys){if(r[k]!==undefined&&r[k]!==null&&String(r[k]).trim()!=="")return r[k];}return null;};
const scalar=(v:unknown,keys:string[]=["id","_id","codigo","code","cpf","cpfCnpj","name","nome"]):string|null=>{
 if(v===undefined||v===null)return null;
 if(typeof v==="object"&&!Array.isArray(v)){const o=v as R;const nested=first(o,keys);return nested===null?null:String(nested).trim()||null;}
 return String(v).trim()||null;
};
const money=(v:unknown)=>{
 if(typeof v==="number")return Number.isFinite(v)?v:0;
 const raw=String(v??"").trim();
 if(!raw)return 0;
 const n=raw.includes(",")?Number(raw.replace(/\./g,"").replace(",",".").replace(/[^0-9.-]/g,"")):Number(raw.replace(/[^0-9.-]/g,""));
 return Number.isFinite(n)?n:0;
};
const dateOf=(v:unknown)=>{if(v===undefined||v===null||v==="")return null;const d=new Date(String(v));return Number.isNaN(d.getTime())?null:d;};
const idOf=(r:R)=>{const v=first(r,["id","_id","codigo","code"]);return v===null?null:String(v);};
const saleTotal=(r:R)=>{
 const values=r.valoresIDs;
 const gross=values&&typeof values==="object"&&!Array.isArray(values)
  ?Object.values(values as Record<string,unknown>).reduce<number>((sum:number,v:unknown)=>sum+money(v),0)
  :money(first(r,["valor","total","valorTotal"]));
 return Math.max(0,gross-money(first(r,["desconto","discount"])));
};
const collection=(records:R[],names:string[])=>{const set=new Set(names.map(norm));return records.filter(r=>set.has(norm(first(r,["collection_key","collection"])??"")));};
const refs=(r:R,kind:"customer"|"product")=>kind==="customer"?first(r,["clienteId","idCliente","customerId","cliente","cliente_id"]):first(r,["produtoId","idProduto","productId","produto","produto_id"]);

export async function POST(request:Request){
 try{
  await requireRole(["ADMIN"]);
  const body=await request.json();
  const records=body?.records;
  if(!Array.isArray(records)||!records.length)return NextResponse.json({ok:false,error:"O backup precisa ser uma lista JSON não vazia."},{status:400});
  const typed=records.filter((r:unknown):r is R=>Boolean(r&&typeof r==="object"&&!Array.isArray(r)));
  if(typed.length!==records.length)return NextResponse.json({ok:false,error:"O backup contém registros que não são objetos JSON."},{status:400});

  const fingerprint=crypto.createHash("sha256").update(JSON.stringify(typed)).digest("hex");
  const sales=collection(typed,["Venda","venda","Sales","sale"]);
  const backupCustomers=collection(typed,["Cliente","cliente","Customers","customers"]);
  if(!sales.length)return NextResponse.json({ok:false,error:"A C2 não encontrou a coleção Venda no backup. A estrutura precisa ser validada antes da reconciliação."},{status:400});

  const [customers,products,existingSales,legacy,legacyCustomers]=await Promise.all([
   db.customer.findMany({select:{id:true,name:true,cpfCnpj:true,phone:true,email:true}}),
   db.product.findMany({select:{id:true,code:true,barcode:true,description:true,brand:true,model:true}}),
   db.sale.findMany({select:{id:true,number:true,customerId:true,total:true,createdAt:true,canceled:true},orderBy:{createdAt:"desc"},take:20000}),
   db.legacyRecord.findMany({where:{source:"BEEPSTART",collectionKey:{in:["Venda","venda","Sales","sale"]}},select:{legacyId:true,legacyKey:true,targetEntity:true,targetId:true,status:true}}),
   db.legacyRecord.findMany({where:{source:"BEEPSTART",collectionKey:"Cliente"},select:{legacyId:true,targetEntity:true,targetId:true,payload:true,status:true}})
  ]);

  const cpf=new Map<string,string>(),phone=new Map<string,string>(),email=new Map<string,string>(),customerName=new Map<string,string>();
  for(const c of customers){if(c.cpfCnpj)cpf.set(norm(c.cpfCnpj),c.id);if(c.phone)phone.set(norm(c.phone),c.id);if(c.email)email.set(norm(c.email),c.id);if(c.name)customerName.set(norm(c.name),c.id);}
  const barcode=new Map<string,string>(),code=new Map<string,string>(),productName=new Map<string,string>();
  for(const p of products){if(p.barcode)barcode.set(norm(p.barcode),p.id);if(p.code)code.set(norm(p.code),p.id);if(p.description)productName.set(norm(p.description),p.id);}

  const legacyById=new Map(legacy.filter(x=>x.legacyId).map(x=>[String(x.legacyId),x]));
  const backupCustomerById=new Map<string,R>();
  for(const c of backupCustomers){const id=idOf(c);if(id)backupCustomerById.set(id,c);}
  const legacyCustomerById=new Map(legacyCustomers.filter(x=>x.legacyId).map(x=>[String(x.legacyId),x]));
  const saleNumber=new Map(existingSales.map(s=>[String(s.number),s]));
  const saleFingerprint=new Map<string,typeof existingSales[number]>();
  for(const s of existingSales)saleFingerprint.set(String(s.customerId??"SEM")+"|"+Number(s.total).toFixed(2)+"|"+s.createdAt.toISOString().slice(0,10),s);

  const statuses={alreadyImported:0,matched:0,newRecords:0,customerMissing:0,customerLegacyFound:0,customerOperationalMatched:0,productMissing:0,duplicatesInBackup:0,canceled:0};
  const seen=new Set<string>();
  const rows:any[]=[];
  let billing=0;

  for(const r of sales){
   const legacyId=idOf(r);
   const key=legacyId??crypto.createHash("sha256").update(JSON.stringify(r)).digest("hex");
   const duplicate=seen.has(key);seen.add(key);
   if(duplicate)statuses.duplicatesInBackup++;
   const total=saleTotal(r);billing+=total;
   const canceled=Boolean(first(r,["cancelled","canceled","cancelada","cancelado"]));
   if(canceled)statuses.canceled++;

   const customerRef=refs(r,"customer");
   const customerRefId=scalar(customerRef,["id","_id","codigo","code","clienteId","idCliente"]);
   const cpfValue=first(r,["cpf","cpfCnpj","clienteCpf","document"]);
   const phoneValue=first(r,["telefone","phone","clienteTelefone"]);
   const emailValue=first(r,["email","clienteEmail"]);
   const customerNameValue=first(r,["clienteNome","customerName","nomeCliente","cliente"]);
   const backupCustomer=customerRefId!==null?backupCustomerById.get(customerRefId):undefined;
   const backupCustomerCpf=backupCustomer?first(backupCustomer,["cpf","cpfCnpj","document"]):null;
   const backupCustomerPhone=backupCustomer?first(backupCustomer,["phone","telefone","celular"]):null;
   const backupCustomerEmail=backupCustomer?first(backupCustomer,["email","eMail"]):null;
   const backupCustomerName=backupCustomer?first(backupCustomer,["name","nome"]):null;
   const customerId=(customerRefId!==null&&customers.some(c=>c.id===customerRefId)?customerRefId:undefined)
    ??(backupCustomerCpf!==null?cpf.get(norm(backupCustomerCpf)):undefined)
    ??(backupCustomerEmail!==null?email.get(norm(backupCustomerEmail)):undefined)
    ??(backupCustomerPhone!==null?phone.get(norm(backupCustomerPhone)):undefined)
    ??(backupCustomerName!==null?customerName.get(norm(backupCustomerName)):undefined)
    ??(customerRefId!==null&&legacyCustomerById.get(customerRefId)?.targetEntity==="Customer"&&legacyCustomerById.get(customerRefId)?.targetId?String(legacyCustomerById.get(customerRefId)?.targetId):undefined)
    ??(cpfValue!==null?cpf.get(norm(cpfValue)):undefined)
    ??(emailValue!==null?email.get(norm(emailValue)):undefined)
    ??(phoneValue!==null?phone.get(norm(phoneValue)):undefined)
    ??(customerNameValue!==null?customerName.get(norm(customerNameValue)):undefined);

   const productRef=refs(r,"product");
   const productCode=first(r,["codigoProduto","productCode","codigo","code"]);
   const productBarcode=first(r,["barcode","codigoBarras","ean"]);
   const productDescription=first(r,["produtoNome","productName","nomeProduto","produto"]);
   const productId=(productRef!==null&&products.some(p=>p.id===String(productRef))?String(productRef):undefined)
    ??(productBarcode!==null?barcode.get(norm(productBarcode)):undefined)
    ??(productCode!==null?code.get(norm(productCode)):undefined)
    ??(productDescription!==null?productName.get(norm(productDescription)):undefined);

   if(customerId)statuses.customerOperationalMatched++;
   else if(backupCustomer)statuses.customerLegacyFound++;
   else if(customerRefId!==null&&legacyCustomerById.has(customerRefId))statuses.customerLegacyFound++;
   else statuses.customerMissing++;
   if((productRef!==null||productCode!==null||productBarcode!==null||productDescription!==null)&&!productId)statuses.productMissing++;

   const already=legacyId?legacyById.get(legacyId):undefined;
   const date=dateOf(first(r,["data","date","createdAt","created_at","dataVenda"]));
   const candidate=customerId?saleFingerprint.get(String(customerId)+"|"+total.toFixed(2)+"|"+(date?date.toISOString().slice(0,10):"SEM")):undefined;
   const byNumber=first(r,["numero","number","numeroVenda","codigoVenda"]);
   const numberMatch=byNumber!==null?saleNumber.get(String(byNumber)):undefined;

   let classification="NOVA";
   if(already?.targetEntity==="Sale"&&already.targetId){classification="JA_IMPORTADA";statuses.alreadyImported++;}
   else if(duplicate){classification="DUPLICADA_NO_BACKUP";}
   else if(numberMatch||candidate){classification="POSSIVEL_DUPLICIDADE";statuses.matched++;}
   else statuses.newRecords++;

   rows.push({legacyId,classification,total,date:date?.toISOString()??null,customer:{id:customerId??null,matched:Boolean(customerId),source:customerId?"MB":backupCustomer?"BACKUP_CLIENTE":customerRefId!==null?"REFERENCIA":cpfValue!==null?"CPF":emailValue!==null?"EMAIL":phoneValue!==null?"TELEFONE":customerNameValue!==null?"NOME":null},product:{id:productId??null,matched:Boolean(productId)},canceled,number:byNumber===null?null:String(byNumber)});
  }

  const newRecords=rows.filter(x=>x.classification==="NOVA");
  const blocked=rows.filter(x=>x.classification!=="NOVA");
  const warnings:string[]=[];
  if(statuses.customerMissing)warnings.push(String(statuses.customerMissing)+" venda(s) não possuem cliente resolvido no MB nem correspondência operacional no legado.");
  if(statuses.customerLegacyFound)warnings.push(String(statuses.customerLegacyFound)+" venda(s) possuem referência de cliente encontrada no legado, mas ainda sem cliente operacional vinculado.");
  if(statuses.productMissing)warnings.push(String(statuses.productMissing)+" venda(s) possuem referência de produto não resolvida.");
  if(statuses.duplicatesInBackup)warnings.push(String(statuses.duplicatesInBackup)+" duplicidade(s) foram encontradas dentro do próprio backup.");
  if(statuses.alreadyImported)warnings.push(String(statuses.alreadyImported)+" venda(s) já possuem registro legado importado.");
  if(statuses.matched)warnings.push(String(statuses.matched)+" venda(s) parecem coincidir com vendas já existentes no MB Gestão.");

  return NextResponse.json({ok:true,mode:"FATURAMENTO_C2_DRY_RUN",fingerprint,summary:{salesFound:sales.length,billing:Number(billing.toFixed(2)),newRecords:newRecords.length,blockedRecords:blocked.length,alreadyImported:statuses.alreadyImported,possibleDuplicates:statuses.matched,duplicateInBackup:statuses.duplicatesInBackup,canceled:statuses.canceled,customerMissing:statuses.customerMissing,customerLegacyFound:statuses.customerLegacyFound,customerOperationalMatched:statuses.customerOperationalMatched,productMissing:statuses.productMissing,customersInMb:customers.length,productsInMb:products.length,existingSalesSample:existingSales.length},warnings,rows,safety:{writesPerformed:false,operationalDataChanged:false,migrationRunCreated:false,willImport:newRecords.length},nextStep:"C3_IMPORTACAO_CONTROLADA"});
 }catch(error){return apiError(error,"Não foi possível executar a reconciliação C2 do faturamento.");}
}
