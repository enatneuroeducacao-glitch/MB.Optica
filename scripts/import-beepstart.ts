import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PrismaClient, Prisma, UserRole, OrderStatus, PaymentStatus, AccountType, StockMovementType } from "@prisma/client";

type R = Record<string, any>;
const EXPECTED_TOTAL = 5788;
const input = process.argv[2] ?? process.env.BEEPSTART_BACKUP;
const allowCountChange = process.argv.includes("--allow-count-change");
const dryRun = process.argv.includes("--dry-run");

if (!input) throw new Error("Uso: npm run migration:beepstart -- ./Backup.json [--dry-run] [--allow-count-change]");
const file = path.resolve(input);
if (!fs.existsSync(file)) throw new Error("Backup não encontrado: " + file);

const rawText = fs.readFileSync(file, "utf8");
const fingerprint = crypto.createHash("sha256").update(rawText).digest("hex");
let parsed: unknown;
try { parsed = JSON.parse(rawText); } catch { throw new Error("O backup BeepStart deve ser o JSON estruturado já auditado."); }
if (!Array.isArray(parsed)) throw new Error("O backup BeepStart precisa conter uma lista JSON.");

const records = parsed as R[];
if (records.length !== EXPECTED_TOTAL && !allowCountChange) {
  throw new Error(`Contagem de segurança divergente: esperado ${EXPECTED_TOTAL}, recebido ${records.length}. Use --allow-count-change somente após nova auditoria.`);
}

const norm = (v: any) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const text = (v: any) => typeof v === "string" ? v.trim() : v == null ? null : String(v);
const first = (o: R, keys: string[]) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k]; return null; };
const money = (v: any) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const x = v.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
    const n = Number(x); return Number.isFinite(n) ? n : 0;
  }
  const n = Number(v); return Number.isFinite(n) ? n : 0;
};
const dec = (v: any) => new Prisma.Decimal(money(v).toFixed(2));
const date = (v: any): Date | null => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number" || /^\d+$/.test(String(v))) {
    const n = Number(v);
    const ms = n < 1e12 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};
const bool = (v: any) => v === true || v === 1 || /^(true|1|sim|yes|concluido)$/i.test(String(v ?? ""));
const id = (r: R) => r.id == null ? null : String(r.id);
const keyOf = (r: R) => `BEEPSTART:${String(r.collection_key ?? "SEM_COLLECTION")}:${id(r) ?? crypto.createHash("sha256").update(JSON.stringify(r)).digest("hex")}`;
const group = new Map<string, R[]>();
for (const r of records) {
  const k = String(r.collection_key ?? "SEM_COLLECTION");
  const a = group.get(k) ?? []; a.push(r); group.set(k, a);
}
const all = (k: string) => group.get(k) ?? [];
const ids = (k: string) => new Set(all(k).map(id).filter(Boolean));

const refs: [string,string,string][] = [
  ["Venda","Cliente","clienteID"],["Venda","Usuario","usuarioID"],["Venda","EnderecoLocal","enderecoLocalID"],
  ["Produto","Categoria","categoriaID"],["Produto","Fornecedor","fornecedorID"],
  ["Lote","Produto","produtoID"],["Lote","Venda","vendaID"],["Ordem","Cliente","clienteID"],["Ordem","Venda","vendaID"]
];
for (const [source,target,field] of refs) {
  const targetIds = ids(target);
  const missing = all(source).filter(r => r[field] != null && r[field] !== "" && !targetIds.has(String(r[field]))).length;
  if (missing) throw new Error(`Integridade BeepStart inválida: ${source}.${field} -> ${target}: ${missing} referências órfãs.`);
}

const duplicateKeys = new Set<string>();
const seen = new Set<string>();
for (const r of records) {
  const k = keyOf(r);
  if (seen.has(k)) duplicateKeys.add(k);
  seen.add(k);
}
if (duplicateKeys.size) throw new Error(`Há ${duplicateKeys.size} chaves legadas duplicadas; importação abortada.`);

if (dryRun) {
  console.log(JSON.stringify({
    mode:"DRY_RUN", source:"BEEPSTART", fingerprint, total:records.length,
    collections:Object.fromEntries([...group.entries()].map(([k,v])=>[k,v.length])),
    references:"OK", duplicateKeys:0
  }, null, 2));
  process.exit(0);
}

const db = new PrismaClient();
let runId: string | null = null;

