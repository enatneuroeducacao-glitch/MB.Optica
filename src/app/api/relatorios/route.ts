import {NextResponse} from "next/server";
import {db} from "@/lib/db";

const n=(v:any)=>Number(v||0);
const startOfDay=(d:Date)=>{const x=new Date(d);x.setHours(0,0,0,0);return x};
const daysAgo=(days:number)=>{const d=new Date();d.setDate(d.getDate()-days);return startOfDay(d)};

export async function GET(){
  try{
    const today=startOfDay(new Date());
    const since=daysAgo(365);
    const [customers,products,orders,sales,accounts,settlements,cashSessions,stockMovements,quotes,prescriptions,appointments,auditLogs,fiscalDocuments,users,suppliers]=await Promise.all([
      db.customer.findMany({select:{id:true,name:true,cpfCnpj:true,phone:true,active:true,createdAt:true}}),
      db.product.findMany({include:{category:{select:{name:true}},supplier:{select:{name:true}},movements:true}}),
      db.opticalOrder.findMany({include:{customer:{select:{name:true}},seller:{select:{name:true}},items:true,events:true},orderBy:{createdAt:"desc"},take:1000}),
      db.sale.findMany({include:{customer:{select:{name:true}},seller:{select:{name:true}},items:{include:{product:{select:{code:true,description:true}}}},payments:{include:{method:{select:{name:true}}}},accounts:true,fiscalDocument:true},orderBy:{createdAt:"desc"},take:1000}),
      db.account.findMany({include:{customer:{select:{name:true}},supplier:{select:{name:true}},sale:{select:{number:true}}}}),
      db.accountSettlement.findMany({include:{account:{select:{type:true,description:true}}},orderBy:{paidAt:"desc"},take:2000}),
      db.cashSession.findMany({include:{movements:true},orderBy:{openedAt:"desc"},take:365}),
      db.stockMovement.findMany({include:{product:{select:{code:true,description:true,cost:true,salePrice:true}}},orderBy:{createdAt:"desc"},take:2000}),
      db.quote.findMany({include:{customer:{select:{name:true}},seller:{select:{name:true}},items:true,order:true},orderBy:{createdAt:"desc"},take:1000}),
      db.prescription.findMany({include:{customer:{select:{name:true}}},orderBy:{date:"desc"},take:1000}),
      db.appointment.findMany({include:{customer:{select:{name:true}}},orderBy:{scheduledAt:"asc"},take:1000}),
      db.auditLog.findMany({include:{user:{select:{name:true,role:true}}},orderBy:{createdAt:"desc"},take:2000}),
      db.fiscalDocument.findMany({include:{sale:{select:{number:true,total:true}}},orderBy:{createdAt:"desc"},take:1000}),
      db.user.findMany({select:{id:true,name:true,email:true,role:true,active:true,lastLoginAt:true}}),
      db.supplier.findMany({include:{products:{select:{id:true}}},orderBy:{name:"asc"}})
    ]);

    const activeSales=sales.filter((s:any)=>!s.canceled);
    const saleTotal=activeSales.reduce((a:number,s:any)=>a+n(s.total),0);
    const saleCost=activeSales.reduce((a:number,s:any)=>a+s.items.reduce((x:number,i:any)=>x+n(i.unitCost)*n(i.quantity),0),0);
    const paid=settlements.filter((x:any)=>x.account.type==="RECEBER").reduce((a:number,x:any)=>a+n(x.amount),0);
    const payablePaid=settlements.filter((x:any)=>x.account.type==="PAGAR").reduce((a:number,x:any)=>a+n(x.amount),0);
    const receivable=accounts.filter((a:any)=>a.type==="RECEBER"&&a.status!=="PAGO"&&a.status!=="CANCELADO").reduce((a:number,x:any)=>a+Math.max(0,n(x.amount)-n(x.paidAmount)),0);
    const payable=accounts.filter((a:any)=>a.type==="PAGAR"&&a.status!=="PAGO"&&a.status!=="CANCELADO").reduce((a:number,x:any)=>a+Math.max(0,n(x.amount)-n(x.paidAmount)),0);
    const cashSessionsOpen=cashSessions.filter((c:any)=>!c.closedAt);
    const cashBalance=cashSessionsOpen.reduce((total:number,c:any)=>total+n(c.openingCash)+c.movements.filter((m:any)=>["ENTRADA","REFORCO"].includes(m.kind)).reduce((a:number,m:any)=>a+n(m.amount),0)-c.movements.filter((m:any)=>["SAIDA","SANGRIA"].includes(m.kind)).reduce((a:number,m:any)=>a+n(m.amount),0),0);

    const stock=products.map((p:any)=>{
      const quantity=p.movements.reduce((a:number,m:any)=>a+([ "ENTRADA","AJUSTE","DEVOLUCAO" ].includes(m.type)?n(m.quantity):-n(m.quantity)),0);
      return {id:p.id,code:p.code,description:p.description,category:p.category?.name||"",brand:p.brand||"",quantity,minimum:n(p.minimumStock),cost:n(p.cost),salePrice:n(p.salePrice)};
    });
    const lowStock=stock.filter((p:any)=>p.quantity<=p.minimum);
    const zeroStock=stock.filter((p:any)=>p.quantity<=0);

    const orderStatuses=["ORCAMENTO","APROVADO","PEDIDO","AGUARDANDO_LABORATORIO","EM_PRODUCAO","RECEBIDO","CONFERENCIA","RETORNO_GARANTIA","PRONTO","ENTREGUE","CANCELADO","DEVOLVIDO"];
    const orderStatus:Record<string,number>={};
    orderStatuses.forEach((status)=>{orderStatus[status]=orders.filter((o:any)=>o.status===status).length});

    const paymentMap:Record<string,number>={};
    activeSales.flatMap((s:any)=>s.payments).forEach((p:any)=>{const key=p.method?.name||"Não informado";paymentMap[key]=(paymentMap[key]||0)+n(p.amount)});
    const sellerMap:Record<string,number>={};
    activeSales.forEach((s:any)=>{const key=s.seller?.name||"Sem vendedor";sellerMap[key]=(sellerMap[key]||0)+n(s.total)});
    const itemMap:Record<string,number>={};
    activeSales.flatMap((s:any)=>s.items).forEach((i:any)=>{const key=i.description||"Item";itemMap[key]=(itemMap[key]||0)+n(i.total)});

    const monthly:any[]=[];
    for(let idx=11;idx>=0;idx--){
      const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-idx);
      const y=d.getFullYear(),mo=d.getMonth();
      const rows=activeSales.filter((s:any)=>s.createdAt.getFullYear()===y&&s.createdAt.getMonth()===mo);
      monthly.push({month:y+"-"+String(mo+1).padStart(2,"0"),sales:rows.length,total:rows.reduce((a:number,x:any)=>a+n(x.total),0),received:rows.flatMap((x:any)=>x.payments).reduce((a:number,p:any)=>a+n(p.amount),0)});
    }

    const inconsistencies:Array<{severity:string;type:string;message:string;entity?:string;entityId?:string}>=[];
    const push=(severity:string,type:string,message:string,entity?:string,entityId?:string)=>{inconsistencies.push({severity,type,message,entity,entityId})};

    products.forEach((p:any)=>{
      const q=stock.find((x:any)=>x.id===p.id)?.quantity||0;
      if(q<0)push("CRÍTICO","ESTOQUE","Estoque negativo: "+p.description+" ("+q+")","Product",p.id);
      if(n(p.salePrice)>0&&n(p.salePrice)<n(p.cost))push("ALERTA","MARGEM","Preço de venda abaixo do custo: "+p.description,"Product",p.id);
    });
    accounts.forEach((a:any)=>{
      if(n(a.paidAmount)>n(a.amount)+0.01)push("CRÍTICO","FINANCEIRO","Conta com pagamento superior ao valor: "+a.description,"Account",a.id);
      if(a.dueDate<today&&a.status!=="PAGO"&&a.status!=="CANCELADO")push("ATENÇÃO","VENCIMENTO","Título vencido: "+a.description,"Account",a.id);
    });
    sales.forEach((s:any)=>{
      const itemTotal=s.items.reduce((a:number,i:any)=>a+n(i.total),0);
      if(!s.canceled&&Math.abs(itemTotal+n(s.surcharge)-n(s.discount)-n(s.total))>0.05)push("CRÍTICO","VENDA","Total da venda #"+s.number+" não confere com os itens","Sale",s.id);
      if(!s.canceled&&!s.sellerId)push("CRÍTICO","VENDA","Venda #"+s.number+" sem vendedor","Sale",s.id);
    });
    orders.forEach((o:any)=>{
      if(["ENTREGUE","PRONTO"].includes(o.status)&&!o.dueDate)push("ALERTA","PEDIDO","Pedido #"+o.number+" sem data de entrega definida","OpticalOrder",o.id);
      if(o.status==="EM_PRODUCAO"&&!o.laboratory)push("CRÍTICO","LABORATÓRIO","Pedido #"+o.number+" em produção sem laboratório","OpticalOrder",o.id);
    });
    fiscalDocuments.forEach((f:any)=>{
      if(f.status==="REJEITADO")push("CRÍTICO","FISCAL","Documento fiscal rejeitado: "+(f.rejectionMessage||f.number||f.id),"FiscalDocument",f.id);
      if(f.status==="AUTORIZADO"&&!f.accessKey)push("CRÍTICO","FISCAL","Documento fiscal autorizado sem chave de acesso","FiscalDocument",f.id);
    });
    customers.forEach((c:any)=>{if(c.active&&(!c.name||c.name.trim().length<3))push("ALERTA","CADASTRO","Cliente ativo com nome incompleto","Customer",c.id)});
    quotes.forEach((q:any)=>{if(q.status==="ABERTO"&&q.validUntil&&q.validUntil<today)push("ATENÇÃO","ORÇAMENTO","Orçamento #"+q.number+" vencido e ainda aberto","Quote",q.id)});

    const recentAudit=auditLogs.filter((a:any)=>a.createdAt>=since);
    const topItems=Object.entries(itemMap).sort((a:any,b:any)=>n(b[1])-n(a[1])).slice(0,20).map(([description,total])=>({description,total}));

    return NextResponse.json({
      generatedAt:new Date().toISOString(),
      summary:{customers:customers.length,activeCustomers:customers.filter((c:any)=>c.active).length,products:products.length,lowStock:lowStock.length,zeroStock:zeroStock.length,sales:activeSales.length,saleTotal,saleCost,grossMargin:saleTotal-saleCost,orders:orders.length,quotes:quotes.length,receivable,payable,received:paid,payablePaid,cashBalance,openCash:cashSessionsOpen.length,fiscalPending:fiscalDocuments.filter((f:any)=>f.status==="PENDENTE").length,fiscalRejected:fiscalDocuments.filter((f:any)=>f.status==="REJEITADO").length,auditEvents:recentAudit.length,inconsistencies:inconsistencies.length},
      sales:{monthly,paymentMethods:Object.entries(paymentMap).map(([name,value])=>({name,value})),bySeller:Object.entries(sellerMap).map(([name,total])=>({name,total})),topItems},
      stock:{items:stock,lowStock,zeroStock,recentMovements:stockMovements.slice(0,100)},
      orders:{byStatus:orderStatus,recent:orders.slice(0,100).map((o:any)=>({number:o.number,status:o.status,customer:o.customer.name,seller:o.seller?.name||"",laboratory:o.laboratory||"",dueDate:o.dueDate,createdAt:o.createdAt}))},
      finance:{accounts:accounts.slice(0,300),settlements:settlements.slice(0,300),cashSessions:cashSessions.slice(0,90)},
      customers:{new30:customers.filter((c:any)=>c.createdAt>=daysAgo(30)).length,active:customers.filter((c:any)=>c.active).length,withPhone:customers.filter((c:any)=>c.phone).length,withoutDocument:customers.filter((c:any)=>!c.cpfCnpj).length},
      quotes:{open:quotes.filter((q:any)=>q.status==="ABERTO").length,expired:quotes.filter((q:any)=>q.status==="ABERTO"&&q.validUntil&&q.validUntil<today).length,converted:quotes.filter((q:any)=>q.order).length},
      prescriptions:{total:prescriptions.length,valid:prescriptions.filter((p:any)=>!p.validUntil||p.validUntil>=today).length,expired:prescriptions.filter((p:any)=>p.validUntil&&p.validUntil<today).length},
      appointments:{total:appointments.length,today:appointments.filter((a:any)=>startOfDay(a.scheduledAt).getTime()===today.getTime()).length,pending:appointments.filter((a:any)=>a.status==="AGENDADO").length},
      fiscal:{total:fiscalDocuments.length,authorized:fiscalDocuments.filter((f:any)=>f.status==="AUTORIZADO").length,rejected:fiscalDocuments.filter((f:any)=>f.status==="REJEITADO").length,pending:fiscalDocuments.filter((f:any)=>f.status==="PENDENTE").length},
      users:{total:users.length,active:users.filter((u:any)=>u.active).length},
      suppliers:{total:suppliers.length,withProducts:suppliers.filter((s:any)=>s.products.length>0).length},
      audit:{events:recentAudit.slice(0,300)},
      inconsistencies
    });
  }catch(error){
    return NextResponse.json({error:"Não foi possível gerar os relatórios",detail:String(error)},{status:500});
  }
}