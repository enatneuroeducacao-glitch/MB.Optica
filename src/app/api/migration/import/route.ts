import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { Prisma, UserRole, OrderStatus, PaymentStatus, AccountType, StockMovementType } from "@prisma/client";

type R = Record<string, any>;
const EXPECTED_TOTAL = 5788;
const EXPECTED_COLLECTIONS = 29;

const norm = (v:any) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const text = (v:any) => typeof v === "string" ? v.trim() : v == null ? null : String(v);
const first = (o:R, keys:string[]) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k]; return null; };
const money = (v:any) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") { const n=Number(v.replace(/\./g,"").replace(",",".").replace(/[^0-9.-]/g,"")); return Number.isFinite(n)?n:0; }
  const n=Number(v); return Number.isFinite(n)?n:0;
};
const dec = (v:any) => new Prisma.Decimal(money(v).toFixed(2));
const date = (v:any):Date|null => {
  if(v===undefined||v===null||v==="") return null;
  if(typeof v==="number" || /^\d+$/.test(String(v))) { const n=Number(v), d=new Date(n<1e12?n*1000:n); return Number.isNaN(d.getTime())?null:d; }
  const d=new Date(String(v)); return Number.isNaN(d.getTime())?null:d;
};
const bool = (v:any) => v===true || v===1 || /^(true|1|sim|yes|concluido)$/i.test(String(v??""));
const id = (r:R) => r.id == null ? null : String(r.id);
const keyOf = (r:R) => `BEEPSTART:${String(r.collection_key ?? "SEM_COLLECTION")}:${id(r) ?? crypto.createHash("sha256").update(JSON.stringify(r)).digest("hex")}`;

