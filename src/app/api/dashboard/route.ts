import {NextResponse} from "next/server";
import {db} from "@/lib/db";

export async function GET(){
  const [customers,products,orders,receivables,payables]=await Promise.all([
    db.customer.count({where:{active:true}}),
    db.product.count({where:{active:true}}),
    db.opticalOrder.count({where:{status:{notIn:["ENTREGUE","CANCELADO","DEVOLVIDO"]}}}),
    db.account.aggregate({where:{type:"RECEBER",status:{in:["PENDENTE","PARCIAL"]}},_sum:{amount:true}}),
    db.account.aggregate({where:{type:"PAGAR",status:{in:["PENDENTE","PARCIAL"]}},_sum:{amount:true}})
  ]);
  return NextResponse.json({
    customers,
    products,
    orders,
    receivables:receivables._sum.amount||0,
    payables:payables._sum.amount||0
  });
}