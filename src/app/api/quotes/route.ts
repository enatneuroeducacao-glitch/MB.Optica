import {NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {writeAudit} from "@/lib/audit";
import {apiError} from "@/lib/api-error";

const itemSchema=z.object({
  productId:z.string().nullable().optional(),
  description:z.string().trim().min(2).max(240),
  kind:z.string().trim().max(40).nullable().optional(),
  eye:z.string().trim().max(10).nullable().optional(),
  quantity:z.coerce.number().positive(),
  unitPrice:z.coerce.number().min(0)
});
const schema=z.object({
  customerId:z.string().min(1),
  prescriptionId:z.string().nullable().optional(),
  validUntil:z.string().nullable().optional(),
  deliveryDate:z.string().nullable().optional(),
  discount:z.coerce.number().min(0).default(0),
  surcharge:z.coerce.number().min(0).default(0),
  entryAmount:z.coerce.number().min(0).default(0),
  paymentMethod:z.string().trim().max(50).nullable().optional(),
  installments:z.coerce.number().int().min(1).nullable().optional(),
  notes:z.string().max(2000).nullable().optional(),
  items:z.array(itemSchema).min(1)
});

function dateOrNull(value?:string|null){
  if(!value)return null;
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))throw new Error("Data inválida.");
  return d;
}

export async function GET(req:Request){
 try{
  await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
  const url=new URL(req.url);
  const status=url.searchParams.get("status")||undefined;
  const q=url.searchParams.get("q")?.trim()||"";
  const rows=await db.quote.findMany({
   where:{
    ...(status&&status!=="TODOS"?{status}:{}),
    ...(q?{customer:{OR:[{name:{contains:q,mode:"insensitive"}},{cpfCnpj:{contains:q,mode:"insensitive"}},{phone:{contains:q,mode:"insensitive"}}]}}:{})
   },
   orderBy:{createdAt:"desc"},take:300,
   include:{customer:true,seller:true,prescription:true,items:{include:{product:true}},order:{select:{id:true,number:true,status:true}}}
  });
  return NextResponse.json(rows);
 }catch(error){return apiError(error,"Não foi possível carregar os orçamentos.");}
}

export async function POST(req:Request){
 try{
  const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
  const b=schema.parse(await req.json());
  const customer=await db.customer.findUnique({where:{id:b.customerId,active:true}});
  if(!customer)throw new Error("Cliente não encontrado ou inativo.");
  if(b.prescriptionId){
   const prescription=await db.prescription.findFirst({where:{id:b.prescriptionId,customerId:b.customerId}});
   if(!prescription)throw new Error("Receita não pertence ao cliente selecionado.");
  }
  const prepared=[];
  for(const item of b.items){
   let description=item.description;
   if(item.productId){
    const product=await db.product.findUnique({where:{id:item.productId,active:true}});
    if(!product)throw new Error("Produto selecionado não encontrado ou inativo.");
    if(!description.trim())description=product.description;
   }
   prepared.push({...item,description:description.trim(),productId:item.productId||undefined,kind:item.kind||undefined,eye:item.eye||undefined});
  }
  const subtotal=prepared.reduce((sum,item)=>sum+item.quantity*item.unitPrice,0);
  const total=Math.max(0,subtotal-b.discount+b.surcharge);
  if(b.entryAmount>total)throw new Error("A entrada não pode ser maior que o total.");
  const data=await db.$transaction(async tx=>{
   const quote=await tx.quote.create({
    data:{
     customerId:b.customerId,prescriptionId:b.prescriptionId||undefined,sellerId:actor.id,
     validUntil:dateOrNull(b.validUntil),deliveryDate:dateOrNull(b.deliveryDate),
     discount:b.discount,surcharge:b.surcharge,entryAmount:b.entryAmount,total,
     paymentMethod:b.paymentMethod||undefined,installments:b.installments||undefined,notes:b.notes||undefined,
     items:{create:prepared}
    },
    include:{customer:true,seller:true,prescription:true,items:true}
   });
   await writeAudit(tx,{action:"CREATE",entity:"Quote",entityId:quote.id,userId:actor.id,metadata:{number:quote.number,customerId:quote.customerId,total:quote.total}});
   return quote;
  });
  return NextResponse.json(data,{status:201});
 }catch(error){
  if(error instanceof z.ZodError)return NextResponse.json({error:"Preencha os dados do orçamento corretamente."},{status:422});
  return apiError(error,"Não foi possível criar o orçamento.");
 }
}

export async function PATCH(req:Request){
 try{
  const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
  const body=await req.json();
  const id=String(body.id||"");
  const status=String(body.status||"");
  if(!id||!["ABERTO","ENVIADO","APROVADO","RECUSADO","EXPIRADO","CANCELADO"].includes(status))throw new Error("Status inválido.");
  const quote=await db.quote.findUnique({where:{id}});
  if(!quote)throw new Error("Orçamento não encontrado.");
  if(quote.status==="CONVERTIDO")throw new Error("Orçamento já convertido em O.S.");
  const updated=await db.$transaction(async tx=>{
   const x=await tx.quote.update({where:{id},data:{status}});
   await writeAudit(tx,{action:"UPDATE_STATUS",entity:"Quote",entityId:id,userId:actor.id,metadata:{from:quote.status,to:status}});
   return x;
  });
  return NextResponse.json(updated);
 }catch(error){return apiError(error,"Não foi possível atualizar o orçamento.");}
}
