import {NextResponse} from "next/server";
import {db} from "@/lib/db";

const n=(v:any)=>Number(v||0);
const startOfDay=(d:Date)=>{const x=new Date(d);x.setHours(0,0,0,0);return x};
const daysAgo=(days:number)=>{const d=new Date();d.setDate(d.getDate()-days);return startOfDay(d)};

export async function GET(){
  try{
    const since=daysAgo(365);
    const [
      customers,products,orders,sales,accounts,settlements,cashSessions,stockMovements,quotes,prescriptions,appointments,auditLogs,fiscalDocuments,users,suppliers
    ]=await Promise.all([
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

    const today=startOfDay(new Date());
    const activeSales=sales.filter(s=>!s.canceled);
    const saleTotal=activeSales.reduce((a,s)=>a+n(s.total),0);
    const saleCost=activeSales.reduce((a,s)=>a+s.items.reduce((x,i)=>x+n(i.unitCost)*n(i.quantity),0),0);
    const paid=settlements.filter(s=>s.account.type==="RECEBER").reduce((a,s)=>a+n(s.amount),0);
    const payablePaid=settlements.filter(s=>s.account.type==="PAGAR").reduce((a,s)=>a+n(s.amount),0);
    const receivable=accounts.filter(a=>a.type==="RECEBER"&&a.status!=="PAGO"&&a.status!=="CANCELADO").reduce((a,x)=>a+Math.max(0,n(x.amount)-n(x.paidAmount)),0);
    const payable=accounts.filter(a=>a.type==="PAGAR"&&a.status!=="PAGO"&&a.status!=="CANCELADO").reduce((a,x)=>a+Math.max(0,n(x.amount)-n(x.paidAmount)),0);
    const cashSessionsOpen=cashSessions.filter(c=>!c.closedAt);
    const cashBalance=cashSessionsOpen.reduce((total,c)=>total+n(c.openingCash)+c.movements.filter(m=>["ENTRADA","REFORCO"].includes(m.kind)).reduce((a,m)=>a+n(m.amount),0)-c.movements.filter(m=>["SAIDA","SANGRIA"].includes(m.kind)).reduce((a,m)=>a+n(m.amount),0),0);
    const stock=products.map(p=>({id:p.id,code:p.code,description:p.description,category:p.category?.name||"",brand:p.brand||"",quantity:p.movements.reduce((a,m)=>a+(["ENTRADA","AJUSTE","DEVOLUCAO"].includes(m.type)?n(m.quantity):-n(m.quantity)),0),minimum:n(p.minimumStock),cost:n(p.cost),salePrice:n(p.salePrice)}));
    const lowStock=stock.filter(p=>p.quantity<=p.minimum);
    const zeroStock=stock.filter(p=>p.quantity<=0);
    const orderStatus=Object.fromEntries(Object.values(["ORCAMENTO","APROVADO","PEDIDO","AGUARDANDO_LABORATORIO","EM_PRODUCAO","RECEBIDO","CONFERENCIA","RETORNO_GARANTIA","PRONTO","ENTREGUE","CANCELADO","DEVOLVIDO"]).map(s=>[s,orders.filter(o=>o.status===s).length]));
    const paymentMethods=Object.entries(activeSales.flatMap(s=>s.payments).reduce((m,p)=>{const k=p.method.name;m[k]=(m[k]||0)+n(p.amount);return m},{})).map(([name,value])=>({name,value}));
    const sellerMap=activeSales.reduce((m,s)=>{const k=s.seller.name;m[k]=(m[k]||0)+n(s.total);return m},{}); 
    const categoryMap=activeSales.flatMap(s=>s.items).reduce((m,i)=>{const k=i.productId||"SERVIÇO";m[k]=(m[k]||0)+n(i.total);return m},{});
    const monthly=Array.from({length:12},(_,idx)=>{const d=new Date();d.setMonth(d.getMonth()-11+idx,1);const y=d.getFullYear(),mo=d.getMonth();const rows=activeSales.filter(s=>{const x=s.createdAt;return x.getFullYear()===y&&x.getMonth()===mo});return {month:`${y}-${String(mo+1).padStart(2,"0")}`,sales:rows.length,total:rows.reduce((a,s)=>a+n(s.total),0),received:rows.flatMap(s=>s.payments).reduce((a,p)=>a+n(p.amount),0)}});
    const inconsistencies:{severity:string;type:string;message:string;entity?:string;entityId?:string}[]=[];
    const push=(severity:string,type:string,message:string,entity?:string,entityId?:string)=>inconsistencies.push({severity,type,message,entity,entityId});
    products.forEach(p=>{const q=stock.find(x=>x.id===p.id)?.quantity||0;if(q<0)push("CRÍTICO","ESTOQUE",`Estoque negativo: ${p.description} (${q})`,"Product",p.id);if(n(p.salePrice)<n(p.cost)&&n(p.salePrice)>0)push("ALERTA","MARGEM",`Preço de venda abaixo do custo: ${p.description}`,"Product",p.id)});
    accounts.forEach(a=>{if(n(a.paidAmount)>n(a.amount)+0.01)push("CRÍTICO","FINANCEIRO",`Conta com pagamento superior ao valor: ${a.description}`,"Account",a.id);if(a.dueDate<today&&a.status!=="PAGO"&&a.status!=="CANCELADO")push("ATENÇÃO","VENCIMENTO",`Título vencido: ${a.description}`,"Account",a.id)});
    sales.forEach(s=>{const itemTotal=s.items.reduce((a,i)=>a+n(i.total),0);if(!s.canceled&&Math.abs(itemTotal+n(s.surcharge)-n(s.discount)-n(s.total))>0.05)push("CRÍTICO","VENDA",`Total da venda #${s.number} não confere com os itens`,"Sale",s.id);if(!s.sellerId)push("CRÍTICO","VENDA",`Venda #${s.number} sem vendedor`,"Sale",s.id)});
    orders.forEach(o=>{if(["ENTREGUE","PRONTO"].includes(o.status)&&!o.dueDate)push("ALERTA","PEDIDO",`Pedido #${o.number} sem data de entrega definida`,"OpticalOrder",o.id);if(o.status==="EM_PRODUCAO"&&!o.laboratory)push("CRÍTICO","LABORATÓRIO",`Pedido #${o.number} em produção sem laboratório`,"OpticalOrder",o.id)});
    fiscalDocuments.forEach(f=>{if(f.status==="REJEITADO")push("CRÍTICO","FISCAL",`Documento fiscal rejeitado: ${f.rejectionMessage||f.number||f.id}`,"FiscalDocument",f.id);if(f.status==="AUTORIZADO"&&!f.accessKey)push("CRÍTICO","FISCAL",`Documento fiscal autorizado sem chave de acesso`,"FiscalDocument",f.id)});
    customers.forEach(c=>{if(c.active&&(!c.name||c.name.trim().length<3))push("ALERTA","CADASTRO","Cliente ativo com nome incompleto","Customer",c.id)});
    quotes.forEach(q=>{if(q.status==="ABERTO"&&q.validUntil&&q.validUntil<today)push("ATENÇÃO","ORÇAMENTO",`Orçamento #${q.number} vencido e ainda aberto`,"Quote",q.id)});
    const reportSince=since;
    const recentAudit=auditLogs.filter(a=>a.createdAt>=reportSince);
    return NextResponse.json({
      generatedAt:new Date().toISOString(),
      summary:{customers:customers.length,activeCustomers:customers.filter(c=>c.active).length,products:products.length,lowStock:lowStock.length,zeroStock:zeroStock.length,sales:activeSales.length,saleTotal,saleCost,grossMargin:saleTotal-saleCost,orders:orders.length,quotes:quotes.length,receivable,payable,received:paid,payablePaid,cashBalance,openCash:cashSessionsOpen.length,fiscalPending:fiscalDocuments.filter(f=>f.status==="PENDENTE").length,fiscalRejected:fiscalDocuments.filter(f=>f.status==="REJEITADO").length,auditEvents:recentAudit.length,inconsistencies:inconsistencies.length}),
      sales:{monthly,paymentMethods,bySeller:Object.entries(sellerMap).map(([name,total])=>({name,total})),topItems:Object.entries(activeSales.flatMap(s=>s.items).reduce((m,i)=>{const k=i.description;m[k]=(m[k]||0)+n(i.total);return m},{})).sort((a,b)=>n(b[1])-n(a[1])).slice(0,20).map(([description,total])=>({description,total}))},
      stock:{items:stock,lowStock,zeroStock,recentMovements:stockMovements.slice(0,100)},
      orders:{byStatus:orderStatus,recent:orders.slice(0,100).map(o=>({number:o.number,status:o.status,customer:o.customer.name,seller:o.seller?.name||"",laboratory:o.laboratory||"",dueDate:o.dueDate,createdAt:o.createdAt}))},
      finance:{accounts:accounts.slice(0,300),settlements:settlements.slice(0,300),cashSessions:cashSessions.slice(0,90)},
      customers:{new30:customers.filter(c=>c.createdAt>=daysAgo(30)).length,active:customers.filter(c=>c.active).length,withPhone:customers.filter(c=>c.phone||c.whatsapp).length,withoutDocument:customers.filter(c=>!c.cpfCnpj).length},
      quotes:{open:quotes.filter(q=>q.status==="ABERTO").length,expired:quotes.filter(q=>q.status==="ABERTO"&&q.validUntil&&q.validUntil<today).length,converted:quotes.filter(q=>q.order).length},
      prescriptions:{total:prescriptions.length,valid:prescriptions.filter(p=>!p.validUntil||p.validUntil>=today).length,expired:prescriptions.filter(p=>p.validUntil&&p.validUntil<today).length},
      appointments:{total:appointments.length,today:appointments.filter(a=>startOfDay(a.scheduledAt).getTime()===today.getTime()).length,pending:appointments.filter(a=>a.status==="AGENDADO").length},
      fiscal:{total:fiscalDocuments.length,authorized:fiscalDocuments.filter(f=>f.status==="AUTORIZADO").length,rejected:fiscalDocuments.filter(f=>f.status==="REJEITADO").length,pending:fiscalDocuments.filter(f=>f.status==="PENDENTE").length},
      users:{total:users.length,active:users.filter(u=>u.active).length,byRole:Object.entries(users.reduce((m,u)=>{m[u.role]=(m[u.role]||0)+1;return m},{}))},
      suppliers:{total:suppliers.length,withProducts:suppliers.filter(s=>s.products.length>0).length},
      audit:{events:recentAudit.slice(0,300)},
      inconsistencies
    });
  }catch(error){return NextResponse.json({error:"Não foi possível gerar os relatórios",detail:String(error)},{status:500})}
}