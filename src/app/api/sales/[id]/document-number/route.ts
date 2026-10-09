import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {Prisma} from "@prisma/client";

const DOCUMENT_TYPES=["CUPOM","RECIBO","CARNE","PROMISSORIA"] as const;
type DocumentType=typeof DOCUMENT_TYPES[number];

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
    const {id:saleId}=await params;
    const body=await req.json();
    const type=String(body.type||"") as DocumentType;
    if(!DOCUMENT_TYPES.includes(type)) return NextResponse.json({error:"Tipo de documento inválido."},{status:400});

    const sale=await db.sale.findUnique({where:{id:saleId},select:{id:true,canceled:true}});
    if(!sale) return NextResponse.json({error:"Venda não encontrada."},{status:404});
    if(sale.canceled) return NextResponse.json({error:"Não é possível emitir documentos para uma venda cancelada."},{status:409});

    const prior=await db.issuedDocument.findUnique({where:{saleId_type:{saleId,type}}});
    if(prior) return NextResponse.json({saleId,type,number:prior.number,issuedAt:prior.issuedAt,reused:true});

    const document=await db.$transaction(async(tx)=>{
      const existing=await tx.issuedDocument.findUnique({where:{saleId_type:{saleId,type}}});
      if(existing) return existing;
      const sequence=await tx.documentSequence.update({where:{type},data:{nextNumber:{increment:1}}});
      return tx.issuedDocument.create({data:{saleId,type,number:sequence.nextNumber-1}});
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:10000,timeout:15000});
    return NextResponse.json({saleId,type,number:document.number,issuedAt:document.issuedAt,reused:document.issuedAt.getTime()!==document.issuedAt.getTime()});
  }catch(error){
    try{
      const {id:saleId}=await params;
      const body=await req.clone().json();
      const type=String(body.type||"");
      if(["CUPOM","RECIBO","CARNE","PROMISSORIA"].includes(type)){
        const existing=await db.issuedDocument.findUnique({where:{saleId_type:{saleId,type}}});
        if(existing) return NextResponse.json({saleId,type,number:existing.number,issuedAt:existing.issuedAt,reused:true});
      }
    }catch{}
    return NextResponse.json({error:"Não foi possível emitir a numeração do documento.",detail:String(error)},{status:400});
  }
}
