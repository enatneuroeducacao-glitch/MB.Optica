import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {Prisma} from "@prisma/client";

const money=(v:any)=>Number(v||0);

export async function GET(){
  try{
    const [accounts,sales,openCash,methods]=await Promise.all([
      db.account.findMany({orderBy:{dueDate:"asc"},take:200,include:{customer:{select:{id:true,name:true}},supplier:{select:{id:true,name:true}},sale:{select:{number:true}}}}),
      db.sale.findMany({where:{canceled:false},orderBy:{createdAt:"desc"},take:100,include:{customer:{select:{name:true}},payments:{include:{method:{select:{name:true}}}}}}),
      db.cashSession.findFirst({where:{closedAt:null},orderBy:{openedAt:"desc"},include:{movements:{orderBy:{createdAt:"desc"},take:100}}}),
      db.paymentMethod.findMany({where:{active:true},orderBy:{name:"asc"}})
    ]);
    const today=new Date(); today.setHours(0,0,0,0);
    const received=sales.flatMap(s=>s.payments).reduce((a,p)=>a+money(p.amount),0);
    const receivable=accounts.filter(a=>a.type==="RECEBER"&&a.status!=="PAGO"&&a.status!=="CANCELADO").reduce((a,x)=>a+Math.max(0,money(x.amount)-money(x.paidAmount)),0);
    const payable=accounts.filter(a=>a.type==="PAGAR"&&a.status!=="PAGO"&&a.status!=="CANCELADO").reduce((a,x)=>a+Math.max(0,money(x.amount)-money(x.paidAmount)),0);
    const dueToday=accounts.filter(a=>a.dueDate<=today&&a.status!=="PAGO"&&a.status!=="CANCELADO");
    const todayReceived=sales.filter(s=>s.createdAt>=today).flatMap(s=>s.payments).reduce((a,p)=>a+money(p.amount),0);
    const cashMovements=openCash?.movements||[];
    const cashIn=money(openCash?.openingCash)+cashMovements.filter(m=>["ENTRADA","REFORCO"].includes(m.kind)).reduce((a,m)=>a+money(m.amount),0);
    const cashOut=cashMovements.filter(m=>["SAIDA","SANGRIA"].includes(m.kind)).reduce((a,m)=>a+money(m.amount),0);
    return NextResponse.json({accounts,sales,methods,openCash,summary:{receivable,payable,received,todayReceived,dueToday:dueToday.length,cashBalance:cashIn-cashOut,ticket:sales.length?sales.reduce((a,s)=>a+money(s.total),0)/sales.length:0}});
  }catch(error){return NextResponse.json({error:"Não foi possível carregar o centro financeiro",detail:String(error)},{status:500})}
}

export async function POST(req:Request){
  try{
    const b=await req.json();
    if(b.action==="CREATE_ACCOUNT"){
      const type=b.type==="PAGAR"?"PAGAR":"RECEBER";
      if(!b.description||!b.dueDate||!Number.isFinite(Number(b.amount))||Number(b.amount)<=0) throw new Error("Descrição, vencimento e valor são obrigatórios");
      const account=await db.account.create({data:{type,description:String(b.description),customerId:b.customerId||undefined,supplierId:b.supplierId||undefined,dueDate:new Date(b.dueDate),amount:Number(b.amount),notes:b.notes||undefined}});
      return NextResponse.json(account,{status:201});
    }
    if(b.action==="SETTLE_ACCOUNT"){
      const accountId=String(b.accountId||""); const amount=Number(b.amount);
      if(!accountId||!Number.isFinite(amount)||amount<=0) throw new Error("Conta e valor são obrigatórios");
      const account=await db.account.findUnique({where:{id:accountId}});
      if(!account) throw new Error("Conta não encontrada");
      const remaining=Math.max(0,Number(account.amount)-Number(account.paidAmount));
      if(amount>remaining+0.01) throw new Error("Valor superior ao saldo da conta");
      const result=await db.$transaction(async tx=>{
        const settlement=await tx.accountSettlement.create({data:{accountId,amount,method:b.method||undefined,methodId:b.methodId||undefined,reference:b.reference||undefined,notes:b.notes||undefined}});
        const paid=Number(account.paidAmount)+amount;
        const updated=await tx.account.update({where:{id:accountId},data:{paidAmount:paid,status:paid+0.001>=Number(account.amount)?"PAGO":"PARCIAL"}});
        return {settlement,account:updated};
      });
      return NextResponse.json(result);
    }
    if(b.action==="OPEN_CASH"){
      const existing=await db.cashSession.findFirst({where:{closedAt:null}});
      if(existing) return NextResponse.json(existing);
      const cash=await db.cashSession.create({data:{openingCash:Number(b.amount||0),notes:b.notes||undefined}});
      return NextResponse.json(cash,{status:201});
    }
    if(b.action==="CASH_MOVEMENT"){
      const session=await db.cashSession.findFirst({where:{closedAt:null},orderBy:{openedAt:"desc"}});
      if(!session) throw new Error("Não há caixa aberto");
      const amount=Number(b.amount);
      if(!Number.isFinite(amount)||amount<=0) throw new Error("Valor inválido");
      const movement=await db.cashMovement.create({data:{sessionId:session.id,kind:String(b.kind||"ENTRADA"),amount,description:String(b.description||"Lançamento financeiro"),referenceId:b.referenceId||undefined}});
      return NextResponse.json(movement,{status:201});
    }
    if(b.action==="CLOSE_CASH"){
      const session=await db.cashSession.findFirst({where:{closedAt:null},orderBy:{openedAt:"desc"},include:{movements:true}});
      if(!session) throw new Error("Não há caixa aberto");
      const ins=session.movements.filter(m=>["ENTRADA","REFORCO"].includes(m.kind)).reduce((a,m)=>a+Number(m.amount),0);
      const outs=session.movements.filter(m=>["SAIDA","SANGRIA"].includes(m.kind)).reduce((a,m)=>a+Number(m.amount),0);
      const expected=Number(session.openingCash)+ins-outs;
      const closing=Number.isFinite(Number(b.amount))?Number(b.amount):expected;
      const updated=await db.cashSession.update({where:{id:session.id},data:{closedAt:new Date(),closingCash:closing,notes:b.notes||session.notes}});
      return NextResponse.json({session:updated,expected});
    }
    throw new Error("Ação financeira inválida");
  }catch(error){return NextResponse.json({error:"Operação financeira não realizada",detail:String(error)},{status:400})}
}