export async function POST(request:Request){
  let runId:string|null=null;
  try{
    await requireRole(["ADMIN"]);
    const body=await request.json();
    const records=body?.records;
    const fingerprint=typeof body?.fingerprint==="string"?body.fingerprint:"";
    if(!Array.isArray(records)) return NextResponse.json({ok:false,error:"A importação precisa receber os registros auditados."},{status:400});
    if(!/^[a-f0-9]{64}$/i.test(fingerprint)) return NextResponse.json({ok:false,error:"Fingerprint inválido."},{status:400});
    const typed=records as R[];
    if(typed.length!==EXPECTED_TOTAL) return NextResponse.json({ok:false,error:`Contagem divergente: esperado ${EXPECTED_TOTAL}, recebido ${typed.length}.`},{status:400});

    const groups=new Map<string,R[]>();
    const seen=new Set<string>(); const duplicates=new Set<string>();
    for(const r of typed){
      const k=String(r.collection_key??"SEM_COLLECTION"); const a=groups.get(k)??[]; a.push(r); groups.set(k,a);
      const legacyKey=keyOf(r); if(seen.has(legacyKey)) duplicates.add(legacyKey); seen.add(legacyKey);
    }
    if(groups.size!==EXPECTED_COLLECTIONS || duplicates.size) return NextResponse.json({ok:false,error:"O arquivo não corresponde à auditoria aprovada.",audit:{total:typed.length,collections:groups.size,duplicateKeys:duplicates.size}},{status:400});

    const canonicalFingerprint=crypto.createHash("sha256").update(JSON.stringify(typed)).digest("hex");
    if(canonicalFingerprint.toLowerCase()!==fingerprint.toLowerCase()) return NextResponse.json({ok:false,error:"O conteúdo recebido não corresponde ao fingerprint auditado. Execute a auditoria novamente."},{status:409});

    const previous=await db.migrationRun.findUnique({where:{sourceFingerprint:fingerprint}});
    if(previous?.status==="COMPLETED") return NextResponse.json({ok:false,error:"Este backup já foi importado com sucesso.",runId:previous.id},{status:409});
    if(previous?.status==="RUNNING") return NextResponse.json({ok:false,error:"Já existe uma importação em andamento para este backup.",runId:previous.id},{status:409});

    const existingLegacy=await db.legacyRecord.count({where:{legacyKey:{in:typed.map(keyOf)}}});
    if(existingLegacy) return NextResponse.json({ok:false,error:`Existem ${existingLegacy} registros legados já preservados para este backup. Importação abortada.`},{status:409});

    const run=await db.migrationRun.create({data:{source:"BEEPSTART",sourceFingerprint:fingerprint,total:typed.length,status:"RUNNING"}});
    runId=run.id;

    const result=await db.$transaction(async tx=>{
      const [cats,sups,custs,users,methods,products]=await Promise.all([
        tx.category.findMany({select:{id:true,name:true}}),
        tx.supplier.findMany({select:{id:true,name:true}}),
        tx.customer.findMany({select:{id:true,name:true,cpfCnpj:true,phone:true}}),
        tx.user.findMany({select:{id:true,email:true}}),
        tx.paymentMethod.findMany({select:{id:true,name:true}}),
        tx.product.findMany({select:{id:true,code:true,barcode:true,description:true}})
      ]);
      const all=(k:string)=>groups.get(k)??[];
      const categoryMap=new Map(cats.map(x=>[norm(x.name),x.id]));
      const categoryLegacyMap=new Map<string,string>();
      const supplierMap=new Map(sups.map(x=>[norm(x.name),x.id]));
      const supplierLegacyMap=new Map<string,string>();
      const methodMap=new Map(methods.map(x=>[norm(x.name),x.id]));
      const userMap=new Map(users.map(x=>[norm(x.email),x.id]));
      const customerMap=new Map<string,string>();
      for(const c of custs){ if(c.cpfCnpj) customerMap.set(`cpf:${norm(c.cpfCnpj)}`,c.id); customerMap.set(`name:${norm(c.name)}|phone:${norm(c.phone)}`,c.id); }
      const productMap=new Map<string,string>();
      for(const p of products){ if(p.code) productMap.set(`code:${norm(p.code)}`,p.id); if(p.barcode) productMap.set(`bar:${norm(p.barcode)}`,p.id); productMap.set(`desc:${norm(p.description)}`,p.id); }
      const targetByKey=new Map<string,{entity:string;id:string}>();
      const warnings:string[]=[];

      const categoryGroups=new Map<string,R[]>();
      for(const x of all("Categoria")){ const name=text(first(x,["description","name"]))||`Categoria ${id(x)}`; const k=norm(name); const a=categoryGroups.get(k)??[]; a.push(x); categoryGroups.set(k,a); }
      for(const [nameKey,rows] of categoryGroups){
        let cid=categoryMap.get(nameKey);
        if(!cid){ const row=await tx.category.create({data:{id:crypto.randomUUID(),name:text(first(rows[0],["description","name"]))||`Categoria ${id(rows[0])}`,active:true}}); cid=row.id; categoryMap.set(nameKey,cid); }
        for(const x of rows){ const legacyId=id(x); if(legacyId) categoryLegacyMap.set(legacyId,cid); targetByKey.set(keyOf(x),{entity:"Category",id:cid}); }
      }

      for(const x of all("Fornecedor")){
        const name=text(first(x,["name","description"]))||`Fornecedor ${id(x)}`; const nameKey=norm(name);
        let sid=supplierMap.get(nameKey);
        if(!sid){ const row=await tx.supplier.create({data:{id:crypto.randomUUID(),name,document:text(first(x,["cnpj","cpfCnpj","document"])),phone:text(first(x,["phone","telefone"])),email:text(first(x,["email"])),notes:"Importado do BeepStart",active:true}}); sid=row.id; }
        const legacyId=id(x); if(legacyId) supplierLegacyMap.set(legacyId,sid); targetByKey.set(keyOf(x),{entity:"Supplier",id:sid});
      }
      for(const u of all("Usuario")){
        const email=`beepstart-${id(u)}@legacy.invalid`; let uid=userMap.get(norm(email));
        if(!uid){ const row=await tx.user.create({data:{id:crypto.randomUUID(),name:text(first(u,["name","nome","description"]))||`Usuário legado ${id(u)}`,email,role:UserRole.VENDEDOR,active:false}}); uid=row.id; userMap.set(norm(email),uid); }
        targetByKey.set(keyOf(u),{entity:"User",id:uid});
      }

      for(const m of all("MeioPG")){
        const name=text(first(m,["description","name"]))||`Meio ${id(m)}`; let mid=methodMap.get(norm(name));
        if(!mid){ const row=await tx.paymentMethod.create({data:{id:crypto.randomUUID(),name,isCash:/dinheiro|esp[eé]cie|cash/i.test(name),active:true}}); mid=row.id; methodMap.set(norm(name),mid); }
        targetByKey.set(keyOf(m),{entity:"PaymentMethod",id:mid});
      }

      const addressByLegacy=new Map<string,R>();
      for(const a of all("EnderecoLocal")) if(id(a)) addressByLegacy.set(id(a)!,a);
      for(const c of all("Cliente")){
        const cpf=text(first(c,["cnp","cpf","cpfCnpj","document"])); const phone=text(first(c,["phone","telefone"]));
        const name=text(first(c,["name","nome"]))||`Cliente ${id(c)}`;
        let cid=cpf?customerMap.get(`cpf:${norm(cpf)}`):undefined; if(!cid) cid=customerMap.get(`name:${norm(name)}|phone:${norm(phone)}`);
        if(!cid){ const row=await tx.customer.create({data:{id:crypto.randomUUID(),name,cpfCnpj:cpf||null,phone:phone||null,whatsapp:text(first(c,["whatsapp"])),email:text(first(c,["email"])),notes:"Importado do BeepStart",active:true}}); cid=row.id; }
        targetByKey.set(keyOf(c),{entity:"Customer",id:cid});
        const aid=first(c,["enderecoID","enderecoId","addressId"]); const a=aid?addressByLegacy.get(String(aid)):null;
        if(a) await tx.address.create({data:{id:crypto.randomUUID(),customerId:cid,label:"BeepStart",street:text(first(a,["street","rua","logradouro"])),number:text(first(a,["number","numero"])),complement:text(first(a,["complement","complemento"])),district:text(first(a,["district","bairro"])),city:text(first(a,["city","cidade"])),state:text(first(a,["state","estado","uf"])),postalCode:text(first(a,["postalCode","cep"]))}});
      }

      for(const p of all("Produto")){
        const barcode=text(first(p,["barcode","codigoBarras","ean"])); const description=text(first(p,["description","descricao","name"]))||`Produto ${id(p)}`;
        let pid=barcode?productMap.get(`bar:${norm(barcode)}`):undefined; if(!pid) pid=productMap.get(`code:${norm(id(p))}`); if(!pid) pid=productMap.get(`desc:${norm(description)}`);
        if(!pid){
          let code=String(id(p)); if(productMap.has(`code:${norm(code)}`)) code=`BS-${code}`;
          const row=await tx.product.create({data:{id:crypto.randomUUID(),code,barcode:barcode||null,description,unit:text(first(p,["medida","unidade"]))||"UN",cost:dec(first(p,["custo","cost"])),salePrice:dec(first(p,["venda","salePrice","preco"])),minimumStock:dec(first(p,["estoqueMinimo","minimumStock"])),categoryId:first(p,["categoriaID","categoriaId"])?categoryLegacyMap.get(String(first(p,["categoriaID","categoriaId"])))||null:null,supplierId:first(p,["fornecedorID","fornecedorId"])?supplierLegacyMap.get(String(first(p,["fornecedorID","fornecedorId"])))||null:null,active:true}}); pid=row.id; productMap.set(`code:${norm(code)}`,pid); if(barcode) productMap.set(`bar:${norm(barcode)}`,pid); productMap.set(`desc:${norm(description)}`,pid);
        }
        targetByKey.set(keyOf(p),{entity:"Product",id:pid});
      }

      const orderTarget=new Map<string,string>(); const saleTarget=new Map<string,string>();
      const orderSaleLink=new Map<string,string>();
      for(const o of all("Ordem")){ const v=first(o,["vendaID","vendaId"]); if(v) orderSaleLink.set(String(v),String(id(o))); }
      for(const o of all("Ordem")){
        const customerLegacy=first(o,["clienteID","clienteId"]);
        const customer=customerLegacy?all("Cliente").find(c=>String(id(c))===String(customerLegacy)):null;
        const cid=customer?targetByKey.get(keyOf(customer))?.id:null; if(!cid) throw new Error(`Ordem ${id(o)} sem cliente de destino.`);
        const sellerLegacy=first(o,["prestadorID","prestadorId"]); const seller=sellerLegacy?all("Usuario").find(u=>String(id(u))===String(sellerLegacy)):null; const sellerId=seller?targetByKey.get(keyOf(seller))?.id:null;
        const procedures=first(o,["procedimentosIDs","procedures"])||{}; const values=first(o,["valoresIDs","values"])||{};
        const orderTotal=Object.keys(procedures).reduce((sum,k)=>sum+money(procedures[k])*money(values[k]),0);
        const row=await tx.opticalOrder.create({data:{id:crypto.randomUUID(),number:Number(first(o,["numeracao","number"]))||undefined,customerId:cid,sellerId:sellerId||null,status:OrderStatus.PEDIDO,dueDate:date(first(o,["prazo","dueDate"])),notes:text(first(o,["observacoes","notes"])),createdAt:date(first(o,["aberto","openedAt"]))||new Date(),updatedAt:new Date(),total:dec(orderTotal)}});
        orderTarget.set(String(id(o)),row.id); targetByKey.set(keyOf(o),{entity:"OpticalOrder",id:row.id});
        for(const productId of Object.keys(procedures)){ const pid=productMap.get(`code:${norm(productId)}`)||productMap.get(`code:${norm(`BS-${productId}`)}`); await tx.opticalOrderItem.create({data:{id:crypto.randomUUID(),orderId:row.id,productId:pid||null,description:pid?String(productId):`Legado ${productId}`,kind:"LEGADO",quantity:dec(procedures[productId]||1),unitPrice:dec(values[productId])}}); }
      }

      for(const v of all("Venda")){
        const customerLegacy=first(v,["clienteID","clienteId"]); const customer=customerLegacy?all("Cliente").find(c=>String(id(c))===String(customerLegacy)):null; const cid=customer?targetByKey.get(keyOf(customer))?.id:null;
        const userLegacy=first(v,["usuarioID","usuarioId"]); const user=userLegacy?all("Usuario").find(u=>String(id(u))===String(userLegacy)):null; const sellerId=user?targetByKey.get(keyOf(user))?.id:null;
        if(!sellerId) throw new Error(`Venda ${id(v)} sem vendedor legado mapeado.`);
        const quantities=first(v,["quantidadesIDs"])||{}; const values=first(v,["valoresIDs"])||{}; const costs=first(v,["custosIDs"])||{}; const total=Object.keys(quantities).reduce((s,k)=>s+money(quantities[k])*money(values[k]),0);
        const legacyOrder=orderSaleLink.get(String(id(v))); const orderId=legacyOrder?orderTarget.get(legacyOrder):null;
        const row=await tx.sale.create({data:{id:crypto.randomUUID(),customerId:cid||null,sellerId,orderId:orderId||null,subtotal:dec(total),total:dec(total),canceled:false,createdAt:date(first(v,["data","createdAt"]))||new Date(),notes:"Importado do BeepStart"}});
        saleTarget.set(String(id(v)),row.id); targetByKey.set(keyOf(v),{entity:"Sale",id:row.id});
        for(const productId of Object.keys(quantities)){ const pid=productMap.get(`code:${norm(productId)}`)||productMap.get(`code:${norm(`BS-${productId}`)}`); await tx.saleItem.create({data:{id:crypto.randomUUID(),saleId:row.id,productId:pid||null,description:pid?String(productId):`Legado ${productId}`,quantity:dec(quantities[productId]),unitPrice:dec(values[productId]),unitCost:dec(costs[productId]),total:dec(money(quantities[productId])*money(values[productId]))}}); }
        const payments=first(v,["pagamentosIDs"])||{};
        for(const [methodLegacy,value] of Object.entries(payments as R)){ const method=all("MeioPG").find(m=>String(id(m))===String(methodLegacy)); const methodId=method?targetByKey.get(keyOf(method))?.id:null; if(methodId){ const pair=Array.isArray(value)?value:[1,value]; await tx.payment.create({data:{id:crypto.randomUUID(),saleId:row.id,methodId,amount:dec(pair[1]),paidAt:date(first(v,["data","createdAt"]))||new Date()}}); } else warnings.push(`Venda ${id(v)}: meio de pagamento ${methodLegacy} não mapeado.`); }
      }

      for(const a of all("ContaAReceber")){
        const customerLegacy=first(a,["clienteID","clienteId"]); const customer=customerLegacy?all("Cliente").find(c=>String(id(c))===String(customerLegacy)):null; const cid=customer?targetByKey.get(keyOf(customer))?.id:null;
        const saleLegacy=first(a,["vendaID","vendaId"]); const sid=saleLegacy?saleTarget.get(String(saleLegacy)):null;
        const installments=Array.isArray(a.parcelas)?a.parcelas:[money(a.valor)]; const dueDates=Array.isArray(a.vencimentos)?a.vencimentos:[first(a,["vencimento","dueDate"])];
        let lastAccountId:string|null=null;
        for(let i=0;i<Math.max(installments.length,1);i++){ const amount=money(installments[i]??a.valor); const due=date(dueDates[i]??dueDates[0])||new Date(); const paid=Array.isArray(a.pagos)&&a.pagos[i]?amount:0; const row=await tx.account.create({data:{id:crypto.randomUUID(),type:AccountType.RECEBER,description:`${text(first(a,["descricao","description"]))||"Conta a receber"} ${installments.length>1?`-${i+1}/${installments.length}`:""}`,customerId:cid||null,saleId:sid||null,dueDate:due,amount:dec(amount),paidAmount:dec(paid),status:paid>=amount?PaymentStatus.PAGO:PaymentStatus.PENDENTE,notes:text(first(a,["observacoes","notes"]))}}); lastAccountId=row.id; }
        if(lastAccountId) targetByKey.set(keyOf(a),{entity:"Account",id:lastAccountId});
      }
      for(const a of all("ContaAPagar")){
        const supplierName=text(first(a,["credor","fornecedor","supplier"])); const supplierId=supplierName?supplierMap.get(norm(supplierName)):null;
        const installments=Array.isArray(a.parcelas)?a.parcelas:[money(a.valor)]; const dueDates=Array.isArray(a.vencimentos)?a.vencimentos:[first(a,["vencimento","dueDate"])];
        let lastAccountId:string|null=null;
        for(let i=0;i<Math.max(installments.length,1);i++){ const amount=money(installments[i]??a.valor); const due=date(dueDates[i]??dueDates[0])||new Date(); const paid=Array.isArray(a.pagos)&&a.pagos[i]?amount:0; const row=await tx.account.create({data:{id:crypto.randomUUID(),type:AccountType.PAGAR,description:`${text(first(a,["descricao","description"]))||"Conta a pagar"} ${installments.length>1?`-${i+1}/${installments.length}`:""}`,supplierId:supplierId||null,dueDate:due,amount:dec(amount),paidAmount:dec(paid),status:paid>=amount?PaymentStatus.PAGO:PaymentStatus.PENDENTE,notes:text(first(a,["observacoes","notes"]))}}); lastAccountId=row.id; }
        if(lastAccountId) targetByKey.set(keyOf(a),{entity:"Account",id:lastAccountId});
      }

      for(const l of all("Lote")){
        const legacy=first(l,["produtoID","produtoId"]); const pid=legacy?productMap.get(`code:${norm(legacy)}`)||productMap.get(`code:${norm(`BS-${legacy}`)}`):null;
        if(!pid){warnings.push(`Lote ${id(l)}: produto não mapeado; preservado no legado.`);continue;}
        const row=await tx.stockLot.create({data:{id:crypto.randomUUID(),productId:pid,code:text(first(l,["codigo","code","numero"])),description:text(first(l,["descricao","description"])),receivedAt:date(first(l,["entrada","receivedAt"]))||new Date(),quantity:dec(first(l,["quantidade","quantity","saldo"])),cost:dec(first(l,["custo","cost"])),expiresAt:date(first(l,["validade","expiresAt"])),archived:bool(first(l,["archived"]))}});
        targetByKey.set(keyOf(l),{entity:"StockLot",id:row.id});
      }

      const movementType=(v:any):StockMovementType=>{const n=norm(v);if(n.includes("entrada")||n==="in"||n==="compra")return StockMovementType.ENTRADA;if(n.includes("saida")||n.includes("venda")||n==="out")return StockMovementType.SAIDA;if(n.includes("devol"))return StockMovementType.DEVOLUCAO;if(n.includes("transf"))return StockMovementType.TRANSFERENCIA;return StockMovementType.AJUSTE;};
      for(const m of all("Movimentacao")){
        const legacy=first(m,["produtoID","produtoId","productId"]); const pid=legacy?productMap.get(`code:${norm(legacy)}`)||productMap.get(`code:${norm(`BS-${legacy}`)}`):null;
        if(!pid){warnings.push(`Movimentação ${id(m)}: produto não mapeado; preservada no legado.`);continue;}
        const row=await tx.stockMovement.create({data:{id:crypto.randomUUID(),productId:pid,type:movementType(first(m,["tipo","type","natureza","operacao"])),quantity:dec(Math.abs(money(first(m,["quantidade","quantity","qtd"])))),unitCost:dec(first(m,["custo","unitCost","valorUnitario"])),reference:text(first(m,["referencia","reference"])),referenceId:text(first(m,["referenciaID","referenceId","vendaID","vendaId"])),notes:text(first(m,["observacoes","notes","descricao","description"])),createdAt:date(first(m,["data","createdAt","created"]))||new Date()}});
        targetByKey.set(keyOf(m),{entity:"StockMovement",id:row.id});
      }

      const legacyRows=typed.map(r=>{const t=targetByKey.get(keyOf(r));return {id:crypto.randomUUID(),source:"BEEPSTART",collectionKey:String(r.collection_key??"SEM_COLLECTION"),legacyId:id(r),legacyKey:keyOf(r),payload:r,customerId:t?.entity==="Customer"?t.id:null,migrationRunId:run.id,targetEntity:t?.entity||null,targetId:t?.id||null,status:t?"IMPORTED":"PRESERVED"};});
      await tx.legacyRecord.createMany({data:legacyRows});
      return {mapped:legacyRows.filter(x=>x.targetId).length,warnings};
    },{maxWait:10000,timeout:120000,isolationLevel:Prisma.TransactionIsolationLevel.Serializable});

    const report={source:"BEEPSTART",fingerprint,total:typed.length,mapped:result.mapped,warnings:result.warnings.length,errors:0,status:"COMPLETED",collections:Object.fromEntries([...groups.entries()].map(([k,v])=>[k,v.length]))};
    await db.migrationRun.update({where:{id:run.id},data:{status:"COMPLETED",imported:typed.length,mapped:result.mapped,warnings:result.warnings.length,errors:0,report,completedAt:new Date()}});
    return NextResponse.json({ok:true,report,runId:run.id});
  }catch(error){
    if(runId) await db.migrationRun.update({where:{id:runId},data:{status:"FAILED",errors:1,report:{status:"FAILED",error:String(error)},completedAt:new Date()}}).catch(()=>{});
    return apiError(error,"A importação transacional foi abortada. Nenhuma alteração parcial foi mantida.");
  }
}
