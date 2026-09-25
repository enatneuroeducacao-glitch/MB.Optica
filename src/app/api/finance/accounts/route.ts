import {NextResponse} from "next/server";
import {db} from "@/lib/db";

export async function GET(){
  const [methods,receivables,payables]=await Promise.all([
    db.paymentMethod.findMany({where:{active:true},orderBy:{name:"asc"}}),
    db.account.findMany({where:{type:"RECEBER",status:{in:["PENDENTE","PARCIAL"]}},orderBy:{dueDate:"asc"},take:200}),
    db.account.findMany({where:{type:"PAGAR",status:{in:["PENDENTE","PARCIAL"]}},orderBy:{dueDate:"asc"},take:200})
  ]);

  return NextResponse.json({methods,receivables,payables});
}

export async function POST(req:Request){
  try{
    const b=await req.json();
    if(!b.type||!["RECEBER","PAGAR"].includes(b.type)) throw new Error("Tipo de conta inválido");
    if(!b.description) throw new Error("Descrição é obrigatória");

    const amount=Number(b.amount);
    if(!Number.isFinite(amount)||amount<=0) throw new Error("Valor inválido");

    const account=await db.account.create({
      data:{
        type:b.type,
        description:String(b.description).trim(),
        amount,
        dueDate:b.dueDate?new Date(b.dueDate):new Date(),
        customerId:b.customerId||undefined,
        supplierId:b.supplierId||undefined,
        saleId:b.saleId||undefined,
        notes:b.notes||undefined
      }
    });

    return NextResponse.json(account,{status:201});
  }catch(error){
    return NextResponse.json({error:"Não foi possível lançar a conta",detail:String(error)},{status:400});
  }
}