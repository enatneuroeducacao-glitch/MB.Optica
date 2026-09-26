import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

type R=Record<string,any>;
const input=process.argv[2]??process.env.BEEPSTART_BACKUP;
const outArg=process.argv.find(v=>v.startsWith("--out="))?.slice(6);
if(!input) throw new Error("Uso: npm run reconcile:beepstart -- ./backup.json [--out=./beepstart-reconciliation.json]");
const file=path.resolve(input);
if(!fs.existsSync(file)) throw new Error("Backup não encontrado: "+file);
const rawText=fs.readFileSync(file,"utf8");
const fingerprint=crypto.createHash("sha256").update(rawText).digest("hex");
const raw=JSON.parse(rawText);
if(!Array.isArray(raw)) throw new Error("O backup precisa conter uma lista JSON.");
const records=raw as R[];
const keyOf=(r:R)=>`BEEPSTART:${String(r.collection_key??"SEM_COLLECTION")}:${r.id==null?crypto.createHash("sha256").update(JSON.stringify(r)).digest("hex"):String(r.id)}`;
const group=new Map<string,R[]>();
for(const r of records){const k=String(r.collection_key??"SEM_COLLECTION");const a=group.get(k)??[];a.push(r);group.set(k,a)}
const db=new PrismaClient();

async function main(){
  const run=await db.migrationRun.findUnique({where:{sourceFingerprint:fingerprint}});
  if(!run) throw new Error("Não existe MigrationRun para este backup. Execute a importação primeiro.");
  const legacy=await db.legacyRecord.findMany({where:{migrationRunId:run.id},select:{collectionKey:true,legacyKey:true,targetEntity:true,targetId:true,status:true}});
  const legacyKeys=new Set(legacy.map(x=>x.legacyKey));
  const missing=records.filter(r=>!legacyKeys.has(keyOf(r)));
  const duplicateSource=new Set<string>(); const seen=new Set<string>();
  for(const r of records){const k=keyOf(r);if(seen.has(k))duplicateSource.add(k);seen.add(k)}
  const sourceCollections=Object.fromEntries([...group.entries()].map(([k,v])=>[k,v.length]));
  const importedCollections:Record<string,number>={};
  for(const row of legacy){const k=row.collectionKey??"SEM_COLLECTION";importedCollections[k]=(importedCollections[k]??0)+1}
  const targetCounts:Record<string,number>={};
  for(const row of legacy) if(row.targetEntity){targetCounts[row.targetEntity]=(targetCounts[row.targetEntity]??0)+1}
  const salesLegacy=legacy.filter(x=>x.collectionKey==="Venda"&&x.targetEntity==="Sale"&&x.targetId).map(x=>x.targetId as string);
  const ordersLegacy=legacy.filter(x=>x.collectionKey==="Ordem"&&x.targetEntity==="OpticalOrder"&&x.targetId).map(x=>x.targetId as string);
  const customersLegacy=legacy.filter(x=>x.collectionKey==="Cliente"&&x.targetEntity==="Customer");
  const productsLegacy=legacy.filter(x=>x.collectionKey==="Produto"&&x.targetEntity==="Product");
  const [salesAgg,salesCount,ordersCount]=await Promise.all([
    salesLegacy.length?db.sale.aggregate({where:{id:{in:salesLegacy}},_sum:{total:true}}):null,
    salesLegacy.length?db.sale.count({where:{id:{in:salesLegacy}}}):0,
    ordersLegacy.length?db.opticalOrder.count({where:{id:{in:ordersLegacy}}}):0
  ]);
  const divergences:string[]=[];
  if(missing.length)divergences.push(`${missing.length} registros da fonte não possuem LegacyRecord no run.`);
  if(duplicateSource.size)divergences.push(`${duplicateSource.size} chaves duplicadas na fonte.`);
  if(run.status!=="COMPLETED")divergences.push(`MigrationRun está em status ${run.status}.`);
  for(const [collection,count] of Object.entries(sourceCollections)){
    const imported=importedCollections[collection]??0;
    if(imported!==count)divergences.push(`Coleção ${collection}: fonte=${count}, legado importado=${imported}.`);
  }
  if(salesCount!==salesLegacy.length)divergences.push(`Vendas: legado mapeado=${salesLegacy.length}, destino=${salesCount}.`);
  if(ordersCount!==ordersLegacy.length)divergences.push(`Ordens: legado mapeado=${ordersLegacy.length}, destino=${ordersCount}.`);
  if(customersLegacy.length!==(sourceCollections["Cliente"]??0))divergences.push(`Clientes consolidados: ${customersLegacy.length}/${sourceCollections["Cliente"]??0}.`);
  if(productsLegacy.length!==(sourceCollections["Produto"]??0))divergences.push(`Produtos consolidados: ${productsLegacy.length}/${sourceCollections["Produto"]??0}.`);
  const report={source:"BEEPSTART",fingerprint,migrationRunId:run.id,status:divergences.length?"DIVERGENCIAS":"RECONCILIADO",sourceTotal:records.length,legacyStored:legacy.length,sourceCollections,importedCollections,targetCounts,checks:{missingLegacyRecords:missing.length,duplicateSourceKeys:duplicateSource.size,salesMapped:salesLegacy.length,salesFound:salesCount,salesTotalDestination:salesAgg?String(salesAgg._sum.total??0):"0",ordersMapped:ordersLegacy.length,ordersFound:ordersCount,customersConsolidated:customersLegacy.length,productsConsolidated:productsLegacy.length},divergences};
  if(outArg)fs.writeFileSync(path.resolve(outArg),JSON.stringify(report,null,2),"utf8");
  console.log(JSON.stringify(report,null,2));
  if(divergences.length)process.exitCode=2;
}
main().catch(e=>{console.error("BEEPSTART RECONCILIATION FAILED:",e);process.exitCode=1}).finally(()=>db.$disconnect());
