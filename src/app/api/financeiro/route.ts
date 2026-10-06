import {NextResponse} from "next/server";
import {db} from "@/lib/db";

const money=(v:any)=>Number(v||0);
const DEFAULT_SALARY_RULES=[
  {maxRevenue:8000,salary:1500,label:"Base de recuperação"},
  {maxRevenue:9999.99,salary:1800,label:"Recuperação"},
  {maxRevenue:11999.99,salary:2000,label:"Estabilização"},
  {maxRevenue:14999.99,salary:2300,label:"Crescimento"},
  {maxRevenue:null,salary:2500,label:"Crescimento consolidado"}
];
const DEFAULT_TAX_RULES={
  minimumWage:1621,
  inssCap:8475.55,
  ownerInssRate:0.11,
  employerInssRate:0.20,
  fgtsRate:0.08,
  irrfSimplified:607.20,
  irrfBrackets:[
    {max:2428.80,rate:0,deduction:0},
    {max:2826.65,rate:0.075,deduction:182.16},
    {max:3751.05,rate:0.15,deduction:394.16},
    {max:4664.68,rate:0.225,deduction:675.49},
    {max:null,rate:0.275,deduction:908.73}
  ],
  irrfReduction:[
    {maxIncome:5000,fn:"minTax"},
    {maxIncome:7350,fn:"978.62-0.133145xIncome"},
    {maxIncome:null,fn:"none"}
  ]
};
const progressiveInss2026=(gross:number)=>{
  const v=Math.max(0,Math.min(gross,8475.55));
  const bands=[
    {max:1621,rate:.075},{max:2902.84,rate:.09},{max:4354.27,rate:.12},{max:8475.55,rate:.14}
  ];
  let prev=0,total=0;
  for(const b of bands){const part=Math.max(0,Math.min(v,b.max)-prev);total+=part*b.rate;prev=b.max;if(v<=b.max)break}
  return Math.round(total*100)/100;
};
const calculateIrrf2026=(gross:number,inss:number)=>{
  const base=Math.max(0,gross-inss);
  const taxable=Math.max(0,base-607.20);
  const b=DEFAULT_TAX_RULES.irrfBrackets.find((x:any)=>x.max===null||taxable<=x.max);
  if(!b)return 0;
  const raw=Math.max(0,taxable*b.rate-b.deduction);
  let reduction=0;
  if(gross<=5000) reduction=Math.min(raw,312.89);
  else if(gross<=7350) reduction=Math.min(raw,Math.max(0,978.62-(0.133145*gross)));
  return Math.round(Math.max(0,raw-reduction)*100)/100;
};
const computePayroll=(gross:number,type:string,regime:string,other=0)=>{
  const owner=type==="PROLABORE";
  const inss=owner && regime==="SIMEI" ? 0 : owner ? Math.min(gross,8475.55)*.11 : progressiveInss2026(gross);
  const irrf=calculateIrrf2026(gross,inss);
  const fgts=owner?0:gross*.08;
  const employerInss=(owner && regime==="SIMEI")?0:(owner?gross*.20:0);
  const net=Math.max(0,gross-inss-irrf-other);
  const total=gross+fgts+employerInss;
  return {inss:Math.round(inss*100)/100,irrf,fgts:Math.round(fgts*100)/100,employerInss:Math.round(employerInss*100)/100,net:Math.round(net*100)/100,totalCost:Math.round(total*100)/100};
};
const payrollDefaults=()=>({ownerName:"Moni Becker",ownerRole:"Proprietária / Administradora",recommendationMode:"MEDIA_6_MESES",reservePercent:10,salaryRules:DEFAULT_SALARY_RULES,taxRules:DEFAULT_TAX_RULES});


