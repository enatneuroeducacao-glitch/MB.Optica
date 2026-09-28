import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import crypto from "node:crypto";

type R = Record<string, any>;
const EXPECTED_TOTAL = 5788;
const EXPECTED_COLLECTIONS = 29;

const norm = (v:any) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const text = (v:any) => typeof v === "string" ? v.trim() : v == null ? null : String(v);
const first = (o:R, keys:string[]) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k]; return null; };
const id = (r:R) => r.id == null ? null : String(r.id);
const keyOf = (r:R) => `BEEPSTART:${String(r.collection_key ?? "SEM_COLLECTION")}:${id(r) ?? crypto.createHash("sha256").update(JSON.stringify(r)).digest("hex")}`;

export async function POST(request: Request) {
  try {
    await requireRole(["ADMIN"]);
    const body = await request.json();
    const records = body?.records;
    const auditedFingerprint = typeof body?.fingerprint === "string" ? body.fingerprint : "";
    if (!Array.isArray(records)) {
      return NextResponse.json({ok:false,error:"O dry-run precisa receber a lista de registros auditada."},{status:400});
    }
    if (!/^[a-f0-9]{64}$/i.test(auditedFingerprint)) {
      return NextResponse.json({ok:false,error:"Fingerprint da auditoria ausente ou inválido. Execute a auditoria novamente."},{status:400});
    }
    const typed = records as R[];
    if (typed.length !== EXPECTED_TOTAL) {
      return NextResponse.json({ok:false,error:`Contagem divergente: esperado ${EXPECTED_TOTAL}, recebido ${typed.length}.`},{status:400});
    }

    const groups = new Map<string,R[]>();
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const r of typed) {
      const k = String(r.collection_key ?? "SEM_COLLECTION");
      const a = groups.get(k) ?? [];
      a.push(r); groups.set(k,a);
      const legacyKey = keyOf(r);
      if (seen.has(legacyKey)) duplicates.add(legacyKey);
      seen.add(legacyKey);
    }
    if (groups.size !== EXPECTED_COLLECTIONS || duplicates.size) {
      return NextResponse.json({ok:false,error:"O arquivo não corresponde à auditoria aprovada.",audit:{total:typed.length,collections:groups.size,duplicateKeys:duplicates.size}},{status:400});
    }

    const [categories,suppliers,customers,users,methods,products,legacyConflicts] = await Promise.all([
      db.category.findMany({select:{id:true,name:true}}),
      db.supplier.findMany({select:{id:true,name:true}}),
      db.customer.findMany({select:{id:true,name:true,cpfCnpj:true,phone:true}}),
      db.user.findMany({select:{id:true,email:true}}),
      db.paymentMethod.findMany({select:{id:true,name:true}}),
      db.product.findMany({select:{id:true,code:true,barcode:true,description:true}}),
      db.legacyRecord.count({where:{legacyKey:{in:typed.map(keyOf)}}}),
    ]);

    const categoryMap = new Map(categories.map(x=>[norm(x.name),x.id]));
    const supplierMap = new Map(suppliers.map(x=>[norm(x.name),x.id]));
    const methodMap = new Map(methods.map(x=>[norm(x.name),x.id]));
    const userMap = new Map(users.map(x=>[norm(x.email),x.id]));
    const productMap = new Map<string,string>();
    for (const p of products) {
      if (p.code) productMap.set(`code:${norm(p.code)}`,p.id);
      if (p.barcode) productMap.set(`bar:${norm(p.barcode)}`,p.id);
      productMap.set(`desc:${norm(p.description)}`,p.id);
    }
    const customerCpf = new Map<string,string>();
    const customerNamePhone = new Map<string,string>();
    for (const c of customers) {
      if (c.cpfCnpj) customerCpf.set(norm(c.cpfCnpj),c.id);
      customerNamePhone.set(`name:${norm(c.name)}|phone:${norm(c.phone)}`,c.id);
    }

    const counts = (collection:string) => groups.get(collection)?.length ?? 0;
    const mappedCollections=["Categoria","Fornecedor","Usuario","MeioPG","Cliente","EnderecoLocal","Produto","Ordem","Venda","ContaAReceber","ContaAPagar","Lote","Movimentacao"];
    const preservedOnlyCollections=[...groups.keys()].filter(k=>!mappedCollections.includes(k)).sort();

    const categorySourceIds=new Set((groups.get("Categoria")??[]).map(id).filter(Boolean));
    const supplierSourceIds=new Set((groups.get("Fornecedor")??[]).map(id).filter(Boolean));
    const categoryNames=new Map<string,string[]>();
    for(const r of groups.get("Categoria")??[]){ const name=norm(first(r,["description","name"])); const a=categoryNames.get(name)??[]; a.push(String(id(r))); categoryNames.set(name,a); }
    const supplierNames=new Map<string,string[]>();
    for(const r of groups.get("Fornecedor")??[]){ const name=norm(first(r,["name","description"])); const a=supplierNames.get(name)??[]; a.push(String(id(r))); supplierNames.set(name,a); }
    const categoryAliases=[...categoryNames.values()].filter(v=>v.length>1).length;
    const supplierAliases=[...supplierNames.values()].filter(v=>v.length>1).length;
    const productBarcodes=new Map<string,string[]>();
    for(const p of groups.get("Produto")??[]){ const barcode=String(first(p,["barcode","codigoBarras","ean"])??"").trim(); if(!barcode || norm(barcode)==="sem codigo") continue; const a=productBarcodes.get(norm(barcode))??[]; a.push(String(id(p))); productBarcodes.set(norm(barcode),a); }
    const duplicateBarcodeGroups=[...productBarcodes.entries()].filter(([,ids])=>ids.length>1);
    const supplierNamesSet=new Set((groups.get("Fornecedor")??[]).map(x=>norm(first(x,["name","description"]))));
    const payableCreditorRefs=(groups.get("ContaAPagar")??[]).map(x=>String(first(x,["credor","fornecedor","supplier"])??"").trim()).filter(Boolean);
    const unresolvedPayableCreditors=payableCreditorRefs.filter(x=>!supplierNamesSet.has(norm(x))).length;
    const customerCpfGroups=new Map<string,string[]>();
    for(const x of groups.get("Cliente")??[]){ const cpf=norm(first(x,["cnp","cpf","cpfCnpj","document"])); if(!cpf) continue; const a=customerCpfGroups.get(cpf)??[]; a.push(String(id(x))); customerCpfGroups.set(cpf,a); }
    const duplicateCustomerCpfGroups=[...customerCpfGroups.values()].filter(v=>v.length>1);

    const newCategories = (groups.get("Categoria")??[]).filter(r=>!categoryMap.has(norm(first(r,["description","name"]))));
    const newCategoryNames = new Set((groups.get("Categoria")??[]).filter(r=>!categoryMap.has(norm(first(r,["description","name"])))).map(r=>norm(first(r,["description","name"]))));
    const newSuppliers = (groups.get("Fornecedor")??[]).filter(r=>!supplierMap.has(norm(first(r,["name","description"]))));
    const newMethods = (groups.get("MeioPG")??[]).filter(r=>!methodMap.has(norm(first(r,["description","name"]))));
    const newUsers = (groups.get("Usuario")??[]).filter(r=>!userMap.has(`beepstart-${id(r)}@legacy.invalid`));

    let existingCustomers=0, newCustomers=0;
    for (const c of groups.get("Cliente")??[]) {
      const cpf = text(first(c,["cnp","cpf","cpfCnpj","document"]));
      const name = text(first(c,["name","nome"])) || `Cliente ${id(c)}`;
      const phone = text(first(c,["phone","telefone"]));
      if ((cpf && customerCpf.has(norm(cpf))) || customerNamePhone.has(`name:${norm(name)}|phone:${norm(phone)}`)) existingCustomers++;
      else newCustomers++;
    }

    let existingProducts=0, newProducts=0;
    for (const p of groups.get("Produto")??[]) {
      const barcode=text(first(p,["barcode","codigoBarras","ean"]));
      const description=text(first(p,["description","descricao","name"])) || `Produto ${id(p)}`;
      const found=(barcode && productMap.has(`bar:${norm(barcode)}`)) || productMap.has(`code:${norm(id(p))}`) || productMap.has(`desc:${norm(description)}`);
      if(found) existingProducts++; else newProducts++;
    }

    const warnings:string[]=[];
    const productSourceIds=new Set((groups.get("Produto")??[]).map(id).filter(Boolean));
    const missingItemRefs:{source:string;recordId:string;productId:string}[]=[];
    let itemRefsTotal=0;
    for(const source of ["Venda","Ordem"]){
      const field=source==="Venda"?"quantidadesIDs":"procedimentosIDs";
      for(const row of groups.get(source)??[]){
        for(const productId of Object.keys(first(row,[field])||{})){ itemRefsTotal++;
          if(!productSourceIds.has(String(productId))) missingItemRefs.push({source,recordId:String(id(row)),productId:String(productId)});
        }
      }
    }

    const referenceChecks: Array<{source:string;target:string;field:string;missing:number}> = [];
    const refs: [string,string,string][] = [
      ["Venda","Cliente","clienteID"],["Venda","Usuario","usuarioID"],["Venda","EnderecoLocal","enderecoID"],
      ["Produto","Categoria","categoriaID"],["Produto","Fornecedor","fornecedorID"],
      ["Lote","Produto","produtoID"],["Lote","Venda","vendaID"],
      ["Ordem","Cliente","clienteID"],["Ordem","Venda","vendaID"],
      ["ContaAReceber","Cliente","clienteID"],["ContaAReceber","Venda","vendaID"],
      ["Fornecedor","EnderecoLocal","enderecoID"],["Cliente","EnderecoLocal","enderecoID"],
      ["Evento","Cliente","clienteID"],["Evento","Ordem","ordemID"],
      ["Preco","Produto","produtoID"],["Servico","Categoria","categoriaID"],
      ["Veiculo","Cliente","clienteID"]
    ];
    for (const [source,target,field] of refs) {
      const targetIds = new Set((groups.get(target)??[]).map(id).filter(Boolean));
      const missing = (groups.get(source)??[]).filter(r => {
        const value = first(r,[field, field.replace(/ID$/,"Id")]);
        return value != null && value !== "" && !targetIds.has(String(value));
      }).length;
      referenceChecks.push({source,target,field,missing});
      if (missing) warnings.push(`${source}.${field} → ${target}: ${missing} referência(s) órfã(s).`);
    if(missingItemRefs.length) warnings.push(`Itens de Venda/Ordem apontam para ${missingItemRefs.length} produto(s) legado(s) que não existem na coleção Produto; serão preservados como item legado sem vínculo ao Produto.`);
    if(duplicateBarcodeGroups.length) warnings.push(`Há ${duplicateBarcodeGroups.length} grupos de códigos de barras duplicados em Produto. O campo barcode é único no MB Óptica; a importação não deve resolver isso automaticamente.`);
    if(unresolvedPayableCreditors) warnings.push(`Há ${unresolvedPayableCreditors} contas a pagar cujo credor é texto livre e não corresponde a um fornecedor do legado; elas serão preservadas sem vínculo operacional com Supplier.`);
    }

    const mappedEstimate =
      counts("Categoria")+counts("Fornecedor")+counts("Usuario")+counts("MeioPG")+
      counts("Cliente")+counts("EnderecoLocal")+counts("Produto")+counts("Ordem")+
      counts("Venda")+counts("ContaAReceber")+counts("ContaAPagar")+counts("Lote")+counts("Movimentacao");

    const report = {
      mode:"DRY_RUN",
      source:"BEEPSTART",
      fingerprint:auditedFingerprint,
      total:typed.length,
      collections:groups.size,
      duplicateKeys:0,
      legacyConflicts,
      references:referenceChecks,
      sourceCounts:Object.fromEntries([...groups.entries()].map(([k,v])=>[k,v.length]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))),
      plan:{
        categories:{source:counts("Categoria"),existing:counts("Categoria")-newCategories.length,create:newCategoryNames.size},
        suppliers:{source:counts("Fornecedor"),existing:counts("Fornecedor")-newSuppliers.length,create:newSuppliers.length},
        users:{source:counts("Usuario"),existing:counts("Usuario")-newUsers.length,create:newUsers.length},
        paymentMethods:{source:counts("MeioPG"),existing:counts("MeioPG")-newMethods.length,create:newMethods.length},
        customers:{source:counts("Cliente"),existing:existingCustomers,create:newCustomers},
        products:{source:counts("Produto"),existing:existingProducts,create:newProducts},
        orders:counts("Ordem"),
        sales:counts("Venda"),
        receivableAccounts:counts("ContaAReceber"),
        payableAccounts:counts("ContaAPagar"),
        lots:counts("Lote"),
        movements:counts("Movimentacao"),
        preservedLegacyRecords:typed.length,
        mappedSourceCollectionsEstimate:mappedEstimate,
        mappingAudit:{
          itemReferences:{totalChecked:itemRefsTotal,missingProductRefs:missingItemRefs.length,missingProductRefDetails:missingItemRefs},
          categories:{sourceIds:categorySourceIds.size,uniqueNames:categoryNames.size,collapsedAliasGroups:categoryAliases,productRefs:counts("Produto")-(groups.get("Produto")??[]).filter(p=>!first(p,["categoriaID","categoriaId"])).length,productsWithoutCategory:(groups.get("Produto")??[]).filter(p=>!first(p,["categoriaID","categoriaId"])).length},
          suppliers:{sourceIds:supplierSourceIds.size,uniqueNames:supplierNames.size,collapsedAliasGroups:supplierAliases,productRefs:counts("Produto")-(groups.get("Produto")??[]).filter(p=>!first(p,["fornecedorID","fornecedorId"])).length,productsWithoutSupplier:(groups.get("Produto")??[]).filter(p=>!first(p,["fornecedorID","fornecedorId"])).length},
          preservedOnlyCollections,
          duplicateBarcodeGroups:duplicateBarcodeGroups.map(([barcode,ids])=>({barcode,productIds:ids})),
          unresolvedPayableCreditors,
          duplicateCustomerCpfGroups:duplicateCustomerCpfGroups.length
        }
      },
      warnings,
      safe:legacyConflicts===0 && warnings.length===0,
      note:"Dry-run somente leitura. Nenhuma tabela operacional ou LegacyRecord foi alterada."
    };
    return NextResponse.json({ok:true,report});
  } catch(error) {
    return apiError(error,"Não foi possível executar o dry-run.");
  }
}
