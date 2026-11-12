import {syncPublishedProductStocks} from "@/lib/site-stock-sync";
import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {Prisma} from "@prisma/client";
import {writeAudit} from "@/lib/audit";
import {requireRole} from "@/lib/auth";
import {enqueueAccountingEvent} from "@/lib/accounting-events";

export async function POST(req:Request){
  try{
    const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR"]);
    const b=await req.json();
    if(!b.customerId) throw new Error("customerId é obrigatório");
    if(!b.sellerId) throw new Error("sellerId é obrigatório");
    if(!Array.isArray(b.items)||b.items.length===0) throw new Error("A venda precisa ter itens");
    const saleTypes=["BALCAO","PEDIDO_OPTICO","ENCOMENDA","SERVICO","PRODUTOS","ARMACAO_ADAPTACAO"];
    const saleType=String(b.saleType||"BALCAO");
    if(!saleTypes.includes(saleType)) throw new Error("Tipo de venda inválido");
    if(saleType==="PEDIDO_OPTICO"&&!b.orderId) throw new Error("Selecione o pedido óptico para este tipo de venda");
    if(saleType!=="PEDIDO_OPTICO"&&b.orderId) throw new Error("Pedido óptico só pode ser usado em venda vinculada a pedido óptico");
    if(saleType==="ARMACAO_ADAPTACAO"){
      const service=b.frameAdaptation;
      if(!service||!String(service.newFrameDescription||"").trim()) throw new Error("Informe a armação nova na ordem de serviço.");
      if(!["CLIENTE","LOJA"].includes(String(service.lensSource||"CLIENTE"))) throw new Error("Origem das lentes inválida.");
      if(!["COM_RECEITA","SEM_RECEITA","DADOS_CLIENTE"].includes(String(service.prescriptionStatus||"SEM_RECEITA"))) throw new Error("Situação da receita inválida.");
      if(!["MONTAGEM_ADAPTACAO","MONTAGEM","ADAPTACAO"].includes(String(service.serviceType||"MONTAGEM_ADAPTACAO"))) throw new Error("Serviço de montagem inválido.");
      if(service.prescriptionId){
        const prescription=await db.prescription.findUnique({where:{id:String(service.prescriptionId)}});
        if(!prescription||prescription.customerId!==String(b.customerId)) throw new Error("A receita informada não pertence ao cliente.");
      }
    }

    const discount=Number(b.discount||0);
    const surcharge=Number(b.surcharge||0);
    if(!Number.isFinite(discount)||discount<0||!Number.isFinite(surcharge)||surcharge<0) throw new Error("Desconto ou acréscimo inválido");

    const result=await db.$transaction(async(tx)=>{
      const customer=await tx.customer.findUnique({where:{id:b.customerId}});
      if(!customer||!customer.active) throw new Error("Cliente não encontrado ou inativo");

      const seller=await tx.user.findUnique({where:{id:b.sellerId}});
      if(!seller||!seller.active) throw new Error("Vendedor não encontrado ou inativo");

      let linkedOrder:any=null;
      if(b.orderId){
        linkedOrder=await tx.opticalOrder.findUnique({where:{id:String(b.orderId)}});
        if(!linkedOrder) throw new Error("Pedido óptico não encontrado");
        if(linkedOrder.customerId!==customer.id) throw new Error("Pedido óptico não pertence ao cliente");
        if(["CANCELADO","DEVOLVIDO"].includes(linkedOrder.status)) throw new Error("Pedido óptico não pode gerar venda");
        const existingSale=await tx.sale.findUnique({where:{orderId:linkedOrder.id}});
        if(existingSale) throw new Error("Pedido óptico já possui uma venda");
      }

      let subtotal=0;
      const items:any[]=[];
      for(const item of b.items){
        const quantity=Number(item.quantity);
        const unitPrice=Number(item.unitPrice);
        const itemDiscount=Number(item.discount||0);
        if(!Number.isFinite(quantity)||quantity<=0) throw new Error("Quantidade de item inválida");
        if(!Number.isFinite(unitPrice)||unitPrice<0) throw new Error("Preço de item inválido");
        if(!Number.isFinite(itemDiscount)||itemDiscount<0) throw new Error("Desconto de item inválido");
        const lineTotal=Math.max(0,quantity*unitPrice-itemDiscount);

        let unitCost=Number(item.unitCost||0);
        if(item.productId){
          const product=await tx.product.findUnique({where:{id:item.productId}});
          if(!product||!product.active) throw new Error("Produto não encontrado ou inativo");
          if(!item.description) item.description=product.description;
          if(!Number.isFinite(unitCost)||unitCost<0) unitCost=Number(product.cost);
        }

        subtotal+=lineTotal;
        items.push({
          productId:item.productId||undefined,
          description:String(item.description||"Item"),
          quantity,
          unitPrice,
          unitCost,
          discount:itemDiscount,
          total:lineTotal
        });
      }

      const total=Math.max(0,subtotal-discount+surcharge);
      const installments=Math.max(0,Math.floor(Number(b.installments||0)));
      const entryAmount=Math.max(0,Math.min(total,Number(b.entryAmount||0)));
      const paymentMethodId=b.paymentMethodId?String(b.paymentMethodId):null;
      const paymentCondition=String(b.paymentCondition||"");
      const immediatePayment=["AVISTA","PIX","CARTAO"].includes(paymentCondition);
      const cardMachineId=b.cardMachineId?String(b.cardMachineId):null;
      const cardInstallments=b.cardInstallments===undefined||b.cardInstallments===null||b.cardInstallments===""?null:Math.floor(Number(b.cardInstallments));
      const cardFeeRate=b.cardFeeRate===undefined||b.cardFeeRate===null||b.cardFeeRate===""?null:Number(b.cardFeeRate);
      if(immediatePayment&&!paymentMethodId) throw new Error("Selecione o meio de recebimento. Para receber depois, use Misto ou Crediário/Carnê.");
      if(paymentCondition==="CARTAO"){
        if(!cardMachineId) throw new Error("Selecione a maquininha utilizada.");
        if(!Number.isInteger(cardInstallments)||Number(cardInstallments)<1||Number(cardInstallments)>24) throw new Error("Informe um número válido de parcelas do cartão.");
        if(cardFeeRate===null||!Number.isFinite(cardFeeRate)||cardFeeRate<0||cardFeeRate>100) throw new Error("Informe uma taxa válida para a maquininha.");
      }else if(cardMachineId||cardInstallments!==null||cardFeeRate!==null){
        throw new Error("Dados de maquininha só podem ser informados em venda no cartão de crédito.");
      }
      const mixedPayments=Array.isArray(b.payments)?b.payments:[];
      const mixedPaid=mixedPayments.reduce((sum:any,p:any)=>sum+Math.max(0,Number(p.amount||0)),0);
      const receivableAmount=Math.max(0,Math.min(total,Number(b.receivable?.amount||0)));
      if(installments>0&&!paymentMethodId&&entryAmount>0) throw new Error("Selecione o meio de pagamento da entrada");
      if(installments>0&&installments>60) throw new Error("Parcelamento limitado a 60 parcelas");
      if(String(b.paymentCondition||"") === "MISTO"){
        if(!mixedPayments.length && receivableAmount<=0) throw new Error("Informe pelo menos um pagamento ou saldo a receber");
        if(Math.abs((mixedPaid+receivableAmount)-total)>0.01) throw new Error("A composição dos pagamentos deve fechar exatamente o total da venda");
        if(receivableAmount>0){
          const due=new Date(String(b.receivable?.dueDate||""));
          if(Number.isNaN(due.getTime())) throw new Error("Informe a data do saldo a receber");
        }
      }

      const sale=await tx.sale.create({
        data:{
          customerId:customer.id,
          sellerId:seller.id,
          saleType,
          orderId:linkedOrder?.id,
          subtotal,
          discount,
          surcharge,
          total,
          notes:b.notes||undefined,
          paymentCondition:b.paymentCondition||undefined,
          installments:installments||undefined,
          pixPayload:b.pixPayload||undefined,
          items:{create:items}
        },
        include:{items:true}
      });

      if(saleType==="ARMACAO_ADAPTACAO"){
        const service=b.frameAdaptation;
        await tx.frameAdaptationOrder.create({data:{
          saleId:sale.id,
          customerId:customer.id,
          prescriptionId:service.prescriptionId?String(service.prescriptionId):undefined,
          laboratory:String(service.laboratory||"").trim()||undefined,
          oldFrameDescription:String(service.oldFrameDescription||"").trim()||undefined,
          newFrameDescription:String(service.newFrameDescription).trim(),
          lensSource:String(service.lensSource||"CLIENTE"),
          prescriptionStatus:String(service.prescriptionStatus||"SEM_RECEITA"),
          lensType:String(service.lensType||"").trim()||undefined,
          lensDegreeInfo:String(service.lensDegreeInfo||"").trim()||undefined,
          serviceType:String(service.serviceType||"MONTAGEM_ADAPTACAO"),
          frameCondition:String(service.frameCondition||"").trim()||undefined,
          preexistingDamage:String(service.preexistingDamage||"").trim()||undefined,
          inspectionNotes:String(service.inspectionNotes||"").trim()||undefined,
          photoReferences:String(service.photoReferences||"").trim()||undefined,
          customerAcknowledged:service.customerAcknowledged===true,
          createdByUserId:seller.id
        }});
      }

      await enqueueAccountingEvent(tx, {
        eventType: "SALE_RECOGNIZED",
        sourceType: "Sale",
        sourceId: sale.id,
        idempotencyKey: "SALE_RECOGNIZED:" + sale.id,
        payload: { amount: total, entryDate: sale.createdAt.toISOString(), description: "Reconhecimento da venda #" + sale.number },
      });

      // Venda à vista, PIX e cartão: o recebimento nasce na mesma transação da venda.
      // Assim não existe venda confirmada sem o respectivo lançamento financeiro.
      const createdPayments:any[]=[];
      if(immediatePayment){
        const method=await tx.paymentMethod.findUnique({where:{id:paymentMethodId!}});
        if(!method||!method.active) throw new Error("Meio de recebimento inválido ou inativo.");
        const isCredit=method.name.toLocaleLowerCase("pt-BR").includes("cartão de crédito")||method.name.toLocaleLowerCase("pt-BR").includes("cartao de credito");
        if(paymentCondition==="CARTAO"&&!isCredit) throw new Error("Selecione o meio Cartão de crédito para esta condição.");
        if(paymentCondition!=="CARTAO"&&isCredit) throw new Error("Use a condição Cartão de crédito para registrar a maquininha e suas taxas.");
        let cardMachine:any=null;
        if(paymentCondition==="CARTAO"){
          cardMachine=await tx.cardMachine.findUnique({where:{id:cardMachineId!}});
          if(!cardMachine||!cardMachine.active) throw new Error("Maquininha não encontrada ou inativa.");
        }
        const session=method.isCash
          ? await tx.cashSession.findFirst({where:{closedAt:null},orderBy:{openedAt:"desc"}})
          : null;
        if(method.isCash&&!session) throw new Error("Não há caixa aberto para registrar este recebimento.");
        const cardFeeAmount=paymentCondition==="CARTAO"?Number((total*Number(cardFeeRate)/100).toFixed(2)):null;
        const cardNetAmount=cardFeeAmount===null?null:Number((total-cardFeeAmount).toFixed(2));
        const payment=await tx.payment.create({data:{
          saleId:sale.id,
          methodId:method.id,
          amount:total,
          reference:b.paymentReference?String(b.paymentReference):undefined,
          cardMachineId:cardMachine?.id,
          cardInstallments:paymentCondition==="CARTAO"?cardInstallments!:undefined,
          cardFeeRate:paymentCondition==="CARTAO"?cardFeeRate!:undefined,
          cardFeeAmount:cardFeeAmount??undefined,
          cardNetAmount:cardNetAmount??undefined
        }});
        createdPayments.push(payment);
        await enqueueAccountingEvent(tx,{
          eventType:"PAYMENT_RECEIVED",
          sourceType:"Payment",
          sourceId:payment.id,
          idempotencyKey:"PAYMENT_RECEIVED:"+payment.id,
          payload:{
            amount:total,
            entryDate:payment.paidAt.toISOString(),
            description:"Recebimento da venda #"+sale.number,
            paymentMethodId:method.id,
            paymentMethodName:method.name,
            isCash:method.isCash,
            cardMachineId:cardMachine?.id??null,
            cardFeeAmount:cardFeeAmount??0,
            cardNetAmount:cardNetAmount??total,
            reference:payment.reference??null
          }
        });
        if(method.isCash&&session){
          await tx.cashMovement.create({data:{
            sessionId:session.id,
            kind:"ENTRADA",
            amount:total,
            description:"Pagamento da venda #"+sale.number,
            referenceId:sale.id
          }});
        }
      }

      let createdAccounts:any[]=[];
      let entryPayment:any=null;
      if(String(b.paymentCondition||"") === "MISTO"){
        for(const part of mixedPayments){
          const amount=Number(part.amount||0);
          if(!Number.isFinite(amount)||amount<=0) throw new Error("Valor de pagamento misto inválido");
          if(!part.methodId) throw new Error("Selecione o meio de pagamento de cada parcela recebida");
          const method=await tx.paymentMethod.findUnique({where:{id:String(part.methodId)}});
          if(!method||!method.active) throw new Error("Meio de pagamento inválido");
          const session=method.isCash
            ? await tx.cashSession.findFirst({where:{closedAt:null},orderBy:{openedAt:"desc"}})
            : null;
          if(method.isCash&&!session) throw new Error("Não há caixa aberto para registrar este recebimento");
          const payment=await tx.payment.create({data:{saleId:sale.id,methodId:method.id,amount,reference:part.reference?String(part.reference):undefined}});
          await enqueueAccountingEvent(tx, {
            eventType: "PAYMENT_RECEIVED",
            sourceType: "Payment",
            sourceId: payment.id,
            idempotencyKey: "PAYMENT_RECEIVED:" + payment.id,
            payload: { amount, entryDate: payment.paidAt.toISOString(), description: "Recebimento da venda #" + sale.number, paymentMethodId: method.id, paymentMethodName: method.name, isCash: method.isCash, cardMachineId: null, cardFeeAmount: 0, cardNetAmount: amount, reference: payment.reference ?? null },
          });
          if(method.isCash&&session){
            await tx.cashMovement.create({data:{sessionId:session.id,kind:"ENTRADA",amount,description:"Pagamento da venda #"+sale.number+" — composição mista",referenceId:sale.id}});
          }
          if(!entryPayment) entryPayment=payment;
        }
        if(receivableAmount>0){
          const due=new Date(String(b.receivable.dueDate));
          const intendedMethodId=b.receivable.methodId?String(b.receivable.methodId):null;
          let intendedMethodName="";
          if(intendedMethodId){
            const intended=await tx.paymentMethod.findUnique({where:{id:intendedMethodId}});
            if(!intended||!intended.active) throw new Error("Meio de pagamento futuro inválido");
            intendedMethodName=intended.name;
          }
          createdAccounts.push(await tx.account.create({
            data:{
              type:"RECEBER",
              description:"Saldo da venda #"+sale.number,
              customerId:customer.id,
              saleId:sale.id,
              dueDate:due,
              amount:receivableAmount,
              paidAmount:0,
              status:"PENDENTE",
              notes:"Saldo a receber posteriormente"+(intendedMethodName?" · meio previsto: "+intendedMethodName:"")
            }
          }));
        }
      }
      if(installments>0){
        const balance=Math.max(0,total-entryAmount);
        const firstDue=new Date(String(b.firstDueDate||new Date().toISOString()));
        if(Number.isNaN(firstDue.getTime())) throw new Error("Data da primeira parcela inválida");
        const installmentValue=Number((balance/installments).toFixed(2));
        let accumulated=0;
        for(let i=1;i<=installments&&balance>=0.01;i++){
          const amount=i===installments?Number((balance-accumulated).toFixed(2)):installmentValue;
          accumulated+=amount;
          const due=new Date(firstDue);
          due.setMonth(due.getMonth()+(i-1));
          createdAccounts.push(await tx.account.create({
            data:{
              type:"RECEBER",
              description:"Carnê venda #"+sale.number+" — parcela "+i+"/"+installments,
              customerId:customer.id,
              saleId:sale.id,
              dueDate:due,
              amount,
              paidAmount:0,
              status:"PENDENTE",
              notes:"Parcela gerada automaticamente pelo PDV"
            }
          }));
        }
        if(entryAmount>0){
          const method=await tx.paymentMethod.findUnique({where:{id:paymentMethodId!}});
          if(!method||!method.active) throw new Error("Meio de pagamento da entrada inválido");
          if(method.isCash){
            const session=await tx.cashSession.findFirst({where:{closedAt:null},orderBy:{openedAt:"desc"}});
            if(!session) throw new Error("Não há caixa aberto para registrar a entrada");
            await tx.cashMovement.create({data:{sessionId:session.id,kind:"ENTRADA",amount:entryAmount,description:"Entrada da venda #"+sale.number,referenceId:sale.id}});
          }
          entryPayment=await tx.payment.create({data:{saleId:sale.id,methodId:method.id,amount:entryAmount,reference:b.entryReference||undefined}});
          await enqueueAccountingEvent(tx, {
            eventType: "PAYMENT_RECEIVED",
            sourceType: "Payment",
            sourceId: entryPayment.id,
            idempotencyKey: "PAYMENT_RECEIVED:" + entryPayment.id,
            payload: { amount: entryAmount, entryDate: entryPayment.paidAt.toISOString(), description: "Recebimento da entrada da venda #" + sale.number, paymentMethodId: method.id, paymentMethodName: method.name, isCash: method.isCash, cardMachineId: null, cardFeeAmount: 0, cardNetAmount: entryAmount, reference: entryPayment.reference ?? null },
          });
        }
      }

      if(Array.isArray(b.stock)){
        const requested=new Map<string,number>();
        for(const item of b.stock){
          const productId=String(item.productId||"");
          const quantity=Number(item.quantity||0);
          if(!productId||quantity<=0) continue;
          if(!Number.isFinite(quantity)) throw new Error("Quantidade de estoque inválida");
          requested.set(productId,(requested.get(productId)||0)+quantity);
        }

        for(const [productId,quantity] of requested){
          const product=await tx.product.findUnique({where:{id:productId}});
          if(!product||!product.active) throw new Error("Produto de estoque inválido: "+productId);
          if(!product.stockControlled) continue;

          const lots=await tx.stockLot.findMany({
            where:{productId:product.id,archived:false,quantity:{gt:0}},
            orderBy:{receivedAt:"asc"}
          });
          let remaining=quantity;
          const consumedLots:{lotId:string,quantity:number}[]=[];
          for(const lot of lots){
            if(remaining<=0) break;
            const take=Math.min(Number(lot.quantity),remaining);
            if(take<=0) continue;
            const updated=await tx.stockLot.updateMany({
              where:{id:lot.id,quantity:{gte:take}},
              data:{quantity:{decrement:take}}
            });
            if(updated.count===1){ consumedLots.push({lotId:lot.id,quantity:take}); remaining-=take; }
          }
          if(remaining>0) throw new Error("Estoque insuficiente para "+product.description);

          await tx.stockMovement.create({
            data:{
              productId:product.id,
              type:"SAIDA",
              quantity,
              reference:"VENDA",
              referenceId:sale.id,
              notes:"Saída por venda",
              lotLinks:{create:consumedLots}
            }
          });
        }
      }

      await writeAudit(tx,{action:"CREATE",entity:"Sale",entityId:sale.id,userId:seller.id,metadata:{total:sale.total.toString(),items:sale.items.length}});
      return {...sale,accounts:createdAccounts,entryPayment,payments:createdPayments};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:10000,timeout:20000});

    const siteSync=await syncPublishedProductStocks((b.items||[]).map((item:any)=>String(item.productId||"")).filter(Boolean));
    return NextResponse.json({...result,siteSync},{status:201});
  }catch(error){
    return NextResponse.json({error:"Não foi possível registrar a venda",detail:String(error)},{status:400});
  }
}

export async function GET(){
  try{
    const rows=await db.sale.findMany({
      orderBy:{createdAt:"desc"},
      take:100,
      include:{
        customer:{select:{id:true,name:true,cpfCnpj:true,phone:true}},
        seller:{select:{id:true,name:true}},
        order:{select:{id:true,number:true,status:true}},
        items:{include:{product:{select:{id:true,code:true,description:true}}}},
        payments:{include:{method:{select:{id:true,name:true,isCash:true}},cardMachine:{select:{id:true,name:true}}},orderBy:{paidAt:"asc"}},
        accounts:{orderBy:{dueDate:"asc"}},
        fiscalDocument:true,
        frameAdaptationOrder:true
      }
    });
    return NextResponse.json(rows);
  }catch(error){
    return NextResponse.json({error:"Não foi possível carregar as vendas",detail:String(error)},{status:500});
  }
}