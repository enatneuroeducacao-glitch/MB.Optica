import fs from "node:fs";
import path from "node:path";

type Legacy=Record<string,any>;
type Output={
  source:"BEEPSTART";
  generatedAt:string;
  counts:Record<string,number>;
  warnings:string[];
  customers:any[];
  products:any[];
  suppliers:any[];
  categories:any[];
  sales:any[];
  orders:any[];
  receivables:any[];
  payables:any[];
  paymentMethods:any[];
  legacyRecords:any[];
};

const input=process.argv[2]??process.env.BEEPSTART_BACKUP;
const outArg=process.argv.find(v=>v.startsWith("--out="))?.slice(6);
if(!input) throw new Error("Uso: npm run transform:beepstart -- ./backup.json [--out=./migration-preview.json]");
const file=path.resolve(input);
if(!fs.existsSync(file)) throw new Error("Backup não encontrado: "+file);

const raw=JSON.parse(fs.readFileSync(file,"utf8"));
if(!Array.isArray(raw)) throw new Error("O backup precisa conter uma lista JSON.");

const groups=new Map<string,Legacy[]>();
for(const item of raw as Legacy[]){
  const key=String(item.collection_key??"SEM_COLLECTION");
  const list=groups.get(key)??[];
  list.push(item);
  groups.set(key,list);
}
const all=(key:string)=>groups.get(key)??[];
const byId=(key:string)=>new Map(all(key).map(x=>[String(x.id),x]));
const idMap=(key:string)=>byId(key);

const categories=idMap("Categoria");
const suppliers=idMap("Fornecedor");
const customers=idMap("Cliente");
const users=idMap("Usuario");
const products=idMap("Produto");
const methods=idMap("MeioPG");

const warnings:string[]=[];
const money=(v:any)=>Number.isFinite(Number(v))?Number(v):0;
const date=(v:any)=>v?new Date(Number(v)).toISOString():null;
const clean=(v:any)=>typeof v==="string"?v.trim():v;

const normalizedCustomers=all("Cliente").map(c=>({
  legacyId:String(c.id),
  name:clean(c.name)||"Cliente sem nome",
  cpfCnpj:clean(c.cnp)||null,
  phone:clean(c.phone)||null,
  legacyAddressId:c.enderecoID?String(c.enderecoID):null,
  notes:null,
  active:true
}));

const normalizedProducts=all("Produto").map(p=>{
  const categoryId=p.categoriaID?String(p.categoriaID):null;
  const supplierId=p.fornecedorID?String(p.fornecedorID):null;
  if(categoryId&&!categories.has(categoryId)) warnings.push(`Produto ${p.id}: categoria ${categoryId} não encontrada`);
  if(supplierId&&!suppliers.has(supplierId)) warnings.push(`Produto ${p.id}: fornecedor ${supplierId} não encontrado`);
  return {
    legacyId:String(p.id),
    code:String(p.id),
    barcode:clean(p.barcode)||null,
    description:clean(p.description)||"Produto sem descrição",
    unit:clean(p.medida||p.unidade)||"UN",
    cost:money(p.custo),
    salePrice:money(p.venda),
    minimumStock:money(p.estoqueMinimo),
    legacyCategoryId:categoryId,
    legacySupplierId:supplierId,
    active:true
  };
});

const normalizedSuppliers=all("Fornecedor").map(s=>({
  legacyId:String(s.id),
  name:clean(s.name)||"Fornecedor sem nome",
  document:null,
  phone:null,
  email:null,
  notes:null,
  legacyAddressId:s.enderecoID?String(s.enderecoID):null,
  active:true
}));

const normalizedCategories=all("Categoria").map(c=>({
  legacyId:String(c.id),
  name:clean(c.description)||`Categoria ${c.id}`,
  active:true
}));

const normalizedMethods=all("MeioPG").map(m=>({
  legacyId:String(m.id),
  name:clean(m.description)||`Meio ${m.id}`,
  isCash:/dinheiro|esp[eé]cie|cash/i.test(String(m.description||"")),
  active:true
}));

