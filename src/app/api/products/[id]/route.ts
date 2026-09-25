import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {writeAudit} from "@/lib/audit";

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const product=await db.product.findUnique({where:{id},include:{category:true,supplier:true,lots:{where:{archived:false}}}});
  if(!product) return NextResponse.json({error:"Produto não encontrado"},{status:404});
  return NextResponse.json(product);
}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const b=await req.json();
    const data:{
      code?:string; barcode?:string|null; description?:string; unit?:string;
      cost?:number; salePrice?:number; minimumStock?:number;
      categoryId?:string|null; supplierId?:string|null; active?:boolean;
    }={};
    if(b.code!==undefined){const v=String(b.code).trim();if(!v)throw new Error("Código inválido");data.code=v;}
    if(b.description!==undefined){const v=String(b.description).trim();if(!v)throw new Error("Descrição inválida");data.description=v;}
    if(b.barcode!==undefined)data.barcode=b.barcode?String(b.barcode).trim():null;
    if(b.unit!==undefined){const v=String(b.unit).trim();if(!v)throw new Error("Unidade inválida");data.unit=v;}
    for(const field of ["cost","salePrice","minimumStock"] as const){
      if(b[field]!==undefined){
        const v=Number(b[field]);
        if(!Number.isFinite(v)||v<0) throw new Error("Valor inválido: "+field);
        data[field]=v;
      }
    }
    if(b.categoryId!==undefined)data.categoryId=b.categoryId?String(b.categoryId):null;
    if(b.supplierId!==undefined)data.supplierId=b.supplierId?String(b.supplierId):null;
    if(b.active!==undefined){
      if(typeof b.active!=="boolean") throw new Error("active deve ser booleano");
      data.active=b.active;
    }
    if(Object.keys(data).length===0) throw new Error("Nenhuma alteração informada");

    const result=await db.$transaction(async tx=>{
      const current=await tx.product.findUnique({where:{id}});
      if(!current) throw new Error("Produto não encontrado");
      if(data.categoryId){
        const category=await tx.category.findUnique({where:{id:data.categoryId,active:true}});
        if(!category) throw new Error("Categoria não encontrada ou inativa");
      }
      if(data.supplierId){
        const supplier=await tx.supplier.findUnique({where:{id:data.supplierId,active:true}});
        if(!supplier) throw new Error("Fornecedor não encontrado ou inativo");
      }
      const updated=await tx.product.update({where:{id},data});
      await writeAudit(tx,{action:"UPDATE",entity:"Product",entityId:id,metadata:{before:{code:current.code,description:current.description,cost:current.cost.toString(),salePrice:current.salePrice.toString(),active:current.active},after:{code:updated.code,description:updated.description,cost:updated.cost.toString(),salePrice:updated.salePrice.toString(),active:updated.active}}});
      return updated;
    });
    return NextResponse.json(result);
  }catch(error){return NextResponse.json({error:"Não foi possível atualizar o produto",detail:String(error)},{status:400});}
}

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const result=await db.$transaction(async tx=>{
      const current=await tx.product.findUnique({where:{id}});
      if(!current) throw new Error("Produto não encontrado");
      if(!current.active) return current;
      const updated=await tx.product.update({where:{id},data:{active:false}});
      await writeAudit(tx,{action:"ARCHIVE",entity:"Product",entityId:id,metadata:{code:current.code,description:current.description}});
      return updated;
    });
    return NextResponse.json({ok:true,product:result});
  }catch(error){return NextResponse.json({error:"Não foi possível arquivar o produto",detail:String(error)},{status:400});}
}
