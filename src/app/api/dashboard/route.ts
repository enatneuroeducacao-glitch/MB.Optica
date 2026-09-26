import {NextResponse} from "next/server";
import {db} from "@/lib/db";

const startOfDay=(d:Date)=>{const x=new Date(d);x.setHours(0,0,0,0);return x};
const num=(v:any)=>Number(v||0);
const outstanding=(rows:{amount:any;paidAmount:any}[])=>rows.reduce((s,r)=>s+Math.max(0,num(r.amount)-num(r.paidAmount)),0);

export async function GET(){
  try{
    const today=startOfDay(new Date());
    const tomorrow=new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
    const [customers,products,orders,receivableRows,payableRows,sales,appointments,cashSessions]=await Promise.all([
      db.customer.count({where:{active:true}}),
      db.product.findMany({where:{active:true},select:{id:true,minimumStock:true,movements:{select:{type:true,quantity:true}}}}),
      db.opticalOrder.findMany({where:{status:{notIn:["ENTREGUE","CANCELADO","DEVOLVIDO"]}},include:{customer:{select:{name:true}}},orderBy:{createdAt:"desc"},take:8}),
      db.account.findMany({where:{type:"RECEBER",status:{in:["PENDENTE","PARCIAL"]}},select:{amount:true,paidAmount:true}}),
      db.account.findMany({where:{type:"PAGAR",status:{in:["PENDENTE","PARCIAL"]}},select:{amount:true,paidAmount:true}}),
      db.sale.findMany({where:{canceled:false,createdAt:{gte:today,lt:tomorrow}},select:{total:true,payments:{select:{amount:true,reversedAt:true}}}}),
      db.appointment.findMany({where:{scheduledAt:{gte:today,lt:tomorrow},status:{notIn:["CANCELADO","CONCLUIDO"]}},include:{customer:{select:{name:true}}},orderBy:{scheduledAt:"asc"},take:8}),
      db.cashSession.findMany({where:{closedAt:null},include:{movements:true},orderBy:{openedAt:"desc"},take:5})
    ]);
    const stock=products.map((p:any)=>p.movements.reduce((s:number,m:any)=>s+([ "ENTRADA","AJUSTE","DEVOLUCAO" ].includes(m.type)?num(m.quantity):-num(m.quantity)),0));
    const lowStock=stock.filter((q:number,i:number)=>q<=num(products[i].minimumStock)).length;
    const zeroStock=stock.filter((q:number)=>q<=0).length;
    const salesToday=sales.reduce((s:number,x:any)=>s+num(x.total),0);
    const receivedToday=sales.flatMap((x:any)=>x.payments||[]).filter((p:any)=>!p.reversedAt).reduce((s:number,p:any)=>s+num(p.amount),0);
    const cashBalance=cashSessions.reduce((total:number,c:any)=>total+num(c.openingCash)+c.movements.filter((m:any)=>["ENTRADA","REFORCO"].includes(m.kind)).reduce((s:number,m:any)=>s+num(m.amount),0)-c.movements.filter((m:any)=>["SAIDA","SANGRIA"].includes(m.kind)).reduce((s:number,m:any)=>s+num(m.amount),0),0);
    const overdue=await db.account.count({where:{status:{in:["PENDENTE","PARCIAL"]},dueDate:{lt:today}}});
    const labRows=await db.opticalOrder.groupBy({by:["status"],where:{status:{in:["AGUARDANDO_LABORATORIO","EM_PRODUCAO","RECEBIDO","CONFERENCIA","RETORNO_GARANTIA","PRONTO"]}},_count:{_all:true}});
    const laboratory:Record<string,number>={}; labRows.forEach((r:any)=>{laboratory[r.status]=r._count._all});
    return NextResponse.json({customers,products:products.length,orders:orders.length,receivables:outstanding(receivableRows),payables:outstanding(payableRows),salesToday,receivedToday,cashBalance,cashOpen:cashSessions.length>0,lowStock,zeroStock,overdue,appointmentsToday:appointments.length,appointments,recentOrders:orders,laboratory});
  }catch(error){return NextResponse.json({error:"Não foi possível carregar o dashboard",detail:String(error)},{status:500})}
}