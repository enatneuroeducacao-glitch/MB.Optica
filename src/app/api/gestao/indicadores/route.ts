import {NextResponse} from "next/server";
import {db} from "@/lib/db";

const num=(value:any)=>Number(value||0);
const money=(value:number)=>Math.round(value*100)/100;

const startOfDay=(date:Date)=>{
  const d=new Date(date);
  d.setHours(0,0,0,0);
  return d;
};

const startOfMonth=(date:Date)=>{
  const d=startOfDay(date);
  d.setDate(1);
  return d;
};

const startOfPreviousMonth=(date:Date)=>{
  const d=startOfMonth(date);
  d.setMonth(d.getMonth()-1);
  return d;
};

const outstanding=(rows:any[])=>rows.reduce(
  (sum,row)=>sum+Math.max(0,num(row.amount)-num(row.paidAmount)),
  0
);

const stockQuantity=(product:any)=>{
  return (product.movements||[]).reduce(
    (sum:number,movement:any)=>sum+(
      ["ENTRADA","AJUSTE","DEVOLUCAO"].includes(movement.type)
        ? num(movement.quantity)
        : -num(movement.quantity)
    ),
    0
  );
};

export async function GET(){
  try{
    const now=new Date();
    const today=startOfDay(now);
    const tomorrow=new Date(today);
    tomorrow.setDate(tomorrow.getDate()+1);
    const monthStart=startOfMonth(now);
    const previousMonthStart=startOfPreviousMonth(now);

    const [
      sales,
      previousMonthSales,
      products,
      receivables,
      payables,
      overdueAccounts,
      cashSessions,
      suppliers,
      supplierAccounts
    ]=await Promise.all([
      db.sale.findMany({
        where:{canceled:false,createdAt:{gte:monthStart,lt:tomorrow}},
        select:{
          id:true,
          total:true,
          discount:true,
          surcharge:true,
          createdAt:true,
          sellerId:true,
          items:{select:{quantity:true,unitCost:true,total:true}}
        }
      }),
      db.sale.findMany({
        where:{canceled:false,createdAt:{gte:previousMonthStart,lt:monthStart}},
        select:{
          total:true,
          discount:true,
          surcharge:true,
          items:{select:{quantity:true,unitCost:true,total:true,product:{select:{id:true,code:true,description:true}}}}
        }
      }),
      db.product.findMany({
        where:{active:true},
        select:{
          id:true,
          code:true,
          description:true,
          minimumStock:true,
          cost:true,
          salePrice:true,
          supplierId:true,
          movements:{select:{type:true,quantity:true}}
        }
      }),
      db.account.findMany({
        where:{type:"RECEBER",status:{in:["PENDENTE","PARCIAL"]}},
        select:{amount:true,paidAmount:true,dueDate:true}
      }),
      db.account.findMany({
        where:{type:"PAGAR",status:{in:["PENDENTE","PARCIAL"]}},
        select:{amount:true,paidAmount:true,dueDate:true}
      }),
      db.account.findMany({
        where:{
          status:{in:["PENDENTE","PARCIAL"]},
          dueDate:{lt:today}
        },
        select:{type:true,amount:true,paidAmount:true,dueDate:true}
      }),
      db.cashSession.findMany({
        where:{closedAt:null},
        include:{movements:true},
        orderBy:{openedAt:"desc"},
        take:10
      }),
      db.supplier.findMany({
        where:{active:true},
        select:{id:true,name:true,products:{select:{id:true}}}
      }),
      db.account.findMany({
        where:{type:"PAGAR",status:{in:["PENDENTE","PARCIAL"]},supplierId:{not:null}},
        select:{supplierId:true,amount:true,paidAmount:true}
      })
    ]);

    const saleTotal=sales.reduce((sum,sale)=>sum+num(sale.total),0);
    const saleCost=sales.reduce(
      (sum,sale)=>sum+(sale.items||[]).reduce(
        (lineSum,item)=>lineSum+num(item.unitCost)*num(item.quantity),
        0
      ),
      0
    );
    const grossMargin=saleTotal-saleCost;
    const grossMarginPercent=saleTotal>0?(grossMargin/saleTotal)*100:0;
    const discountTotal=sales.reduce((sum,sale)=>sum+num(sale.discount),0);
    const grossSalesBeforeDiscount=sales.reduce((sum,sale)=>sum+(sale.items||[]).reduce((lineSum,item)=>lineSum+num(item.total),0)+num(sale.surcharge),0);
    const discountPercent=grossSalesBeforeDiscount>0?(discountTotal/grossSalesBeforeDiscount)*100:0;

    const previousTotal=previousMonthSales.reduce((sum,sale)=>sum+num(sale.total),0);
    const previousCost=previousMonthSales.reduce(
      (sum,sale)=>sum+(sale.items||[]).reduce(
        (lineSum,item)=>lineSum+num(item.unitCost)*num(item.quantity),
        0
      ),
      0
    );
    const previousMargin=previousTotal-previousCost;
    const previousDiscountTotal=previousMonthSales.reduce((sum,sale)=>sum+num(sale.discount),0);
    const previousGrossSalesBeforeDiscount=previousMonthSales.reduce((sum,sale)=>sum+(sale.items||[]).reduce((lineSum,item)=>lineSum+num(item.total),0)+num(sale.surcharge),0);
    const previousMarginPercent=previousTotal>0?(previousMargin/previousTotal)*100:0;
    const marginVariationPoints=grossMarginPercent-previousMarginPercent;
    const marginVariationPercent=previousMarginPercent!==0?(marginVariationPoints/Math.abs(previousMarginPercent))*100:null;

    const productMarginMap=new Map<string,{id:string,code:string,description:string,revenue:number,cost:number,quantity:number}>();
    sales.forEach(sale=>{
      (sale.items||[]).forEach(item=>{
        const product=item.product;
        if(!product?.id)return;
        const current=productMarginMap.get(product.id)||{id:product.id,code:product.code,description:product.description,revenue:0,cost:0,quantity:0};
        current.revenue+=num(item.total);
        current.cost+=num(item.unitCost)*num(item.quantity);
        current.quantity+=num(item.quantity);
        productMarginMap.set(product.id,current);
      });
    });
    const productMargins=Array.from(productMarginMap.values()).map(item=>({
      ...item,
      margin:money(item.revenue-item.cost),
      marginPercent:money(item.revenue>0?((item.revenue-item.cost)/item.revenue)*100:0)
    }));
    const insufficientMarginProducts=productMargins
      .filter(item=>item.revenue>0&&item.marginPercent<20)
      .sort((a,b)=>a.marginPercent-b.marginPercent)
      .slice(0,50);

    const stock=products.map(product=>{
      const quantity=stockQuantity(product);
      return {
        id:product.id,
        code:product.code,
        description:product.description,
        quantity,
        minimumStock:num(product.minimumStock),
        cost:money(num(product.cost)),
        salePrice:money(num(product.salePrice)),
        stockCost:money(quantity*num(product.cost)),
        stockRetail:money(quantity*num(product.salePrice)),
        supplierId:product.supplierId
      };
    });

    const lowStock=stock.filter(item=>item.quantity>0&&item.quantity<=item.minimumStock);
    const belowCostProducts=stock
      .filter(item=>item.salePrice>0&&item.salePrice<item.cost)
      .map(item=>({id:item.id,code:item.code,description:item.description,cost:item.cost,salePrice:item.salePrice,difference:money(item.salePrice-item.cost)}))
      .slice(0,50);
    const zeroStock=stock.filter(item=>item.quantity<=0);
    const negativeStock=stock.filter(item=>item.quantity<0);

    const receivable=outstanding(receivables);
    const payable=outstanding(payables);
    const overdueReceivable=overdueAccounts
      .filter(account=>account.type==="RECEBER")
      .reduce((sum,account)=>sum+Math.max(0,num(account.amount)-num(account.paidAmount)),0);
    const overduePayable=overdueAccounts
      .filter(account=>account.type==="PAGAR")
      .reduce((sum,account)=>sum+Math.max(0,num(account.amount)-num(account.paidAmount)),0);

    const cashBalance=cashSessions.reduce((total,session)=>{
      const entries=(session.movements||[])
        .filter(m=>["ENTRADA","REFORCO"].includes(m.kind))
        .reduce((sum,m)=>sum+num(m.amount),0);
      const exits=(session.movements||[])
        .filter(m=>["SAIDA","SANGRIA"].includes(m.kind))
        .reduce((sum,m)=>sum+num(m.amount),0);
      return total+num(session.openingCash)+entries-exits;
    },0);

    const todaySales=sales.filter(sale=>{
      const created=new Date(sale.createdAt);
      return created>=today&&created<tomorrow;
    });

    const supplierMap=new Map<string,{name:string,products:number,payable:number}>();
    suppliers.forEach(supplier=>{
      supplierMap.set(supplier.id,{
        name:supplier.name,
        products:supplier.products.length,
        payable:0
      });
    });
    supplierAccounts.forEach(account=>{
      if(!account.supplierId)return;
      const current=supplierMap.get(account.supplierId);
      if(current)current.payable+=Math.max(0,num(account.amount)-num(account.paidAmount));
    });

    const supplierIndicators=Array.from(supplierMap.entries())
      .map(([id,value])=>({id,...value,payable:money(value.payable)}))
      .sort((a,b)=>b.payable-a.payable);

    const alerts:Array<{
      severity:"CRITICO"|"ATENCAO"|"INFORMATIVO";
      indicator:string;
      message:string;
    }>=[];

    if(negativeStock.length>0){
      alerts.push({
        severity:"CRITICO",
        indicator:"estoque",
        message:`${negativeStock.length} produto(s) estão com estoque negativo.`
      });
    }
    if(overdueReceivable>0){
      alerts.push({
        severity:"CRITICO",
        indicator:"inadimplencia",
        message:`Há ${money(overdueReceivable).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})} em contas a receber vencidas.`
      });
    }
    if(payable>receivable&&payable>0){
      alerts.push({
        severity:"ATENCAO",
        indicator:"capital_de_giro",
        message:"O saldo em aberto de contas a pagar supera o saldo em contas a receber."
      });
    }
    if(zeroStock.length>0){
      alerts.push({
        severity:"ATENCAO",
        indicator:"estoque",
        message:`${zeroStock.length} produto(s) ativos estão sem estoque.`
      });
    }
    if(lowStock.length>0){
      alerts.push({
        severity:"ATENCAO",
        indicator:"estoque",
        message:`${lowStock.length} produto(s) estão no nível mínimo ou abaixo dele.`
      });
    }
    if(saleTotal>0&&grossMarginPercent<20){
      alerts.push({
        severity:"ATENCAO",
        indicator:"margem",
        message:`A margem bruta do mês está em ${grossMarginPercent.toFixed(1).replace(".",",")}%.`
      });
    }
    if(saleTotal===0){
      alerts.push({
        severity:"INFORMATIVO",
        indicator:"faturamento",
        message:"Não há faturamento registrado no período atual."
      });
    }

    return NextResponse.json({
      ok:true,
      generatedAt:now.toISOString(),
      period:{
        currentMonthStart:monthStart.toISOString(),
        currentMonthEnd:tomorrow.toISOString(),
        previousMonthStart:previousMonthStart.toISOString()
      },
      faturamento:{
        total:money(saleTotal),
        vendas:sales.length,
        ticketMedio:money(sales.length?saleTotal/sales.length:0),
        hoje:money(todaySales.reduce((sum,sale)=>sum+num(sale.total),0)),
        mesAnterior:money(previousTotal),
        variacaoPercentual:previousTotal>0?money(((saleTotal-previousTotal)/previousTotal)*100):null
      },
      margem:{
        custo:money(saleCost),
        margemBruta:money(grossMargin),
        margemBrutaPercentual:money(grossMarginPercent),
        margemMesAnterior:money(previousMargin),
        margemMesAnteriorPercentual:money(previousMarginPercent),
        variacaoPontosPercentuais:money(marginVariationPoints),
        variacaoPercentual:marginVariationPercent===null?null:money(marginVariationPercent),
        descontos:money(discountTotal),
        descontoPercentual:money(discountPercent),
        descontoMesAnterior:money(previousDiscountTotal),
        produtosInsuficientes:insufficientMarginProducts,
        produtosAbaixoDoCusto:belowCostProducts
      },
      estoque:{
        produtosAtivos:stock.length,
        estoqueBaixo:lowStock.length,
        estoqueZero:zeroStock.length,
        estoqueNegativo:negativeStock.length,
        valorCusto:money(stock.reduce((sum,item)=>sum+item.stockCost,0)),
        valorVenda:money(stock.reduce((sum,item)=>sum+item.stockRetail,0)),
        itensCriticos:[...negativeStock,...zeroStock,...lowStock].slice(0,50)
      },
      contas:{
        receber:money(receivable),
        pagar:money(payable),
        capitalDeGiro:money(receivable-payable),
        receberVencido:money(overdueReceivable),
        pagarVencido:money(overduePayable),
        titulosVencidos:overdueAccounts.length
      },
      caixa:{
        aberto:cashSessions.length>0,
        sessoesAbertas:cashSessions.length,
        saldo:money(cashBalance)
      },
      fornecedores:{
        ativos:suppliers.length,
        comProdutos:suppliers.filter(supplier=>supplier.products.length>0).length,
        maioresCompromissos:supplierIndicators.slice(0,10)
      },
      vendas:{
        total:sales.length,
        canceladasExcluidas:true,
        vendedoresComVenda:new Set(sales.map(sale=>sale.sellerId).filter(Boolean)).size
      },
      alertas:alerts
    });
  }catch(error){
    return NextResponse.json(
      {error:"Não foi possível gerar os indicadores gerenciais",detail:String(error)},
      {status:500}
    );
  }
}