const normalizedSales=all("Venda").map(s=>{
  const quantities=s.quantidadesIDs&&typeof s.quantidadesIDs==="object"?s.quantidadesIDs:{};
  const values=s.valoresIDs&&typeof s.valoresIDs==="object"?s.valoresIDs:{};
  const costs=s.custosIDs&&typeof s.custosIDs==="object"?s.custosIDs:{};
  const payments=s.pagamentosIDs&&typeof s.pagamentosIDs==="object"?s.pagamentosIDs:{};
  const items=Object.keys(quantities).map(productId=>{
    if(!products.has(String(productId))) warnings.push(`Venda ${s.id}: produto ${productId} não encontrado`);
    return {
      legacyProductId:String(productId),
      quantity:money(quantities[productId]),
      unitPrice:money(values[productId]),
      unitCost:money(costs[productId])
    };
  });
  const salePayments=Object.entries(payments).map(([methodId,value])=>{
    if(!methods.has(String(methodId))) warnings.push(`Venda ${s.id}: meio de pagamento ${methodId} não encontrado`);
    const pair=Array.isArray(value)?value:[1,value];
    return {legacyMethodId:String(methodId),installments:money(pair[0])||1,amount:money(pair[1])};
  });
  const customerId=s.clienteID?String(s.clienteID):null;
  const sellerId=s.usuarioID?String(s.usuarioID):null;
  if(customerId&&!customers.has(customerId)) warnings.push(`Venda ${s.id}: cliente ${customerId} não encontrado`);
  if(sellerId&&!users.has(sellerId)) warnings.push(`Venda ${s.id}: usuário ${sellerId} não encontrado`);
  return {
    legacyId:String(s.id),
    number:s.position??null,
    legacyCustomerId:customerId,
    legacySellerId:sellerId,
    createdAt:date(s.data),
    total:items.reduce((sum,i)=>sum+i.quantity*i.unitPrice,0),
    completed:Boolean(s.concluido),
    items,
    payments:salePayments
  };
});

const normalizedOrders=all("Ordem").map(o=>{
  const customerId=o.clienteID?String(o.clienteID):null;
  const procedures=o.procedimentosIDs&&typeof o.procedimentosIDs==="object"?o.procedimentosIDs:{};
  const values=o.valoresIDs&&typeof o.valoresIDs==="object"?o.valoresIDs:{};
  if(customerId&&!customers.has(customerId)) warnings.push(`Ordem ${o.id}: cliente ${customerId} não encontrado`);
  return {
    legacyId:String(o.id),
    number:o.numeracao??null,
    legacyCustomerId:customerId,
    legacySellerId:o.prestadorID?String(o.prestadorID):null,
    openedAt:date(o.aberto),
    dueDate:date(o.prazo),
    notes:clean(o.observacoes)||null,
    archived:Boolean(o.archived),
    items:Object.keys(procedures).map(productId=>({
      legacyProductId:String(productId),
      quantity:money(procedures[productId])||1,
      unitPrice:money(values[productId])
    }))
  };
});

const normalizedReceivables=all("ContaAReceber").map(a=>({
  legacyId:String(a.id),
  description:clean(a.descricao)||"Conta a receber",
  customerLegacyId:a.clienteID?String(a.clienteID):null,
  saleLegacyId:a.vendaID?String(a.vendaID):null,
  amount:money(a.valor),
  installments:Array.isArray(a.parcelas)?a.parcelas.map(money):[],
  dueDates:Array.isArray(a.vencimentos)?a.vencimentos.map(date):[],
  notes:clean(a.observacoes)||null,
  archived:Boolean(a.archived)
}));

const normalizedPayables=all("ContaAPagar").map(a=>({
  legacyId:String(a.id),
  description:clean(a.descricao)||"Conta a pagar",
  supplierName:clean(a.credor)||null,
  amount:money(a.valor),
  installments:Array.isArray(a.parcelas)?a.parcelas.map(money):[],
  dueDates:Array.isArray(a.vencimentos)?a.vencimentos.map(date):[],
  paidDates:Array.isArray(a.pagos)?a.pagos.map(date):[],
  archived:Boolean(a.archived)
}));

const counts:Record<string,number>={};
for(const [key,list] of groups) counts[key]=list.length;

const output:Output={
  source:"BEEPSTART",
  generatedAt:new Date().toISOString(),
  counts,
  warnings,
  customers:normalizedCustomers,
  products:normalizedProducts,
  suppliers:normalizedSuppliers,
  categories:normalizedCategories,
  sales:normalizedSales,
  orders:normalizedOrders,
  receivables:normalizedReceivables,
  payables:normalizedPayables,
  paymentMethods:normalizedMethods,
  legacyRecords:raw.map((r:any)=>({
    source:"BEEPSTART",
    collectionKey:r.collection_key??null,
    legacyId:r.id?String(r.id):null,
    payload:r
  }))
};

console.log(`Transformação segura: ${raw.length} registros → ${warnings.length} avisos`);
console.log(`Clientes: ${output.customers.length} | Produtos: ${output.products.length} | Vendas: ${output.sales.length} | Ordens: ${output.orders.length}`);
console.log(`Receber: ${output.receivables.length} | Pagar: ${output.payables.length}`);

if(outArg){
  const out=path.resolve(outArg);
  fs.writeFileSync(out,JSON.stringify(output,null,2),"utf8");
  console.log("Preview gravado em:",out);
}
