import {NextResponse} from "next/server";
import crypto from "node:crypto";
import {PrismaClient} from "@prisma/client";
import {requireRole} from "@/lib/auth";

type R=Record<string,any>;
const db=new PrismaClient();
const norm=(v:any)=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const text=(v:any)=>{if(v===undefined||v===null)return null;const s=String(v).trim();return s||null};
const first=(o:R,keys:string[])=>{for(const k of keys)if(o[k]!==undefined&&o[k]!==null&&String(o[k]).trim()!=="")return o[k];return null};
const idOf=(r:R)=>r?.id==null?null:String(r.id);
const legacyKey=(r:R,fingerprint:string)=>`BEEPSTART_SUPPLIER:${fingerprint}:${idOf(r)??crypto.createHash("sha256").update(JSON.stringify(r)).digest("hex")}`;

export async function POST(request:Request){
 try{
  await requireRole(["ADMIN"]);
  const body=await request.json();
  const records=Array.isArray(body?.records)?body.records as R[]:[];
  if(!records.length)return NextResponse.json({ok:false,error:"Nenhum registro de fornecedor foi enviado."},{status:400});
  const suppliers=records.filter(r=>String(r.collection_key??"") === "Fornecedor");
  if(!suppliers.length)return NextResponse.json({ok:false,error:"O backup não contém registros da coleção Fornecedor."},{status:400});

  const fingerprint=crypto.createHash("sha256").update(JSON.stringify(suppliers)).digest("hex");
  const sourceFingerprint="BEEPSTART_SUPPLIERS:"+fingerprint;
  const existingRun=await db.migrationRun.findUnique({where:{sourceFingerprint}});
  if(existingRun?.status==="COMPLETED")return NextResponse.json({ok:true,alreadyProcessed:true,fingerprint,sourceFingerprint,result:existingRun.report});

  const activeSuppliers=suppliers.filter(r=>!Boolean(r.archived));
  const archivedSuppliers=suppliers.filter(r=>Boolean(r.archived));

  const result=await db.$transaction(async tx=>{
   const run=await tx.migrationRun.create({data:{source:"BEEPSTART_SUPPLIERS",sourceFingerprint,status:"RUNNING",total:suppliers.length}});
   const [existing,legacy]=await Promise.all([
    tx.supplier.findMany({select:{id:true,name:true,document:true,phone:true,email:true}}),
    tx.legacyRecord.findMany({where:{collectionKey:"Fornecedor"},select:{legacyKey:true,legacyId:true,targetId:true,status:true}})
   ]);

   const byDoc=new Map<string,string[]>();
   const byNamePhone=new Map<string,string[]>();
   const byName=new Map<string,string[]>();
   const add=(map:Map<string,string[]>,key:string,id:string)=>{if(!key)return;const a=map.get(key)??[];a.push(id);map.set(key,a)};
   for(const s of existing){
    add(byDoc,norm(s.document),s.id);
    add(byNamePhone,`${norm(s.name)}|${norm(s.phone)}`,s.id);
    add(byName,norm(s.name),s.id);
   }
   const existingLegacy=new Map(legacy.map(x=>[x.legacyKey,x]));
   let created=0,matched=0,preserved=0,warnings:string[]=[];
   const rows:any[]=[];

   for(const s of suppliers){
    const lk=legacyKey(s,fingerprint);
    if(existingLegacy.has(lk))continue;

    const name=text(first(s,["name","nome"]))??`Fornecedor ${idOf(s)??"legado"}`;
    const document=text(first(s,["cnp","cnpj","cpfCnpj","document"]));
    const phone=text(first(s,["phone","telefone","celular"]));
    const email=text(first(s,["email","eMail"]));
    const notes=text(first(s,["notes","observacoes","observação"]));
    let targetId:string|undefined;
    let status="PRESERVED";

    if(!s.archived){
      const docMatches=document?(byDoc.get(norm(document))??[]):[];
      const npMatches=byNamePhone.get(`${norm(name)}|${norm(phone)}`)??[];
      const nameMatches=byName.get(norm(name))??[];
      if(docMatches.length===1)targetId=docMatches[0];
      else if(docMatches.length>1)warnings.push(`Fornecedor "${name}" possui documento duplicado na base atual.`);
      else if(npMatches.length===1)targetId=npMatches[0];
      else if(npMatches.length>1)warnings.push(`Fornecedor "${name}" possui nome/telefone ambíguos na base atual.`);
      else if(nameMatches.length===1)targetId=nameMatches[0];
      else if(nameMatches.length>1)warnings.push(`Fornecedor "${name}" possui nome duplicado na base atual; cadastro não foi mesclado automaticamente.`);

      if(targetId){
       status="MATCHED";matched++;
      }else{
       const createdSupplier=await tx.supplier.create({data:{name,document:document||undefined,phone:phone||undefined,email:email||undefined,notes:notes||"Incluído por reconciliação incremental do BeepStart"}});
       targetId=createdSupplier.id;
       add(byDoc,norm(document),targetId);add(byNamePhone,`${norm(name)}|${norm(phone)}`,targetId);add(byName,norm(name),targetId);
       status="IMPORTED";created++;
      }
    }else{
      preserved++;
    }

    rows.push({
      id:crypto.randomUUID(),source:"BEEPSTART",collectionKey:"Fornecedor",legacyId:idOf(s),legacyKey:lk,payload:s,
      migrationRunId:run.id,targetEntity:targetId?"Supplier":null,targetId:targetId??null,status
    });
   }

   if(rows.length)await tx.legacyRecord.createMany({data:rows});
   const report={mode:"SUPPLIER_RECONCILIATION",source:"BEEPSTART",fingerprint,sourceFingerprint,totalSuppliers:suppliers.length,activeSuppliers:activeSuppliers.length,archivedSuppliers:archivedSuppliers.length,created,matched,preserved,legacyCreated:rows.length,warnings};
   await tx.migrationRun.update({where:{id:run.id},data:{status:"COMPLETED",imported:created,mapped:matched,warnings:warnings.length,errors:0,report,completedAt:new Date()}});
   return report;
  },{maxWait:10000,timeout:120000});

  return NextResponse.json({ok:true,result});
 }catch(error){
  console.error("BEEPSTART SUPPLIER RECONCILIATION:",error);
  return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Falha na reconciliação dos fornecedores."},{status:500});
 }finally{await db.$disconnect();}
}