async function main() {
  const previous = await db.migrationRun.findUnique({ where:{ sourceFingerprint:fingerprint } });
  if (previous?.status === "COMPLETED") {
    console.log(`Migração já concluída para este backup. Run: ${previous.id}`);
    return;
  }
  if (previous?.status === "RUNNING") throw new Error(`Existe uma migração RUNNING para este backup: ${previous.id}`);

  const run = await db.migrationRun.create({
    data:{ source:"BEEPSTART", sourceFingerprint:fingerprint, total:records.length, status:"RUNNING" }
  });
  runId = run.id;

  try {
    const result = await db.$transaction(async tx => {
      const existingLegacy = await tx.legacyRecord.count({ where:{ legacyKey:{ in:records.map(keyOf)} } });
      if (existingLegacy) throw new Error(`Existem ${existingLegacy} registros legados já importados. A operação foi abortada para evitar duplicidade.`);

      const [existingCategories,existingSuppliers,existingCustomers,existingUsers,existingMethods,existingProducts] =
        await Promise.all([
          tx.category.findMany({select:{id:true,name:true}}),
          tx.supplier.findMany({select:{id:true,name:true}}),
          tx.customer.findMany({select:{id:true,name:true,cpfCnpj:true,phone:true}}),
          tx.user.findMany({select:{id:true,email:true}}),
          tx.paymentMethod.findMany({select:{id:true,name:true}}),
          tx.product.findMany({select:{id:true,code:true,barcode:true,description:true}})
        ]);

      const categoryMap = new Map(existingCategories.map(x=>[norm(x.name),x.id]));
      const supplierMap = new Map(existingSuppliers.map(x=>[norm(x.name),x.id]));
      const customerMap = new Map<string,string>();
      for (const c of existingCustomers) {
        if (c.cpfCnpj) customerMap.set(`cpf:${norm(c.cpfCnpj)}`,c.id);
        customerMap.set(`name:${norm(c.name)}|phone:${norm(c.phone)}`,c.id);
      }
      const userMap = new Map(existingUsers.map(x=>[norm(x.email),x.id]));
      const methodMap = new Map(existingMethods.map(x=>[norm(x.name),x.id]));
      const productMap = new Map<string,string>();
      for (const p of existingProducts) {
        if (p.code) productMap.set(`code:${norm(p.code)}`,p.id);
        if (p.barcode) productMap.set(`bar:${norm(p.barcode)}`,p.id);
        productMap.set(`desc:${norm(p.description)}`,p.id);
      }

      const warnings:string[]=[];
      const targetByKey = new Map<string,{entity:string;id:string}>();

      const newCategories = all("Categoria").filter(c=>!categoryMap.has(norm(first(c,["description","name"]))));
      const categoryRows = newCategories.map(c=>({id:crypto.randomUUID(),name:text(first(c,["description","name"]))||`Categoria ${id(c)}`,active:true}));
      if(categoryRows.length) await tx.category.createMany({data:categoryRows});
      for(let i=0;i<newCategories.length;i++) categoryMap.set(norm(categoryRows[i].name),categoryRows[i].id);
      for(const c of all("Categoria")) targetByKey.set(keyOf(c),{entity:"Category",id:categoryMap.get(norm(first(c,["description","name"])))!});

      const newSuppliers = all("Fornecedor").filter(s=>!supplierMap.has(norm(first(s,["name","description"]))));
      const supplierRows = newSuppliers.map(s=>({id:crypto.randomUUID(),name:text(first(s,["name","description"]))||`Fornecedor ${id(s)}`,document:text(first(s,["cnpj","cpfCnpj","document"])),phone:text(first(s,["phone","telefone"])),email:text(first(s,["email"])),notes:"Importado do BeepStart",active:true}));
      if(supplierRows.length) await tx.supplier.createMany({data:supplierRows});
      for(const r of supplierRows) supplierMap.set(norm(r.name),r.id);
      for(const s of all("Fornecedor")) targetByKey.set(keyOf(s),{entity:"Supplier",id:supplierMap.get(norm(first(s,["name","description"])))!});

      const legacyUsers = all("Usuario");
      const userRows = legacyUsers.filter(u=>!userMap.has(`beepstart-${id(u)}@legacy.invalid`)).map(u=>({
        id:crypto.randomUUID(),name:text(first(u,["name","nome","description"]))||`Usuário legado ${id(u)}`,
        email:`beepstart-${id(u)}@legacy.invalid`,role:UserRole.VENDEDOR,active:false,passwordHash:null
      }));
      if(userRows.length) await tx.user.createMany({data:userRows});
      for(const u of legacyUsers) {
        const email=`beepstart-${id(u)}@legacy.invalid`;
        let uid=userMap.get(norm(email));
        if(!uid){ const row=userRows.find(x=>x.email===email); uid=row?.id; }
        if(uid) userMap.set(norm(email),uid), targetByKey.set(keyOf(u),{entity:"User",id:uid});
      }

      const methodRows = all("MeioPG").filter(m=>!methodMap.has(norm(first(m,["description","name"])))).map(m=>({
        id:crypto.randomUUID(),name:text(first(m,["description","name"]))||`Meio ${id(m)}`,
        isCash:/dinheiro|esp[eé]cie|cash/i.test(String(first(m,["description","name"])||"")),active:true
      }));
      if(methodRows.length) await tx.paymentMethod.createMany({data:methodRows});
      for(const m of methodRows) methodMap.set(norm(m.name),m.id);
      for(const m of all("MeioPG")) targetByKey.set(keyOf(m),{entity:"PaymentMethod",id:methodMap.get(norm(first(m,["description","name"])))!});

      const customerRows:any[]=[];
      const addressRows:any[]=[];
      const addressByLegacy = new Map<string,R>();
      for(const a of all("EnderecoLocal")) if(id(a)) addressByLegacy.set(String(id(a)),a);
      for(const c of all("Cliente")){
        const cpf=text(first(c,["cnp","cpf","cpfCnpj","document"]));
        const phone=text(first(c,["phone","telefone"]));
        const name=text(first(c,["name","nome"]))||`Cliente ${id(c)}`;
        let cid=cpf?customerMap.get(`cpf:${norm(cpf)}`):undefined;
        if(!cid) cid=customerMap.get(`name:${norm(name)}|phone:${norm(phone)}`);
        if(!cid){
          cid=crypto.randomUUID();
          customerRows.push({id:cid,name,cpfCnpj:cpf||null,phone:phone||null,whatsapp:text(first(c,["whatsapp"])),email:text(first(c,["email"])),notes:"Importado do BeepStart",active:true});
          if(cpf) customerMap.set(`cpf:${norm(cpf)}`,cid);
          customerMap.set(`name:${norm(name)}|phone:${norm(phone)}`,cid);
        } else if(cpf && customerRows.some(x=>x.cpfCnpj===cpf)) warnings.push(`Cliente ${id(c)}: CPF duplicado consolidado.`);
        targetByKey.set(keyOf(c),{entity:"Customer",id:cid});
        const aid=first(c,["enderecoID","enderecoId","addressId"]);
        const a=aid?addressByLegacy.get(String(aid)):null;
        if(a){
          addressRows.push({id:crypto.randomUUID(),customerId:cid,label:"BeepStart",street:text(first(a,["street","rua","logradouro"])),number:text(first(a,["number","numero"])),complement:text(first(a,["complement","complemento"])),district:text(first(a,["district","bairro"])),city:text(first(a,["city","cidade"])),state:text(first(a,["state","estado","uf"])),postalCode:text(first(a,["postalCode","cep"]))});
        }
      }
      if(customerRows.length) await tx.customer.createMany({data:customerRows});
      if(addressRows.length) await tx.address.createMany({data:addressRows});

      const productRows:any[]=[];
      for(const p of all("Produto")){
        const barcode=text(first(p,["barcode","codigoBarras","ean"]));
        const description=text(first(p,["description","descricao","name"]))||`Produto ${id(p)}`;
        let pid=barcode?productMap.get(`bar:${norm(barcode)}`):undefined;
        if(!pid) pid=productMap.get(`code:${norm(id(p))}`);
        if(!pid) pid=productMap.get(`desc:${norm(description)}`);
        if(!pid){
          pid=crypto.randomUUID();
          let code=String(id(p));
          if(productMap.has(`code:${norm(code)}`)) code=`BS-${code}`;
          productRows.push({id:pid,code,barcode:barcode||null,description,unit:text(first(p,["medida","unidade"]))||"UN",cost:dec(first(p,["custo","cost"])),salePrice:dec(first(p,["venda","salePrice","preco"])),minimumStock:dec(first(p,["estoqueMinimo","minimumStock"])),categoryId:first(p,["categoriaID","categoriaId"])?categoryMap.get(norm(first(p,["categoriaID","categoriaId"])))||null:null,supplierId:first(p,["fornecedorID","fornecedorId"])?supplierMap.get(norm(first(p,["fornecedorID","fornecedorId"])))||null:null,active:true});
          productMap.set(`code:${norm(code)}`,pid);
          if(barcode) productMap.set(`bar:${norm(barcode)}`,pid);
          productMap.set(`desc:${norm(description)}`,pid);
        }
        targetByKey.set(keyOf(p),{entity:"Product",id:pid});
      }
      if(productRows.length) await tx.product.createMany({data:productRows});

      const orderSaleLink = new Map<string,string>();
      for(const o of all("Ordem")){
        const vid=first(o,["vendaID","vendaId"]); if(vid) orderSaleLink.set(String(vid),String(id(o)));
      }
      const orderRows:any[]=[];
      const orderItems:any[]=[];
      const orderTarget = new Map<string,string>();
      for(const o of all("Ordem")){
        const oid=crypto.randomUUID(); orderTarget.set(String(id(o)),oid);
        const customerId=first(o,["clienteID","clienteId"])?customerMap.get(`cpf:${norm(first(o,["clienteID","clienteId"]))}`):undefined;
        const customerLegacy=first(o,["clienteID","clienteId"]);
        const cid=customerLegacy?targetByKey.get(keyOf(all("Cliente").find(c=>String(id(c))===String(customerLegacy))||{}))?.id:undefined;
        if(!cid) throw new Error(`Ordem ${id(o)} sem cliente de destino.`);
        const procedures=first(o,["procedimentosIDs","procedures"])||{};
        const values=first(o,["valoresIDs","values"])||{};
        orderRows.push({id:oid,number:Number(first(o,["numeracao","number"]))||undefined,customerId:cid,status:OrderStatus.PEDIDO,dueDate:date(first(o,["prazo","dueDate"])),notes:text(first(o,["observacoes","notes"])),createdAt:date(first(o,["aberto","openedAt"]))||new Date(),updatedAt:new Date(),total:dec(Object.keys(procedures).reduce((sum,k)=>sum+money(procedures[k])*money(values[k]),0))});
        for(const productId of Object.keys(procedures)){
          const pid=productMap.get(`code:${norm(productId)}`)||productMap.get(`code:${norm(`BS-${productId}`)}`);
          orderItems.push({id:crypto.randomUUID(),orderId:oid,productId:pid||null,description:pid?String(productId):`Legado ${productId}`,kind:"LEGADO",quantity:dec(procedures[productId]||1),unitPrice:dec(values[productId])});
        }
        targetByKey.set(keyOf(o),{entity:"OpticalOrder",id:oid});
      }
      if(orderRows.length) await tx.opticalOrder.createMany({data:orderRows});
      if(orderItems.length) await tx.opticalOrderItem.createMany({data:orderItems});

      const saleRows:any[]=[]; const saleItems:any[]=[]; const paymentRows:any[]=[];
      const saleTarget=new Map<string,string>();
      for(const v of all("Venda")){
        const sid=crypto.randomUUID(); saleTarget.set(String(id(v)),sid);
        const customerLegacy=first(v,["clienteID","clienteId"]);
        const cid=customerLegacy?targetByKey.get(keyOf(all("Cliente").find(c=>String(id(c))===String(customerLegacy))||{}))?.id:null;
        const userLegacy=first(v,["usuarioID","usuarioId"]);
        const userObj=all("Usuario").find(u=>String(id(u))===String(userLegacy));
        const sellerId=userObj?targetByKey.get(keyOf(userObj))?.id:null;
        if(!sellerId) throw new Error(`Venda ${id(v)} sem vendedor legado mapeado.`);
        const quantities=first(v,["quantidadesIDs"])||{}; const values=first(v,["valoresIDs"])||{}; const costs=first(v,["custosIDs"])||{};
        const items=Object.keys(quantities);
        const total=items.reduce((sum,k)=>sum+money(quantities[k])*money(values[k]),0);
        const oid=orderSaleLink.get(String(id(v))); const orderId=oid?orderTarget.get(oid):null;
        saleRows.push({id:sid,customerId:cid||null,sellerId,orderId:orderId||null,subtotal:dec(total),total:dec(total),canceled:false,createdAt:date(first(v,["data","createdAt"]))||new Date(),notes:"Importado do BeepStart"});
        for(const productId of items){
          const pid=productMap.get(`code:${norm(productId)}`)||productMap.get(`code:${norm(`BS-${productId}`)}`);
          saleItems.push({id:crypto.randomUUID(),saleId:sid,productId:pid||null,description:pid?String(productId):`Legado ${productId}`,quantity:dec(quantities[productId]),unitPrice:dec(values[productId]),unitCost:dec(costs[productId]),total:dec(money(quantities[productId])*money(values[productId]))});
        }
        const payments=first(v,["pagamentosIDs"])||{};
        for(const [methodLegacy,value] of Object.entries(payments as R)){
          const methodObj=all("MeioPG").find(m=>String(id(m))===String(methodLegacy));
          const methodId=methodObj?targetByKey.get(keyOf(methodObj))?.id:null;
          if(methodId) {
            const pair=Array.isArray(value)?value:[1,value];
            paymentRows.push({id:crypto.randomUUID(),saleId:sid,methodId,amount:dec(pair[1]),paidAt:date(first(v,["data","createdAt"]))||new Date()});
          } else warnings.push(`Venda ${id(v)}: meio de pagamento legado ${methodLegacy} não mapeado.`);
        }
        targetByKey.set(keyOf(v),{entity:"Sale",id:sid});
      }
      if(saleRows.length) await tx.sale.createMany({data:saleRows});
      if(saleItems.length) await tx.saleItem.createMany({data:saleItems});
      if(paymentRows.length) await tx.payment.createMany({data:paymentRows});

      const accountRows:any[]=[];
      for(const a of all("ContaAReceber")){
        const customerLegacy=first(a,["clienteID","clienteId"]); const saleLegacy=first(a,["vendaID","vendaId"]);
        const cid=customerLegacy?targetByKey.get(keyOf(all("Cliente").find(c=>String(id(c))===String(customerLegacy))||{}))?.id:null;
        const sid=saleLegacy?saleTarget.get(String(saleLegacy)):null;
        const installments=Array.isArray(a.parcelas)?a.parcelas:[money(a.valor)];
        const dueDates=Array.isArray(a.vencimentos)?a.vencimentos:[first(a,["vencimento","dueDate"])];
        for(let i=0;i<Math.max(installments.length,1);i++){
          const amount=money(installments[i] ?? a.valor); const due=date(dueDates[i] ?? dueDates[0])||new Date();
          const paid=Array.isArray(a.pagos)&&a.pagos[i]?amount:0;
          accountRows.push({id:crypto.randomUUID(),type:AccountType.RECEBER,description:`${text(first(a,["descricao","description"]))||"Conta a receber"} ${installments.length>1?`-${i+1}/${installments.length}`:""}`,customerId:cid||null,saleId:sid||null,dueDate:due,amount:dec(amount),paidAmount:dec(paid),status:paid>=amount?PaymentStatus.PAGO:PaymentStatus.PENDENTE,notes:text(first(a,["observacoes","notes"]))});
        }
        targetByKey.set(keyOf(a),{entity:"Account",id:accountRows[accountRows.length-1].id});
      }
      for(const a of all("ContaAPagar")){
        const supplierName=text(first(a,["credor","fornecedor","supplier"])); const supplierId=supplierName?supplierMap.get(norm(supplierName)):null;
        const installments=Array.isArray(a.parcelas)?a.parcelas:[money(a.valor)];
        const dueDates=Array.isArray(a.vencimentos)?a.vencimentos:[first(a,["vencimento","dueDate"])];
        const paidDates=Array.isArray(a.pagos)?a.pagos:[];
        for(let i=0;i<Math.max(installments.length,1);i++){
          const amount=money(installments[i] ?? a.valor); const due=date(dueDates[i] ?? dueDates[0])||new Date();
          const paid=paidDates[i]?amount:0;
          accountRows.push({id:crypto.randomUUID(),type:AccountType.PAGAR,description:`${text(first(a,["descricao","description"]))||"Conta a pagar"} ${installments.length>1?`-${i+1}/${installments.length}`:""}`,supplierId:supplierId||null,dueDate:due,amount:dec(amount),paidAmount:dec(paid),status:paid>=amount?PaymentStatus.PAGO:PaymentStatus.PENDENTE,notes:text(first(a,["observacoes","notes"]))});
        }
        targetByKey.set(keyOf(a),{entity:"Account",id:accountRows[accountRows.length-1].id});
      }
      if(accountRows.length) await tx.account.createMany({data:accountRows});

      const lotRows:any[]=[];
      for(const l of all("Lote")){
        const productLegacy=first(l,["produtoID","produtoId"]); const pid=productLegacy?productMap.get(`code:${norm(productLegacy)}`)||productMap.get(`code:${norm(`BS-${productLegacy}`)}`):null;
        if(!pid){ warnings.push(`Lote ${id(l)}: produto não mapeado; preservado somente no legado.`); continue; }
        lotRows.push({id:crypto.randomUUID(),productId:pid,code:text(first(l,["codigo","code","numero"])),description:text(first(l,["descricao","description"])),receivedAt:date(first(l,["entrada","receivedAt"]))||new Date(),quantity:dec(first(l,["quantidade","quantity","saldo"])),cost:dec(first(l,["custo","cost"])),expiresAt:date(first(l,["validade","expiresAt"])),archived:bool(first(l,["archived"]))});
        targetByKey.set(keyOf(l),{entity:"StockLot",id:lotRows[lotRows.length-1].id});
      }
      if(lotRows.length) await tx.stockLot.createMany({data:lotRows});

      const movementRows:any[]=[];
      const movementType=(v:any):StockMovementType=>{
        const n=norm(v);
        if(n.includes("entrada")||n==="in"||n==="compra") return StockMovementType.ENTRADA;
        if(n.includes("saida")||n.includes("venda")||n==="out") return StockMovementType.SAIDA;
        if(n.includes("devol")) return StockMovementType.DEVOLUCAO;
        if(n.includes("transf")) return StockMovementType.TRANSFERENCIA;
        return StockMovementType.AJUSTE;
      };
      for(const m of all("Movimentacao")){
        const productLegacy=first(m,["produtoID","produtoId","productId"]);
        const pid=productLegacy?productMap.get(`code:${norm(productLegacy)}`)||productMap.get(`code:${norm(`BS-${productLegacy}`)}`):null;
        if(!pid){ warnings.push(`Movimentação ${id(m)}: produto não mapeado; preservada somente no legado.`); continue; }
        movementRows.push({
          id:crypto.randomUUID(),productId:pid,
          type:movementType(first(m,["tipo","type","natureza","operacao"])),
          quantity:dec(Math.abs(money(first(m,["quantidade","quantity","qtd"])))),
          unitCost:dec(first(m,["custo","unitCost","valorUnitario"])),
          reference:text(first(m,["referencia","reference"])),
          referenceId:text(first(m,["referenciaID","referenceId","vendaID","vendaId"])),
          notes:text(first(m,["observacoes","notes","descricao","description"])),
          createdAt:date(first(m,["data","createdAt","created"]))||new Date()
        });
        targetByKey.set(keyOf(m),{entity:"StockMovement",id:movementRows[movementRows.length-1].id});
      }
      if(movementRows.length) await tx.stockMovement.createMany({data:movementRows});

      const legacyRows=records.map(r=>{
        const t=targetByKey.get(keyOf(r));
        return {id:crypto.randomUUID(),source:"BEEPSTART",collectionKey:String(r.collection_key??"SEM_COLLECTION"),legacyId:id(r),legacyKey:keyOf(r),payload:r,customerId:t?.entity==="Customer"?t.id:null,migrationRunId:run.id,targetEntity:t?.entity||null,targetId:t?.id||null,status:t?"IMPORTED":"PRESERVED"};
      });
      await tx.legacyRecord.createMany({data:legacyRows});

      const mapped=legacyRows.filter(x=>x.targetId).length;
      return {mapped,warnings};
    }, {maxWait:10000,timeout:120000,isolationLevel:Prisma.TransactionIsolationLevel.Serializable});

    const report={source:"BEEPSTART",fingerprint,total:records.length,mapped:result.mapped,warnings:result.warnings.length,errors:0,status:"COMPLETED",collections:Object.fromEntries([...group.entries()].map(([k,v])=>[k,v.length]))};
    await db.migrationRun.update({where:{id:run.id},data:{status:"COMPLETED",imported:records.length,mapped:result.mapped,warnings:result.warnings.length,errors:0,report,completedAt:new Date()}});
    console.log(JSON.stringify(report,null,2));
  } catch (error) {
    await db.migrationRun.update({where:{id:run.id},data:{status:"FAILED",errors:1,report:{status:"FAILED",error:String(error)},completedAt:new Date()}}).catch(()=>{});
    throw error;
  }
}

main().catch(error=>{ console.error("BEEPSTART MIGRATION FAILED:",error); process.exitCode=1; }).finally(()=>db.$disconnect());
