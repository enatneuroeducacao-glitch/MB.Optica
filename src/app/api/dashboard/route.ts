import {NextResponse} from "next/server";
import {db} from "@/lib/db";

export async function GET(){
  const [customers,products,orders,receivableRows,payableRows]=await Promise.all([
    db.customer.count({where:{active:true}}),
    db.product.count({where:{active:true}}),
    db.opticalOrder.count({where:{status:{notIn:["ENTREGUE","CANCELADO","DEVOLVIDO"]}}}),
    db.account.findMany({where:{type:"RECEBER",status:{in:["PENDENTE","PARCIAL"]}},select:{amount:true,paidAmount:true}}),
    db.account.findMany({where:{type:"PAGAR",status:{in:["PENDENTE","PARCIAL"]}},select:{amount:true,paidAmount:true}})
  ]);
  const outstanding=(rows:{amount:any;paidAmount:any}[])=>rows.reduce((sum,row)=>sum+Math.max(0,Number(row.amount)-Number(row.paidAmount)),0);
  return NextResponse.json({
    customers,
    products,
    orders,
    receivables:outstanding(receivableRows),
    payables:outstanding(payableRows)
  });
}