export async function GET(){
  try{
    const [accounts,sales,openCash,methods,payrollSettings,fiscalConfig,payrollRecords,legacySales]=await Promise.all([
      db.account.findMany({orderBy:{dueDate:"asc"},take:200,include:{customer:{select:{id:true,name:true}},supplier:{select:{id:true,name:true}},sale:{select:{number:true}}}}),
      db.sale.findMany({where:{canceled:false},orderBy:{createdAt:"desc"},take:100,include:{customer:{select:{name:true}},payments:{include:{method:{select:{name:true}}}}}}),
      db.cashSession.findFirst({where:{closedAt:null},orderBy:{openedAt:"desc"},include:{movements:{orderBy:{createdAt:"desc"},take:100}}}),
      db.paymentMethod.findMany({where:{active:true},orderBy:{name:"asc"}}),
      db.payrollSettings.findFirst({orderBy:{updatedAt:"desc"}}),
      db.fiscalConfig.findFirst({where:{active:true},orderBy:{updatedAt:"desc"}}),
      db.payrollRecord.findMany({orderBy:{competence:"desc"},take:60}),
      db.legacyRecord.findMany({where:{collectionKey:"Venda",source:"BEEPSTART"},select:{payload:true}})
    ]);
    let settings=payrollSettings;
    if(!settings){
      settings=await db.payrollSettings.create({data:payrollDefaults()});
    }
    const monthlyMap=new Map<string,{month:string,revenue:number,sales:number}>();
    const addSale=(dateValue:any,revenue:number)=>{
      const d=new Date(dateValue); if(Number.isNaN(d.getTime())) return;
      const key=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
      const row=monthlyMap.get(key)||{month:key,revenue:0,sales:0}; row.revenue+=revenue; row.sales+=1; monthlyMap.set(key,row);
    };
    legacySales.forEach((r:any)=>{
      const p=r.payload||{}; if(p.cancelada) return;
      const revenue=Object.values((p.valoresIDs||{}) as Record<string,unknown>).reduce((a:number,v)=>a+Number(v||0),0);
      if(revenue>0)addSale(Number(p.data),revenue);
    });
    sales.forEach((s:any)=>addSale(s.createdAt,money(s.total)));
    const now=new Date();
    const closedMonths:number[]=[];
    for(let i=1;i<=6;i++){const d=new Date(now.getFullYear(),now.getMonth()-i,1);const key=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");closedMonths.push(monthlyMap.get(key)?.revenue||0)}
    const average6=closedMonths.reduce((a,b)=>a+b,0)/6;
    const currentKey=now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0");
    const currentRevenue=monthlyMap.get(currentKey)?.revenue||0;
    const rules=Array.isArray((settings as any).salaryRules)?(settings as any).salaryRules:DEFAULT_SALARY_RULES;
    const recommended=(rules.find((r:any)=>r.maxRevenue===null||average6<=Number(r.maxRevenue))||rules[rules.length-1]||DEFAULT_SALARY_RULES[0]);
    const capByPercent=average6*0.28;
    const recommendedSalary=Math.min(Number(recommended.salary),capByPercent>0?capByPercent:Number(recommended.salary));
    const payrollRecommendation={
      average6:Math.round(average6*100)/100,currentRevenue:Math.round(currentRevenue*100)/100,
      recommendedSalary:Math.floor(recommendedSalary/50)*50,bandLabel:recommended.label||"",
      capByPercent:Math.round(capByPercent*100)/100,reservePercent:Number((settings as any).reservePercent||10),
      warning:currentRevenue>0&&currentRevenue<average6*.5?"O faturamento do mês está abaixo de 50% da média de 6 meses. Evite elevar o pró-labore neste mês.":average6<8000?"Empresa em fase de recuperação: manter retirada conservadora.":"Faturamento compatível com a faixa de retirada configurada.",
      basis:"Média dos 6 meses fechados anteriores, com trava de até 28% da média.",
      regime:fiscalConfig?.taxRegime||"SIMEI"
    };
    const today=new Date(); today.setHours(0,0,0,0);
    const received=sales.flatMap(s=>s.payments).filter(p=>!p.reversedAt).reduce((a,p)=>a+money(p.amount),0);
    const receivable=accounts.filter(a=>a.type==="RECEBER"&&a.status!=="PAGO"&&a.status!=="CANCELADO"&&!a.writtenOffAt).reduce((a,x)=>a+Math.max(0,money(x.amount)-money(x.paidAmount)),0);
    const payable=accounts.filter(a=>a.type==="PAGAR"&&a.status!=="PAGO"&&a.status!=="CANCELADO").reduce((a,x)=>a+Math.max(0,money(x.amount)-money(x.paidAmount)),0);
    const writtenOff=accounts.filter(a=>a.type==="RECEBER"&&a.writtenOffAt).reduce((a,x)=>a+Math.max(0,money(x.amount)-money(x.paidAmount)),0);
    const dueToday=accounts.filter(a=>a.dueDate<=today&&a.status!=="PAGO"&&a.status!=="CANCELADO");
    const todayReceived=sales.filter(s=>s.createdAt>=today).flatMap(s=>s.payments).filter(p=>!p.reversedAt).reduce((a,p)=>a+money(p.amount),0);
    const cashMovements=openCash?.movements||[];
    const cashIn=money(openCash?.openingCash)+cashMovements.filter(m=>["ENTRADA","REFORCO"].includes(m.kind)).reduce((a,m)=>a+money(m.amount),0);
    const cashOut=cashMovements.filter(m=>["SAIDA","SANGRIA"].includes(m.kind)).reduce((a,m)=>a+money(m.amount),0);
    return NextResponse.json({accounts,sales,methods,openCash,payroll:{settings,payrollRecords,recommendation:payrollRecommendation,taxRules:(settings as any).taxRules||DEFAULT_TAX_RULES},summary:{receivable,payable,writtenOff,received,todayReceived,dueToday:dueToday.length,cashBalance:cashIn-cashOut,ticket:sales.length?sales.reduce((a,s)=>a+money(s.total),0)/sales.length:0}});
  }catch(error){return NextResponse.json({error:"Não foi possível carregar o centro financeiro",detail:String(error)},{status:500})}
}

export async function POST(req:Request){
  try{
    const b=await req.json();
    if(b.action==="UPDATE_PAYROLL_SETTINGS"){
      const existing=await db.payrollSettings.findFirst({orderBy:{updatedAt:"desc"}});
      const data={
        ownerName:String(b.ownerName||"Moni Becker"),ownerRole:String(b.ownerRole||"Proprietária / Administradora"),
        recommendationMode:String(b.recommendationMode||"MEDIA_6_MESES"),reservePercent:Number(b.reservePercent??10),
        salaryRules:Array.isArray(b.salaryRules)?b.salaryRules:DEFAULT_SALARY_RULES,
        taxRules:b.taxRules||DEFAULT_TAX_RULES
      };
      const saved=existing?await db.payrollSettings.update({where:{id:existing.id},data}):await db.payrollSettings.create({data});
      return NextResponse.json(saved);
    }
    if(b.action==="CALCULATE_PAYROLL"){
      const gross=Number(b.grossAmount); if(!Number.isFinite(gross)||gross<=0) throw new Error("Remuneração bruta inválida");
      const fiscal=await db.fiscalConfig.findFirst({where:{active:true},orderBy:{updatedAt:"desc"}});
      const type=String(b.type||"PROLABORE"); const regime=String(fiscal?.taxRegime||"SIMEI");
      if(Number(b.grossAmount)<1621 && (type==="SALARIO" || (type==="PROLABORE" && regime!=="SIMEI"))) throw new Error("Para esta modalidade, a remuneração não pode ficar abaixo de R$ 1.621,00 na competência 2026.");
      return NextResponse.json({grossAmount:gross,...computePayroll(gross,type,regime,Number(b.otherDiscounts||0)),regime,type});
    }
    if(b.action==="CREATE_PAYROLL"){
      const gross=Number(b.grossAmount); if(!Number.isFinite(gross)||gross<=0) throw new Error("Remuneração bruta inválida");
      const fiscal=await db.fiscalConfig.findFirst({where:{active:true},orderBy:{updatedAt:"desc"}});
      const type=String(b.type||"PROLABORE")==="SALARIO"?"SALARIO":"PROLABORE";
      const regime=String(fiscal?.taxRegime||"SIMEI");
      if(gross<1621 && (type==="SALARIO" || (type==="PROLABORE" && regime!=="SIMEI"))) throw new Error("Para esta modalidade, a remuneração não pode ficar abaixo de R$ 1.621,00 na competência 2026.");
      const calc=computePayroll(gross,type,regime,Number(b.otherDiscounts||0));
      const competence=new Date(String(b.competence||""));
      if(Number.isNaN(competence.getTime())) throw new Error("Competência inválida");
      const record=await db.payrollRecord.create({data:{
        competence,personName:String(b.personName||"Moni Becker"),role:b.role||undefined,type,
        grossAmount:gross,inssAmount:calc.inss,irrfAmount:calc.irrf,otherDiscounts:Number(b.otherDiscounts||0),
        netAmount:calc.net,employerInss:calc.employerInss,fgtsAmount:calc.fgts,totalCost:calc.totalCost,
        status:"EMITIDA",paymentDate:b.paymentDate?new Date(b.paymentDate):undefined,notes:b.notes||undefined,
        ruleSnapshot:{regime,calculation:calc,basis:"Regras 2026 configuradas no MB Gestão"}
      }});
      return NextResponse.json(record,{status:201});
    }
    if(b.action==="PAY_PAYROLL"){
      const id=String(b.id||""); if(!id) throw new Error("Folha não informada");
      const record=await db.payrollRecord.update({where:{id},data:{status:"PAGA",paymentDate:b.paymentDate?new Date(b.paymentDate):new Date()}});
      return NextResponse.json(record);
    }
    if(b.action==="CANCEL_PAYROLL"){
      const id=String(b.id||""); if(!id) throw new Error("Folha não informada");
      const record=await db.payrollRecord.update({where:{id},data:{status:"CANCELADA"}});
      return NextResponse.json(record);
    }
    if(b.action==="WRITE_OFF_ACCOUNT"){
      const accountId=String(b.accountId||"");
      const reason=String(b.reason||"Inadimplência considerada incobrável").trim();
      if(!accountId) throw new Error("Conta não informada");
      if(!reason) throw new Error("Informe o motivo da baixa como perda");
      const account=await db.account.findUnique({where:{id:accountId}});
      if(!account) throw new Error("Conta não encontrada");
      if(account.type!=="RECEBER") throw new Error("Somente contas a receber podem ser baixadas como perda");
      if(account.status==="PAGO"||account.status==="CANCELADO") throw new Error("Esta conta não está disponível para baixa como perda");
      const remaining=Math.max(0,Number(account.amount)-Number(account.paidAmount));
      const updated=await db.account.update({where:{id:accountId},data:{writtenOffAt:new Date(),writtenOffReason:reason}});
      return NextResponse.json({account:updated,amountWrittenOff:remaining});
    }
    if(b.action==="CREATE_ACCOUNT"){
      const type=b.type==="PAGAR"?"PAGAR":"RECEBER";
      if(!b.description||!b.dueDate||!Number.isFinite(Number(b.amount))||Number(b.amount)<=0) throw new Error("Descrição, vencimento e valor são obrigatórios");
      const account=await db.account.create({data:{type,description:String(b.description),customerId:b.customerId||undefined,supplierId:b.supplierId||undefined,dueDate:new Date(b.dueDate),amount:Number(b.amount),notes:b.notes||undefined}});
      return NextResponse.json(account,{status:201});
    }
    if(b.action==="SETTLE_ACCOUNT"){
      const accountId=String(b.accountId||""); const amount=Number(b.amount);
      if(!accountId||!Number.isFinite(amount)||amount<=0) throw new Error("Conta e valor são obrigatórios");

      const result=await db.$transaction(async tx=>{
        const account=await tx.account.findUnique({where:{id:accountId}});
        if(!account) throw new Error("Conta não encontrada");
        const remaining=Math.max(0,Number(account.amount)-Number(account.paidAmount));
        if(amount>remaining+0.01) throw new Error("Valor superior ao saldo da conta");

        let payment:any=null;
        let movement:any=null;
        if(account.type==="RECEBER"&&account.saleId){
          const sale=await tx.sale.findUnique({where:{id:account.saleId}});
          if(!sale||sale.canceled) throw new Error("Venda vinculada não encontrada ou cancelada");

          const methodName=String(b.method||"").trim();
          const method=b.methodId
            ? await tx.paymentMethod.findUnique({where:{id:String(b.methodId)}})
            : methodName
              ? await tx.paymentMethod.findFirst({where:{active:true,name:{equals:methodName,mode:"insensitive"}}})
              : null;
          if(!method||!method.active) throw new Error("Meio de recebimento inválido para a parcela");

          const paid=await tx.payment.aggregate({where:{saleId:sale.id,reversedAt:null},_sum:{amount:true}});
          const saleRemaining=Number(sale.total)-Number(paid._sum.amount||0);
          if(amount>saleRemaining+0.01) throw new Error("Recebimento superior ao saldo financeiro da venda");

          payment=await tx.payment.create({
            data:{
              saleId:sale.id,
              methodId:method.id,
              amount,
              reference:b.reference||undefined
            }
          });

          if(method.isCash){
            const session=await tx.cashSession.findFirst({where:{closedAt:null},orderBy:{openedAt:"desc"}});
            if(!session) throw new Error("Não há caixa aberto para receber esta parcela");
            movement=await tx.cashMovement.create({
              data:{
                sessionId:session.id,
                kind:"ENTRADA",
                amount,
                description:"Recebimento da parcela da venda #"+sale.number,
                referenceId:sale.id
              }
            });
          }

          const settlement=await tx.accountSettlement.create({
            data:{
              accountId,
              amount,
              method:method.name,
              methodId:method.id,
              reference:b.reference||undefined,
              notes:b.notes||undefined,
              payment:{connect:{id:payment.id}}
            }
          });
          const paidAmount=Number(account.paidAmount)+amount;
          const updated=await tx.account.update({where:{id:accountId},data:{paidAmount,status:paidAmount+0.001>=Number(account.amount)?"PAGO":"PARCIAL"}});
          return {settlement,account:updated,payment,movement};
        }

        const settlement=await tx.accountSettlement.create({
          data:{accountId,amount,method:b.method||undefined,methodId:b.methodId||undefined,reference:b.reference||undefined,notes:b.notes||undefined}
        });
        const paidAmount=Number(account.paidAmount)+amount;
        const updated=await tx.account.update({where:{id:accountId},data:{paidAmount,status:paidAmount+0.001>=Number(account.amount)?"PAGO":"PARCIAL"}});
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