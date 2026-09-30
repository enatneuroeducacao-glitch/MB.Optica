import {NextResponse} from "next/server";
import {db} from "@/lib/db";

const num=(v:any)=>Number(v||0);
const money=(v:number)=>Math.round(v*100)/100;

export async function GET(){
  try{
    const today=new Date();
    const start=new Date(today); start.setHours(0,0,0,0);
    const tomorrow=new Date(start); tomorrow.setDate(tomorrow.getDate()+1);

    const [
      accountsReceivable,
      accountsPayable,
      overdue,
      cashSessions,
      products,
      salesToday,
      legacyRows
    ]=await Promise.all([
      db.account.findMany({where:{type:"RECEBER",status:{in:["PENDENTE","PARCIAL"]}},select:{amount:true,paidAmount:true}}),
      db.account.findMany({where:{type:"PAGAR",status:{in:["PENDENTE","PARCIAL"]}},select:{amount:true,paidAmount:true}}),
      db.account.count({where:{status:{in:["PENDENTE","PARCIAL"]},dueDate:{lt:start}}}),
      db.cashSession.findMany({where:{closedAt:null},include:{movements:true},orderBy:{openedAt:"desc"},take:10}),
      db.product.findMany({where:{active:true},select:{minimumStock:true,movements:{select:{type:true,quantity:true}}}}),
      db.sale.findMany({where:{canceled:false,createdAt:{gte:start,lt:tomorrow}},select:{total:true}}),
      db.legacyRecord.findMany({where:{source:"BEEPSTART"},select:{collectionKey:true,payload:true}})
    ]);

    const openBalance=(rows:any[])=>rows.reduce((s,r)=>s+Math.max(0,num(r.amount)-num(r.paidAmount)),0);
    const receivable=openBalance(accountsReceivable);
    const payable=openBalance(accountsPayable);
    const cashBalance=cashSessions.reduce((total:number,c:any)=>{
      const inMov=c.movements.filter((m:any)=>["ENTRADA","REFORCO"].includes(m.kind)).reduce((s:number,m:any)=>s+num(m.amount),0);
      const outMov=c.movements.filter((m:any)=>["SAIDA","SANGRIA"].includes(m.kind)).reduce((s:number,m:any)=>s+num(m.amount),0);
      return total+num(c.openingCash)+inMov-outMov;
    },0);
    const stock=products.map((p:any)=>p.movements.reduce((s:number,m:any)=>s+([ "ENTRADA","AJUSTE","DEVOLUCAO" ].includes(m.type)?num(m.quantity):-num(m.quantity)),0));
    const lowStock=stock.filter((q:number,i:number)=>q<=num(products[i].minimumStock)).length;
    const zeroStock=stock.filter((q:number)=>q<=0).length;
    const todaySales=salesToday.reduce((s:number,x:any)=>s+num(x.total),0);

    let billing=0,received=0,legacyReceivable=0,legacyPayable=0,salesCount=0;
    const months=Array.from({length:12},()=>({sales:0,billing:0,received:0}));
    const year=2026;
    const dateOf=(v:any)=>{const n=num(v);return n?new Date(n):null};
    const monthOf=(v:any)=>{const d=dateOf(v);return d&&d.getUTCFullYear()===year?d.getUTCMonth():null};

    for(const row of legacyRows){
      const p=(row.payload||{}) as Record<string,any>;
      const c=String(row.collectionKey||"").toLowerCase();
      if(c==="venda"){
        const m=monthOf(p.data);
        if(m!==null && p.concluido!==false){
          const values=p.valoresIDs&&typeof p.valoresIDs==="object"?Object.values(p.valoresIDs).reduce((s:number,v:any)=>s+num(v),0):num(p.valor??p.total);
          const total=Math.max(0,values-num(p.desconto));
          billing+=total;salesCount++;months[m].sales++;months[m].billing+=total;
        }
      }else if(c==="movimentacao"){
        const m=monthOf(p.data);
        const value=num(p.valor);
        if(m!==null&&value>0){received+=value;months[m].received+=value;}
      }else if(c==="contaareceber"){
        if(p.archived===true)continue;
        const installments=Array.isArray(p.parcelas)?p.parcelas.map(num):[];
        const paidCount=Array.isArray(p.pagos)?p.pagos.length:0;
        const balance=installments.length?Math.max(0,installments.slice(Math.min(paidCount,installments.length)).reduce((s:number,v:number)=>s+v,0)):Math.max(0,num(p.valor));
        legacyReceivable+=balance;
      }else if(c==="contaapagar"){
        if(p.archived===true)continue;
        const installments=Array.isArray(p.parcelas)?p.parcelas.map(num):[];
        const paidCount=Array.isArray(p.pagos)?p.pagos.length:0;
        const open=installments.length?Math.max(0,installments.slice(Math.min(paidCount,installments.length)).reduce((s:number,v:number)=>s+v,0)):Math.max(0,num(p.valor));
        legacyPayable+=open;
      }
    }

    const collectionRate=billing>0?received/billing*100:null;
    const netWorkingCapital=receivable-payable;
    const historicalNet=legacyReceivable-legacyPayable;
    const activeMonths=months.filter(m=>m.billing>0);
    const averageMonthlyBilling=activeMonths.length?billing/activeMonths.length:0;
    const top3=months.map((m,i)=>({month:i+1,billing:m.billing})).sort((a,b)=>b.billing-a.billing).slice(0,3);
    const top3Share=billing>0?top3.reduce((s,m)=>s+m.billing,0)/billing*100:0;

    const positives:string[]=[];
    const attention:string[]=[];
    const alerts:{severity:"CRITICO"|"ATENCAO"|"INFORMATIVO";title:string;detail:string}[]=[];

    if(receivable>payable) positives.push("O saldo operacional a receber é superior ao saldo operacional a pagar.");
    if(cashSessions.length>0 && cashBalance>0) positives.push("Há caixa operacional aberto com saldo positivo no momento da análise.");
    if(lowStock<products.length && products.length>0) positives.push(`A maior parte do catálogo ativo não está abaixo do estoque mínimo (${products.length-lowStock} de ${products.length}).`);
    if(collectionRate!==null && collectionRate>=50) positives.push(`No histórico BeepStart de 2026, os recebimentos representam ${collectionRate.toFixed(1).replace(".",",")}% do faturamento registrado.`);
    if(salesCount>0) positives.push(`O histórico de 2026 registra ${salesCount.toLocaleString("pt-BR")} venda(s), fornecendo uma base para acompanhar evolução mensal.`);
    if(!positives.length) positives.push("Ainda não há evidência suficiente nos dados atuais para apontar um fator favorável com segurança.");

    if(receivable>0) attention.push(`Há ${formatMoney(receivable)} em contas a receber operacionais em aberto.`);
    if(payable>0) attention.push(`Há ${formatMoney(payable)} em contas a pagar operacionais em aberto.`);
    if(overdue>0) attention.push(`${overdue} conta(s) operacional(is) estão vencidas e merecem acompanhamento.`);
    if(zeroStock>0) attention.push(`${zeroStock} produto(s) ativo(s) estão sem estoque, o que pode afetar disponibilidade para venda.`);
    if(lowStock>0) attention.push(`${lowStock} produto(s) estão no nível mínimo ou abaixo dele.`);
    if(!cashSessions.length) attention.push("Não há caixa operacional aberto no momento da análise.");
    if(collectionRate!==null && collectionRate<50) attention.push(`Os recebimentos representam ${collectionRate.toFixed(1).replace(".",",")}% do faturamento histórico de 2026; vale acompanhar prazo e inadimplência.`);
    if(top3Share>70 && activeMonths.length>=4) attention.push(`Os 3 maiores meses concentram ${top3Share.toFixed(1).replace(".",",")}% do faturamento histórico de 2026; acompanhe a concentração mensal.`);
    if(!attention.length) attention.push("Nenhum ponto de atenção relevante foi identificado pelos indicadores disponíveis.");

    if(overdue>0) alerts.push({severity:"CRITICO",title:"Contas vencidas",detail:`${overdue} conta(s) operacional(is) estão vencidas e precisam de acompanhamento.`});
    if(payable>receivable && payable>0) alerts.push({severity:"CRITICO",title:"Pressão de capital de giro",detail:`O contas a pagar operacional (${formatMoney(payable)}) supera o contas a receber (${formatMoney(receivable)}).`});
    if(zeroStock>0) alerts.push({severity:"CRITICO",title:"Produtos sem estoque",detail:`${zeroStock} produto(s) ativo(s) estão sem estoque.`});
    if(lowStock>0 && zeroStock===0) alerts.push({severity:"ATENCAO",title:"Estoque no limite",detail:`${lowStock} produto(s) estão no nível mínimo ou abaixo dele.`});
    if(receivable>0) alerts.push({severity:"ATENCAO",title:"Valores a receber",detail:`Há ${formatMoney(receivable)} em contas a receber operacionais em aberto.`});
    if(payable>0) alerts.push({severity:"ATENCAO",title:"Compromissos a pagar",detail:`Há ${formatMoney(payable)} em contas a pagar operacionais em aberto.`});
    if(!cashSessions.length) alerts.push({severity:"ATENCAO",title:"Caixa operacional fechado",detail:"Não há sessão de caixa aberta no momento da análise."});
    if(collectionRate!==null && collectionRate<50) alerts.push({severity:"ATENCAO",title:"Recebimentos abaixo do faturamento",detail:`Os recebimentos representam ${collectionRate.toFixed(1).replace(".",",")}% do faturamento histórico de 2026.`});
    if(top3Share>70 && activeMonths.length>=4) alerts.push({severity:"INFORMATIVO",title:"Concentração de faturamento",detail:`Os 3 maiores meses concentram ${top3Share.toFixed(1).replace(".",",")}% do faturamento histórico de 2026.`});
    if(todaySales===0) alerts.push({severity:"INFORMATIVO",title:"Faturamento de hoje",detail:"Não há vendas registradas hoje até o momento da análise."});
    if(!alerts.length) alerts.push({severity:"INFORMATIVO",title:"Sem alertas relevantes",detail:"Nenhum alerta foi acionado pelos indicadores disponíveis."});

    return NextResponse.json({
      ok:true,
      generatedAt:today.toISOString(),
      period:"2026",
      operational:{
        cashBalance:money(cashBalance),
        cashOpen:cashSessions.length>0,
        receivable:money(receivable),
        payable:money(payable),
        netWorkingCapital:money(netWorkingCapital),
        overdue,
        todaySales:money(todaySales),
        activeProducts:products.length,
        lowStock,
        zeroStock
      },
      historical:{
        billing:money(billing),
        received:money(received),
        receivable:money(legacyReceivable),
        payable:money(legacyPayable),
        netWorkingCapital:money(historicalNet),
        salesCount,
        activeMonths:activeMonths.length,
        averageMonthlyBilling:money(averageMonthlyBilling),
        collectionRate:collectionRate===null?null:money(collectionRate),
        top3Share:money(top3Share),
        months:months.map((m,i)=>({month:i+1,...Object.fromEntries(Object.entries(m).map(([k,v])=>[k,money(v)]))}))
      },
      positives,
      attention,
      alerts,
      methodology:[
        "O relatório combina indicadores operacionais atuais do MB Óptica com o histórico financeiro BeepStart de 2026.",
        "Fluxo de caixa, contas a receber, contas a pagar, estoque e faturamento são analisados separadamente.",
        "Os pontos de atenção são alertas gerenciais baseados nos dados disponíveis; não substituem uma DRE, balanço ou análise contábil."
      ]
    });
  }catch(error){
    return NextResponse.json({error:"Não foi possível gerar o relatório de saúde econômica",detail:String(error)},{status:500});
  }
}

function formatMoney(value:number){
  return "R$ "+value.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
}
