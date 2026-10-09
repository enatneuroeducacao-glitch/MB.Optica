"use client";

import {useEffect,useMemo,useState} from "react";
import {useRealtimeRefresh} from "@/lib/use-realtime-refresh";

type Customer={id:string;name:string;cpfCnpj?:string|null};
type Product={id:string;code:string;description:string;salePrice:number|string;cost:number|string};
type Order={id:string;number:number;customerId:string;total:number|string;status:string;items?:any[]};
type SaleType="BALCAO"|"PEDIDO_OPTICO"|"ENCOMENDA"|"SERVICO"|"PRODUTOS";
type Method={id:string;name:string;isCash:boolean;active:boolean};
type PixKey={id:string;type:string;key:string;holderName:string;holderDocument?:string|null;city?:string|null};
type CardMachine={id:string;name:string;active:boolean};
type Sale=any;
type SaleItemForm={id:string;productId:string;description:string;quantity:string;unitPrice:string;unitCost:string};
type LegacyFinancial={salesToday:number;salesTodayCount:number;receivedToday:number;receivable:number;billing:number;salesCount:number;clientsActive:number};

const money=(v:any)=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const dt=(v:any)=>v?new Date(v).toLocaleString("pt-BR"):"—";
const crc16=(value:string)=>{let crc=0xffff;for(let i=0;i<value.length;i++){crc^=value.charCodeAt(i)<<8;for(let b=0;b<8;b++)crc=(crc&0x8000)?((crc<<1)^0x1021)&0xffff:(crc<<1)&0xffff}return crc.toString(16).toUpperCase().padStart(4,"0")};
const tlv=(id:string,value:string)=>id+String(value.length).padStart(2,"0")+value;
const pixPayload=(p:PixKey,amount:number)=>{const merchant=(p.holderName||"MB OPTICA").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().slice(0,25);const city=(p.city||"JOINVILLE").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().slice(0,15);let body=tlv("00","01")+tlv("01","12")+tlv("26",tlv("00","BR.GOV.BCB.PIX")+tlv("01",p.key)+(amount>0?tlv("02",money(amount).replace(/[^0-9,]/g,"").replace(",",".")):""))+tlv("52","0000")+tlv("53","986")+tlv("58","BR")+tlv("59",merchant)+tlv("60",city)+tlv("62",tlv("05","***"));const crc=crc16(body+"6304");return body+"6304"+crc};

export default function Vendas(){
 const [sales,setSales]=useState<Sale[]>([]),[customers,setCustomers]=useState<Customer[]>([]),[customerResults,setCustomerResults]=useState<Customer[]>([]),[products,setProducts]=useState<Product[]>([]),[orders,setOrders]=useState<Order[]>([]),[methods,setMethods]=useState<Method[]>([]),[pixKeys,setPixKeys]=useState<PixKey[]>([]),[cardMachines,setCardMachines]=useState<CardMachine[]>([]);
 const [legacy,setLegacy]=useState<LegacyFinancial|null>(null);
 const [user,setUser]=useState<any>(null),[cash,setCash]=useState<any>(null),[open,setOpen]=useState(false),[selected,setSelected]=useState<Sale|null>(null),[paying,setPaying]=useState<Sale|null>(null),[msg,setMsg]=useState(""),[search,setSearch]=useState(""),[filter,setFilter]=useState("TODAS");
 const [form,setForm]=useState({saleType:"BALCAO" as SaleType,customerId:"",orderId:"",productId:"",quantity:"1",unitPrice:"",discount:"0",surcharge:"0",notes:"",paymentCondition:"AVISTA",paymentMethodId:"",installments:"2",entryAmount:"0",firstDueDate:new Date().toISOString().slice(0,10),pixPayload:"",cardMachineId:"",cardInstallments:"1",cardFeeRate:"1"});
 const [saleItems,setSaleItems]=useState<SaleItemForm[]>([]);
 const [customerQuery,setCustomerQuery]=useState(""),[customerError,setCustomerError]=useState(""),[productQuery,setProductQuery]=useState(""),[pay,setPay]=useState({methodId:"",amount:"",reference:"",cardMachineId:"",cardInstallments:"1",cardFeeRate:"1"}),[paymentParts,setPaymentParts]=useState([{id:crypto.randomUUID(),methodId:"",amount:"",reference:""}]),[opening,setOpening]=useState(""),[move,setMove]=useState({kind:"SANGRIA",amount:"",description:""}),[pixForm,setPixForm]=useState({type:"ALEATORIA",key:"",holderName:"MB Óptica",holderDocument:"",city:"Joinville"}),[showPixManager,setShowPixManager]=useState(false);

 const load=async()=>{
  const [s,c,p,o,m,pk,cm,u,cs,lf]=await Promise.all([fetch("/api/sales",{cache:"no-store"}),fetch("/api/customers"),fetch("/api/products"),fetch("/api/orders"),fetch("/api/payment-methods"),fetch("/api/pix-keys"),fetch("/api/card-machines"),fetch("/api/auth/me"),fetch("/api/cash/session"),fetch("/api/migration/financial-summary",{cache:"no-store"})]);
  const [sd,cd,pd,od,md,pkd,cmd,ud,csd,lfd]=await Promise.all([s.json(),c.json(),p.json(),o.json(),m.json(),pk.json(),cm.json(),u.json(),cs.json(),lf.json()]);
  if(s.ok)setSales(Array.isArray(sd)?sd:[]);if(c.ok){setCustomers(Array.isArray(cd)?cd:[]);setCustomerResults(Array.isArray(cd)?cd:[]);}if(p.ok)setProducts(Array.isArray(pd)?pd:[]);if(o.ok)setOrders(Array.isArray(od)?od:[]);
  if(m.ok)setMethods(Array.isArray(md)?md.filter((x:any)=>x.active):[]);if(Array.isArray(pkd))setPixKeys(pkd);if(cm.ok&&Array.isArray(cmd))setCardMachines(cmd.filter((x:any)=>x.active));if(u.ok)setUser(ud.user||ud);if(cs.ok)setCash(csd);if(lf.ok&&lfd?.ok)setLegacy(lfd);
 };
 useEffect(()=>{load()},[]);
 useRealtimeRefresh(load,15000);
 useEffect(()=>{
  const q=customerQuery.trim();
  if(q.length<2){setCustomerError("");setCustomerResults(customers);return}

  // Mostra imediatamente os clientes já carregados no navegador e, em seguida,
  // confirma a busca no banco. Isso evita que uma falha momentânea da API deixe
  // o PDV com a mensagem "Nenhum cliente encontrado" quando o cliente existe.
  const normalized=q.toLocaleLowerCase("pt-BR");
  const localMatches=customers.filter(c=>{
    const name=String(c.name||"").toLocaleLowerCase("pt-BR");
    const document=String(c.cpfCnpj||"").toLocaleLowerCase("pt-BR");
    return name.includes(normalized)||document.includes(normalized);
  });
  setCustomerError("");
  setCustomerResults(localMatches);

  const timer=setTimeout(async()=>{
    try{
      const r=await fetch("/api/customers?q="+encodeURIComponent(q),{cache:"no-store",credentials:"same-origin"});
      const data=await r.json();
      if(r.ok&&Array.isArray(data)){
        // Se o servidor retornar vazio por uma falha de sincronização/cache,
        // preserva os resultados locais que já foram encontrados.
        if(data.length>0||localMatches.length===0)setCustomerResults(data);
      }else{
        setCustomerError(data?.error||"Não foi possível consultar os clientes.");
      }
    }catch(error){
      if(localMatches.length===0)setCustomerError("Não foi possível consultar os clientes agora.");
    }
  },250);
  return ()=>clearTimeout(timer);
 },[customerQuery,customers]);
 const product=products.find(p=>p.id===form.productId);
 const subtotal=saleItems.reduce((sum,item)=>sum+Math.max(0,Number(item.quantity||0)*Number(item.unitPrice||0)),0);
 const total=Math.max(0,subtotal-Number(form.discount||0)+Number(form.surcharge||0));
 const selectedCardMachine=cardMachines.find(m=>m.id===form.cardMachineId);
 const cardFeeAmount=Number((total*Number(form.cardFeeRate||0)/100).toFixed(2));
 const cardNetAmount=Number((total-cardFeeAmount).toFixed(2));
 const addSaleItem=()=>{if(!form.productId){setMsg("Selecione o produto/serviço antes de adicionar.");return}const p=products.find(x=>x.id===form.productId);const quantity=Number(form.quantity||0),unitPrice=Number(form.unitPrice||0);if(!p||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(unitPrice)||unitPrice<0){setMsg("Informe produto, quantidade e preço válidos.");return}setSaleItems(prev=>[...prev,{id:crypto.randomUUID(),productId:p.id,description:p.description,quantity:String(quantity),unitPrice:String(unitPrice),unitCost:String(p.cost||0)}]);setForm({...form,productId:"",quantity:"1",unitPrice:""});setProductQuery("");setMsg("")};
 const removeSaleItem=(id:string)=>setSaleItems(prev=>prev.filter(item=>item.id!==id));
 const updateSaleItem=(id:string,patch:Partial<SaleItemForm>)=>setSaleItems(prev=>prev.map(item=>item.id===id?{...item,...patch}:item));
 const orderChoices=useMemo(()=>orders.filter(o=>o.customerId===form.customerId&&!["CANCELADO","DEVOLVIDO"].includes(o.status)&&!sales.some(s=>s.orderId===o.id)),[orders,form.customerId,sales]);
 const stats=useMemo(()=>{const active=sales.filter(s=>!s.canceled);const gross=active.reduce((a,s)=>a+Number(s.total),0);const paid=active.reduce((a,s)=>a+Number(s.payments?.filter((p:any)=>!p.reversedAt).reduce((x:number,p:any)=>x+Number(p.amount),0)||0),0);const today=new Date().toDateString();return {count:active.length,today:active.filter(s=>new Date(s.createdAt).toDateString()===today).reduce((a,s)=>a+Number(s.total),0),paid,pending:Math.max(0,gross-paid)}},[sales]);
 const filtered=sales.filter(s=>{const paid=Number(s.payments?.filter((p:any)=>!p.reversedAt).reduce((a:number,p:any)=>a+Number(p.amount),0)||0);const q=(s.number+" "+(s.customer?.name||"")+" "+(s.customer?.cpfCnpj||"")).toLowerCase().includes(search.toLowerCase());const f=filter==="TODAS"||(filter==="ABERTAS"&&!s.canceled&&paid<Number(s.total))||(filter==="PAGAS"&&!s.canceled&&paid>=Number(s.total))||(filter==="CANCELADAS"&&s.canceled);return q&&f});
 const remaining=paying?Math.max(0,Number(paying.total)-Number(paying.payments?.filter((p:any)=>!p.reversedAt).reduce((a:number,p:any)=>a+Number(p.amount),0)||0)):0;
 const mixedPaid=paymentParts.reduce((sum,p)=>sum+Math.max(0,Number(p.amount||0)),0);
 const mixedReceivable=Math.max(0,total-mixedPaid);
 const addPaymentPart=()=>setPaymentParts(prev=>[...prev,{id:crypto.randomUUID(),methodId:"",amount:"",reference:""}]);
 const updatePaymentPart=(id:string,patch:Partial<{methodId:string;amount:string;reference:string}>)=>setPaymentParts(prev=>prev.map(p=>p.id===id?{...p,...patch}:p));
 const removePaymentPart=(id:string)=>setPaymentParts(prev=>prev.length>1?prev.filter(p=>p.id!==id):prev.map(p=>p.id===id?{...p,methodId:"",amount:"",reference:""}:p));

 const submit=async(e:React.FormEvent)=>{
e.preventDefault();setMsg("");
if(!user?.id){setMsg("Usuário da sessão não identificado.");return}
if(!form.customerId){setMsg("Cliente é obrigatório.");return}
if(!saleItems.length){setMsg("Adicione pelo menos um produto/serviço à venda.");return}
const installments=form.paymentCondition==="CARNÊ"?Math.max(1,Number(form.installments||1)):0;
const selectedPix=form.paymentCondition==="PIX"?pixKeys.find(k=>k.id===form.pixPayload):undefined;
 const selectedCardMachine=cardMachines.find(m=>m.id===form.cardMachineId);
 const cardFeeAmount=form.paymentCondition==="CARTAO"?Number((total*Number(form.cardFeeRate||0)/100).toFixed(2)):0;
 const cardNetAmount=form.paymentCondition==="CARTAO"?Number((total-cardFeeAmount).toFixed(2)):total;
const pixCode=selectedPix?pixPayload(selectedPix,total):form.pixPayload;
if(form.paymentCondition==="CARNÊ"&&installments<2){setMsg("Use pelo menos 2 parcelas para o carnê.");return}
if(form.paymentCondition==="CARTAO"){
 const creditMethod=methods.find(m=>m.name.toLocaleLowerCase("pt-BR").includes("cartão de crédito")||m.name.toLocaleLowerCase("pt-BR").includes("cartao de credito"));
 if(!creditMethod){setMsg("O meio 'Cartão de crédito' não está cadastrado.");return}
 if(!form.cardMachineId){setMsg("Selecione a maquininha utilizada.");return}
 if(!Number(form.cardInstallments)||Number(form.cardInstallments)<1){setMsg("Informe o número de parcelas.");return}
 if(!Number.isFinite(Number(form.cardFeeRate))||Number(form.cardFeeRate)<0){setMsg("Informe uma taxa válida.");return}
 form.paymentMethodId=creditMethod.id;
}
if(form.paymentCondition==="MISTO"){
 const validParts=paymentParts.filter(p=>Number(p.amount)>0);
 if(!validParts.length&&mixedReceivable<=0){setMsg("Informe pelo menos um pagamento ou saldo a receber.");return}
 if(validParts.some(p=>!p.methodId)){setMsg("Selecione o meio de pagamento de cada valor recebido.");return}
 if(Math.abs(mixedPaid+mixedReceivable-total)>0.01){setMsg("A composição do pagamento não fecha o total da venda.");return}
 if(mixedReceivable>0&&!form.firstDueDate){setMsg("Informe a data para o saldo a receber.");return}
}
const r=await fetch("/api/sales",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({saleType:form.saleType,customerId:form.customerId,sellerId:user.id,orderId:form.orderId||undefined,discount:Number(form.discount),surcharge:Number(form.surcharge),notes:form.notes,paymentCondition:form.paymentCondition,installments,paymentMethodId:form.paymentMethodId||undefined,entryAmount:Number(form.entryAmount||0),pixPayload:pixCode||undefined,firstDueDate:form.firstDueDate,payments:form.paymentCondition==="MISTO"?paymentParts.filter(p=>Number(p.amount)>0).map(p=>({methodId:p.methodId,amount:Number(p.amount),reference:p.reference||undefined})):undefined,receivable:form.paymentCondition==="MISTO"&&mixedReceivable>0?{amount:mixedReceivable,dueDate:form.firstDueDate,methodId:form.paymentMethodId||undefined}:undefined,items:saleItems.map(item=>({productId:item.productId,description:item.description,quantity:Number(item.quantity),unitPrice:Number(item.unitPrice),unitCost:Number(item.unitCost||0)})),stock:saleItems.map(item=>({productId:item.productId,quantity:Number(item.quantity)}))})});
const d=await r.json();if(!r.ok){setMsg((d.error||"Erro")+(d.detail?" — "+d.detail:""));return}
if(form.paymentCondition!=="CARNÊ"&&form.paymentMethodId){
const pr=await fetch("/api/payments",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({saleId:d.id,methodId:form.paymentMethodId,amount:total,reference:pixCode||undefined,cardMachineId:form.paymentCondition==="CARTAO"?form.cardMachineId:undefined,cardInstallments:form.paymentCondition==="CARTAO"?Number(form.cardInstallments):undefined,cardFeeRate:form.paymentCondition==="CARTAO"?Number(form.cardFeeRate):undefined})});
const pd=await pr.json();if(!pr.ok)setMsg("Venda criada, mas o recebimento não foi registrado: "+(pd.detail||pd.error||"erro"));else setMsg("Venda #"+d.number+" registrada e recebida.");
}else setMsg("Venda #"+d.number+" registrada.");
setOpen(false);
setForm({saleType:"BALCAO",customerId:"",orderId:"",productId:"",quantity:"1",unitPrice:"",discount:"0",surcharge:"0",notes:"",paymentCondition:"AVISTA",paymentMethodId:"",installments:"2",entryAmount:"0",firstDueDate:new Date().toISOString().slice(0,10),pixPayload:"",cardMachineId:"",cardInstallments:"1",cardFeeRate:"1"});setSaleItems([]);setCustomerQuery("");setProductQuery("");setPaymentParts([{id:crypto.randomUUID(),methodId:"",amount:"",reference:""}]);
const refreshed=await fetch("/api/sales",{cache:"no-store"});const refreshedSales=await refreshed.json();if(Array.isArray(refreshedSales)){setSales(refreshedSales);const created=refreshedSales.find((s:any)=>s.id===d.id);if(created)setSelected(created);}
}; const registerPayment=async(e:React.FormEvent)=>{e.preventDefault();if(!paying)return;const r=await fetch("/api/payments",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({saleId:paying.id,methodId:pay.methodId,amount:Number(pay.amount),reference:pay.reference||undefined})});const d=await r.json();if(!r.ok){setMsg((d.error||"Erro")+(d.detail?" — "+d.detail:""));return}setMsg("Pagamento registrado.");setPaying(null);setPay({methodId:"",amount:"",reference:"",cardMachineId:"",cardInstallments:"1",cardFeeRate:"1"});await load()};
 const openCash=async()=>{const r=await fetch("/api/cash/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({openingCash:Number(opening||0)})});const d=await r.json();if(!r.ok){setMsg((d.error||"Erro")+(d.detail?" — "+d.detail:""));return}setOpening("");setMsg("Caixa aberto.");await load()}; const closeCash=async()=>{if(!cash)return;const value=window.prompt("Informe o valor contado no caixa para o fechamento:","0");if(value===null)return;const counted=Number(value.replace(",","."));if(!Number.isFinite(counted)||counted<0){setMsg("Valor de fechamento inválido.");return}const r=await fetch("/api/cash/close",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({closingCash:counted})});const d=await r.json();if(!r.ok){setMsg((d.error||"Erro")+(d.detail?" — "+d.detail:""));return}const diff=Number(d.difference||0);setMsg("Caixa fechado. Saldo esperado: "+money(d.expected)+" · Contado: "+money(counted)+" · Diferença: "+money(diff));await load()};
 const cashMove=async(e:React.FormEvent)=>{e.preventDefault();const r=await fetch("/api/cash/movement",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(move)});const d=await r.json();if(!r.ok){setMsg((d.error||"Erro")+(d.detail?" — "+d.detail:""));return}setMove({kind:"SANGRIA",amount:"",description:""});setMsg("Movimentação registrada.");await load()};
 const chooseCustomer=(c:Customer)=>{setForm({...form,customerId:c.id,orderId:""});setCustomerQuery(c.name)}; const chooseProduct=(p:Product)=>{setForm({...form,productId:p.id,unitPrice:String(p.salePrice)});setProductQuery(p.description)}; const chooseOrder=(id:string)=>{const o=orders.find(x=>x.id===id);if(!o)return;const imported=(o.items||[]).filter((i:any)=>i.productId).map((i:any)=>{const p=products.find(x=>x.id===i.productId);return {id:crypto.randomUUID(),productId:String(i.productId),description:String(i.description||p?.description||"Item"),quantity:String(i.quantity||1),unitPrice:String(i.unitPrice??p?.salePrice??0),unitCost:String(p?.cost||0)}});setForm({...form,orderId:id,customerId:o.customerId,productId:"",quantity:"1",unitPrice:""});setCustomerQuery(customers.find(c=>c.id===o.customerId)?.name||"");setProductQuery("");setSaleItems(imported);setMsg(imported.length?`${imported.length} item(ns) do pedido adicionados à venda.`:"O pedido não possui itens de produto para importar.");}; const printSale=(kind:"CUPOM"|"RECIBO"|"CARNE"|"PROMISSORIA"|"FISCAL"|"NF_PREPARO")=>{
  if(!selected)return;
  const f=selected.fiscalDocument;
  if(kind==="FISCAL"&&!f){setMsg("Esta venda ainda não possui documento fiscal autorizado.");return}
  const customer=selected.customer?.name||"Cliente";
  const items=(selected.items||[]).map((i:any)=>"<div class=\"row\"><span>"+i.description+" × "+Number(i.quantity)+"</span><b>"+money(i.total)+"</b></div>").join("");
  const accounts=(selected.accounts||[]).map((a:any)=>"<div class=\"row\"><span>"+a.description+"<br>Vencimento: "+dt(a.dueDate)+"</span><b>"+money(a.amount)+"</b></div>").join("");
  const qr=selected.pixPayload?"<div class=\"center\"><img class=\"qr\" src=\"https://quickchart.io/qr?size=220&text="+encodeURIComponent(selected.pixPayload)+"\"><p>PIX — pagamento</p></div>":"";
  const title=kind==="CUPOM"?"Cupom não fiscal":kind==="RECIBO"?"Recibo":kind==="CARNE"?"Carnê":kind==="PROMISSORIA"?"Promissória":kind==="NF_PREPARO"?"Preparação para NF":"Documento fiscal";
  const paid=Number(selected.payments?.filter((p:any)=>!p.reversedAt).reduce((a:number,p:any)=>a+Number(p.amount),0)||0);
  const balance=Math.max(0,Number(selected.total)-paid);
  const extra=kind==="PROMISSORIA"?"<div class=\"signature\"><div>Credor — MB Óptica</div><div>Devedor — "+customer+"</div></div>":kind==="RECIBO"?"<div class=\"box\"><b>RECIBO DE PAGAMENTO</b><br>Recebemos de "+customer+" o valor de <b>"+money(paid)+"</b> referente à venda #"+selected.number+".</div><div class=\"signature\"><div>MB Óptica</div><div>"+customer+"</div></div>":kind==="CARNE"?qr:kind==="NF_PREPARO"?"<div class=\"box\"><b>RASCUNHO PARA EMISSÃO FISCAL</b><br>Venda: #"+selected.number+"<br>Cliente: "+customer+"<br>Valor total: "+money(selected.total)+"<br><br>Preencher/revisar os dados fiscais do cliente, natureza da operação, CFOP, tributação e demais campos antes da autorização.</div>":kind==="FISCAL"?"<div class=\"box\">Chave: "+(f?.accessKey||"—")+"<br>Número/Série: "+(f?.number||"—")+" / "+(f?.series||"—")+"</div>":"";
  const paymentLines=(selected.payments||[]).filter((p:any)=>!p.reversedAt).map((p:any)=>"<div class=\"row\"><span>"+(p.method?.name||"Pagamento")+"</span><b>"+money(p.amount)+"</b></div>").join("");
  const isThermal=kind==="CUPOM";
  const printBody=isThermal
    ? "<div class=\"receipt-58\"><div class=\"brand\">MB Óptica</div><div class=\"muted center\">Cupom não fiscal</div><div class=\"sep\"></div><div><b>Venda #"+selected.number+"</b><br>Cliente: "+customer+"<br>"+dt(selected.createdAt)+"</div><div class=\"sep\"></div>"+items+"<div class=\"sep\"></div><div class=\"row total\"><span>TOTAL</span><b>"+money(selected.total)+"</b></div>"+(paymentLines?"<div class=\"sep\"></div><b>PAGAMENTOS</b>"+paymentLines:"")+"<div class=\"row\"><span>Pago</span><b>"+money(paid)+"</b></div><div class=\"row\"><span>Saldo</span><b>"+money(balance)+"</b></div>"+(selected.accounts?.length?"<div class=\"sep\"></div><b>PARCELAMENTO</b>"+accounts:"")+qr+"<div class=\"sep\"></div><div class=\"center muted\">Obrigado pela preferência!</div></div>"
    : kind==="RECIBO"
      ? "<div class=\"copy\"><div class=\"brand\">MB Óptica</div><h1>RECIBO — VIA DO CLIENTE</h1><p>Recebemos de <b>"+customer+"</b> o valor de <b>"+money(paid)+"</b>, referente à venda nº "+selected.number+".</p><p>Valor total: "+money(selected.total)+"</p><p>Pagamento(s): "+(paymentLines||"—")+"</p><p>Saldo pendente: "+money(balance)+"</p><p>Data: "+dt(selected.createdAt)+"</p><div class=\"sign\">MB Óptica — responsável</div></div><div class=\"copy\"><div class=\"brand\">MB Óptica</div><h1>RECIBO — VIA DA LOJA</h1><p>Recebemos de <b>"+customer+"</b> o valor de <b>"+money(paid)+"</b>, referente à venda nº "+selected.number+".</p><p>Valor total: "+money(selected.total)+"</p><p>Pagamento(s): "+(paymentLines||"—")+"</p><p>Saldo pendente: "+money(balance)+"</p><p>Data: "+dt(selected.createdAt)+"</p><div class=\"sign\">MB Óptica — responsável</div></div>"
      : kind==="PROMISSORIA"
        ? "<div class=\"copy\"><div class=\"brand\">MB Óptica</div><h1>NOTA PROMISSÓRIA — VIA DO CLIENTE</h1><p>Nº "+selected.number+" · Valor: <b>"+money(balance||selected.total)+"</b></p><p>Vencimento: ______________________________</p><p>Pagarei por esta nota à MB Óptica, ou à sua ordem, a quantia acima indicada.</p><p>Emitente: "+customer+"</p><p>CPF/CNPJ: __________________________________________</p><p>Endereço: ___________________________________________</p><p>Local e data: _______________________________________</p><div class=\"sign\">Assinatura do emitente</div></div><div class=\"copy\"><div class=\"brand\">MB Óptica</div><h1>NOTA PROMISSÓRIA — VIA DA LOJA</h1><p>Nº "+selected.number+" · Valor: <b>"+money(balance||selected.total)+"</b></p><p>Vencimento: ______________________________</p><p>Pagarei por esta nota à MB Óptica, ou à sua ordem, a quantia acima indicada.</p><p>Emitente: "+customer+"</p><p>CPF/CNPJ: __________________________________________</p><p>Endereço: ___________________________________________</p><p>Local e data: _______________________________________</p><div class=\"sign\">Assinatura do emitente</div></div>"
        : kind==="CARNE"
          ? "<h1>CARNÊ DE PAGAMENTO — VENDA Nº "+selected.number+"</h1><p>Cliente: <b>"+customer+"</b> · Total: <b>"+money(selected.total)+"</b></p>"+(selected.accounts||[]).map((a:any,i:number)=>"<div class=\"installment\"><section><h2>PARCELA "+(i+1)+" — CANHOTO DO CLIENTE</h2><p>Vencimento: "+dt(a.dueDate)+"</p><p>Valor: <b>"+money(a.amount)+"</b></p><p>Cliente: "+customer+"</p><p>Venda nº "+selected.number+"</p></section><section><h2>PARCELA "+(i+1)+" — VIA DA LOJA</h2><p>Vencimento: "+dt(a.dueDate)+"</p><p>Valor: <b>"+money(a.amount)+"</b></p><p>Cliente: "+customer+"</p><p>Venda nº "+selected.number+"</p><div class=\"sign\">Recebimento / baixa</div></section></div>").join("")
          : extra;
  const pageSize=isThermal?"58mm auto":"A4 portrait";
  const pageMargin=isThermal?"0":"12mm";
  const html="<html><head><meta charset=\"utf-8\"><title>"+title+" #"+selected.number+"</title><style>@page{size:"+pageSize+";margin:"+pageMargin+"}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:#111;font-size:"+(isThermal?"11px":"12px")+"}.receipt-58{width:58mm;padding:3mm}.center{text-align:center}.brand{font-size:17px;font-weight:800;text-align:center;margin-bottom:8px}.muted{font-size:9px;color:#444}.sep{border-top:1px dashed #222;margin:7px 0}.row{display:flex;justify-content:space-between;gap:6px;padding:3px 0}.row span{max-width:70%}.total{font-size:14px;font-weight:800}.box{border:1px solid #222;padding:8px;margin:8px 0}.qr{width:38mm;height:38mm}.copy{min-height:0;padding:5mm 3mm;page-break-inside:avoid;break-inside:avoid}.copy h1{font-size:18px;border-bottom:1px solid #333;padding-bottom:8px}.sign{margin-top:12mm;border-top:1px solid #222;text-align:center;padding-top:6px;width:85mm;max-width:100%}.copy+.copy{border-top:1px dashed #555;margin-top:4mm;padding-top:8mm}.installment{display:grid;grid-template-columns:1fr 1fr;gap:8mm;border:1px solid #777;padding:6mm;margin:5mm 0;page-break-inside:avoid}.installment section+section{border-left:1px dashed #777;padding-left:7mm}.installment h2{font-size:12px}.installment p{margin:8px 0}@media print{.no-print{display:none}.copy+.copy{break-before:auto;page-break-before:auto}}@media screen{body{padding:10px}.receipt-58{margin:10px auto;border:1px dashed #aaa}.copy,.installment{max-width:186mm;margin-left:auto;margin-right:auto}}</style></head><body>"+printBody+"</body></html>";
  const w=window.open("","_blank","width=850,height=900");if(!w){setMsg("O navegador bloqueou a janela de impressão.");return}w.document.write(html);w.document.close();w.focus();setTimeout(()=>w.print(),250);
 };

 return <section className="page sales-page">
  <div className="page-heading"><div><span className="eyebrow">OPERAÇÃO • PDV</span><h1>Vendas</h1><p>Venda óptica conectada a cliente, pedido, estoque, caixa, pagamentos e rastreabilidade.</p></div><button className="primary" onClick={()=>setOpen(true)}>+ Nova venda</button></div>
  {msg&&<div className="panel sales-message">{msg}</div>}
  <div className="stats sales-stats"><div className="stat-card"><span>VENDAS</span><strong>{stats.count}</strong><small>histórico operacional</small></div><div className="stat-card"><span>VENDAS HOJE</span><strong>{money(stats.today)}</strong><small>valor bruto</small></div><div className="stat-card"><span>RECEBIDO</span><strong>{money(stats.paid)}</strong><small>pagamentos</small></div><div className="stat-card"><span>A RECEBER</span><strong>{money(stats.pending)}</strong><small>saldo aberto</small></div></div>

  {legacy&&<div className="panel" style={{marginBottom:16}}>
   <div className="panel-heading"><div><span className="eyebrow">ACOMPANHAMENTO DA LOJA</span><h2>Histórico BeepStart</h2><p>Indicadores históricos para acompanhar a operação enquanto o MB Óptica forma seu novo histórico.</p></div><a href="/migracao">Ver histórico completo</a></div>
   <div className="stats sales-stats">
    <div className="stat-card"><span>VENDAS HOJE · BEEPSTART</span><strong>{money(legacy.salesToday)}</strong><small>{legacy.salesTodayCount} venda(s) em 29/09/2026</small></div>
    <div className="stat-card"><span>RECEBIDO HOJE · BEEPSTART</span><strong>{money(legacy.receivedToday)}</strong><small>entradas registradas hoje</small></div>
    <div className="stat-card"><span>A RECEBER · BEEPSTART</span><strong>{money(legacy.receivable)}</strong><small>saldo histórico em aberto</small></div>
    <div className="stat-card"><span>FATURAMENTO 2026 · BEEPSTART</span><strong>{money(legacy.billing)}</strong><small>{legacy.salesCount} vendas no histórico</small></div>
   </div>
  </div>}  <div className="sales-command-grid">
   <div className="panel sales-cash"><div className="panel-heading"><div><h2>Caixa operacional</h2><p>Controle rápido do caixa do PDV.</p></div><span className={cash?"sales-online":"sales-offline"}>{cash?"CAIXA ABERTO":"CAIXA FECHADO"}</span></div>
    {cash?<><div className="cash-state"><div><b>Abertura</b><small>{money(cash.openingCash)} · {dt(cash.openedAt)}</small></div><div><b>Movimentos</b><small>{cash.movements?.length||0} lançamentos</small></div></div><form onSubmit={cashMove} className="sales-cash-move"><select value={move.kind} onChange={e=>setMove({...move,kind:e.target.value})}><option value="SANGRIA">Sangria</option><option value="REFORCO">Reforço</option><option value="SAIDA">Saída</option><option value="ENTRADA">Entrada</option></select><input type="number" min="0.01" step="0.01" placeholder="Valor" value={move.amount} onChange={e=>setMove({...move,amount:e.target.value})}/><input placeholder="Descrição" value={move.description} onChange={e=>setMove({...move,description:e.target.value})}/><button className="secondary">Lançar</button></form><button type="button" className="secondary" onClick={closeCash}>Fechar caixa</button></>:<div className="sales-cash-open"><input type="number" min="0" step="0.01" placeholder="Valor de abertura" value={opening} onChange={e=>setOpening(e.target.value)}/><button className="primary" onClick={openCash}>Abrir caixa</button></div>}
   </div>
   <div className="panel sales-insight"><div className="panel-heading"><div><h2>Inteligência da venda</h2><p>Recursos próprios do MB Óptica.</p></div></div><div className="sales-insight-list"><div><b>Venda sem redigitação</b><span>Pedido óptico preenche cliente e item.</span></div><div><b>Rastreabilidade</b><span>Venda → estoque → pagamento → caixa.</span></div><div><b>Visão financeira</b><span>Recebido e saldo a receber em tempo real.</span></div><div><b>Auditoria</b><span>Eventos são registrados no histórico do sistema.</span></div></div></div>
  </div>

  {open&&<div className="sales-pdv-overlay" role="dialog" aria-modal="true" aria-label="Nova venda" onMouseDown={e=>{if(e.currentTarget===e.target)setOpen(false)}}><div className="panel sales-form sales-pdv-modal"><div className="panel-heading"><div><span className="eyebrow">PDV</span><h2>Nova venda</h2><p>Venda com múltiplos produtos e serviços, com origem operacional identificada.</p></div><button className="secondary" type="button" onClick={()=>setOpen(false)}>Fechar</button></div>
   <form onSubmit={submit}><div className="sales-form-grid">
    <label>Tipo de venda
      <select value={form.saleType} onChange={e=>{const saleType=e.target.value as SaleType;setForm({...form,saleType,orderId:saleType==="PEDIDO_OPTICO"?form.orderId:""})}}>
       <option value="BALCAO">Venda de balcão</option>
       <option value="PEDIDO_OPTICO">Venda vinculada a Pedido Óptico</option>
       <option value="ENCOMENDA">Venda de encomenda</option>
       <option value="SERVICO">Venda de serviço</option>
       <option value="PRODUTOS">Venda de produtos</option>
      </select>
    </label>
    <label style={{position:"relative"}}>Cliente
      <input required value={customerQuery} onChange={e=>{const value=e.target.value;setCustomerQuery(value);if(form.customerId&&value!==customers.find(c=>c.id===form.customerId)?.name){setForm({...form,customerId:"",orderId:""});setSaleItems([])}}} placeholder="Pesquisar nome ou CPF/CNPJ..." autoComplete="off"/>
      {customerQuery.trim().length>=2&&!form.customerId&&<div style={{position:"absolute",left:0,right:0,top:"calc(100% + 4px)",border:"1px solid var(--line)",borderRadius:8,maxHeight:220,overflowY:"auto",background:"var(--surface)",zIndex:1000,boxShadow:"0 10px 30px rgba(15,23,42,.16)"}}>
       {customerResults.slice(0,10).map(c=><button type="button" key={c.id} onClick={()=>chooseCustomer(c)} style={{display:"block",width:"100%",textAlign:"left",padding:10,border:0,borderBottom:"1px solid var(--line)",background:"transparent",cursor:"pointer"}}>{c.name}{c.cpfCnpj?" — "+c.cpfCnpj:""}</button>)}
       {customerError?<div style={{padding:10,color:"#a33",fontSize:12,fontWeight:600}}>{customerError}</div>:!customerResults.length&&<div style={{padding:10,color:"var(--muted)",fontSize:12}}>Nenhum cliente encontrado.</div>}
      </div>}
     </label>
    {form.saleType==="PEDIDO_OPTICO"&&<label>Pedido óptico<select required value={form.orderId} onChange={e=>chooseOrder(e.target.value)}><option value="">Selecione o pedido</option>{orderChoices.map(o=><option key={o.id} value={o.id}>#{o.number} · {o.status} · {money(o.total)}</option>)}</select></label>}
    <div className="sales-wide" style={{border:"1px solid var(--line)",borderRadius:12,padding:12}}>
      <div className="sales-payment-title"><b>Itens da venda</b><span>{saleItems.length} item(ns) adicionado(s). Combine armação, lentes, serviços e outros produtos na mesma venda.</span></div>
      {saleItems.length>0&&<div style={{display:"grid",gap:8,marginTop:10}}>
       {saleItems.map(item=><div key={item.id} style={{display:"grid",gridTemplateColumns:"minmax(180px,2fr) 100px 130px 130px auto",gap:8,alignItems:"end",padding:"10px 0",borderTop:"1px solid var(--line)"}}>
        <div><small>Produto / serviço</small><div style={{fontWeight:600}}>{item.description}</div></div>
        <label style={{margin:0}}>Qtd.<input type="number" min="0.001" step="0.001" value={item.quantity} onChange={e=>updateSaleItem(item.id,{quantity:e.target.value})}/></label>
        <label style={{margin:0}}>Unitário<input type="number" min="0" step="0.01" value={item.unitPrice} onChange={e=>updateSaleItem(item.id,{unitPrice:e.target.value})}/></label>
        <div><small>Total</small><div style={{fontWeight:700}}>{money(Number(item.quantity||0)*Number(item.unitPrice||0))}</div></div>
        <button type="button" className="secondary" onClick={()=>removeSaleItem(item.id)}>Remover</button>
       </div>)}
      </div>}
      <div style={{display:"grid",gridTemplateColumns:"minmax(220px,2fr) 100px 130px auto",gap:8,alignItems:"end",marginTop:12}}>
       <label style={{margin:0,position:"relative"}}>Adicionar produto / serviço
        <input value={productQuery} onChange={e=>{const value=e.target.value;setProductQuery(value);if(form.productId){setForm({...form,productId:"",unitPrice:""})}}} placeholder="Pesquisar código ou descrição..." autoComplete="off"/>
        {productQuery&&!form.productId&&<div style={{border:"1px solid var(--line)",borderRadius:8,maxHeight:180,overflowY:"auto",background:"var(--surface)",position:"absolute",left:0,right:0,top:"100%",zIndex:20}}>
         {products.filter(p=>(p.code+" "+p.description).toLowerCase().includes(productQuery.toLowerCase())).slice(0,10).map(p=><button type="button" key={p.id} onClick={()=>chooseProduct(p)} style={{display:"block",width:"100%",textAlign:"left",padding:9,border:0,borderBottom:"1px solid var(--line)",background:"transparent",cursor:"pointer"}}>{p.code} · {p.description} · {money(p.salePrice)}</button>)}
        </div>}
       </label>
       <label style={{margin:0}}>Qtd.<input type="number" min="0.001" step="0.001" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label>
       <label style={{margin:0}}>Unitário<input type="number" min="0" step="0.01" value={form.unitPrice} onChange={e=>setForm({...form,unitPrice:e.target.value})}/></label>
       <button type="button" className="primary" onClick={addSaleItem}>+ Adicionar item</button>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",marginTop:12,fontSize:13}}><b>Subtotal dos itens: {money(subtotal)}</b></div>
    </div>
    <label>Desconto<input type="number" min="0" step="0.01" value={form.discount} onChange={e=>setForm({...form,discount:e.target.value})}/></label><label>Acréscimo<input type="number" min="0" step="0.01" value={form.surcharge} onChange={e=>setForm({...form,surcharge:e.target.value})}/></label><div className="sales-total-box"><span>Total</span><strong>{money(total)}</strong></div>
   <div className="sales-payment-box sales-wide">
    <div className="sales-payment-title"><b>Condição de pagamento</b><span>Escolha como esta venda será recebida.</span></div>
    <div className="sales-form-grid">
     <label>Forma
      <select value={form.paymentCondition} onChange={e=>setForm({...form,paymentCondition:e.target.value})}>
       <option value="AVISTA">À vista</option><option value="PIX">PIX</option><option value="CARTAO">Cartão de crédito</option><option value="MISTO">Misto — entrada + saldo / várias formas</option><option value="CARNÊ">Crediário / Carnê</option>
      </select>
     </label>
     {form.paymentCondition!=="CARTAO"&&<label>Meio de recebimento
      <select value={form.paymentMethodId} onChange={e=>setForm({...form,paymentMethodId:e.target.value})}>
       <option value="">Não receber agora</option>{methods.map(m=><option key={m.id} value={m.id}>{m.name}{m.isCash?" · caixa":""}</option>)}
      </select>
     </label>}
     {form.paymentCondition==="CARTAO"&&<div className="sales-wide" style={{border:"1px solid var(--line)",borderRadius:10,padding:12}}>
       <div className="sales-payment-title"><b>Dados do cartão</b><span>Registre a maquininha, parcelas e taxa para calcular o valor líquido.</span></div>
       <div className="sales-form-grid" style={{marginTop:10}}>
         <label>Maquininha
           <select value={form.cardMachineId} onChange={e=>setForm({...form,cardMachineId:e.target.value})}>
             <option value="">Selecione a maquininha</option>{cardMachines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
           </select>
         </label>
         <label>Parcelas
           <select value={form.cardInstallments} onChange={e=>setForm({...form,cardInstallments:e.target.value})}>{Array.from({length:24},(_,i)=><option key={i+1} value={i+1}>{i+1}x</option>)}</select>
         </label>
         <label>Taxa da máquina (%)
           <input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={form.cardFeeRate} onChange={e=>setForm({...form,cardFeeRate:e.target.value.replace(",","." )})} placeholder="Ex.: 3,15" />
           <small style={{display:"block",marginTop:4,color:"var(--muted)"}}>Informe a taxa exata da maquininha, com até 2 casas decimais.</small>
         </label>
         <div className="sales-total-box"><span>Valor líquido previsto</span><strong>{money(cardNetAmount)}</strong><small>Taxa: {money(cardFeeAmount)}</small></div>
       </div>
       <div className="sales-actions" style={{justifyContent:"space-between",marginTop:10}}>
         <span style={{fontSize:12,color:"var(--muted)"}}>{selectedCardMachine?selectedCardMachine.name:"Nenhuma maquininha selecionada"} · {form.cardInstallments}x · {form.cardFeeRate}%</span>
         <button type="button" className="secondary" onClick={async()=>{
           const name=window.prompt("Nome da nova maquininha:");
           if(!name?.trim()) return;
           const rr=await fetch("/api/card-machines",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:name.trim()})});
           const dd=await rr.json();
           if(!rr.ok){setMsg(dd.error||"Não foi possível cadastrar a maquininha.");return}
           setCardMachines(prev=>[...prev,dd].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")));
           setForm(prev=>({...prev,cardMachineId:dd.id}));
           setMsg("Maquininha cadastrada e selecionada.");
         }}>+ Adicionar maquininha</button>
       </div>
     </div>}
     {form.paymentCondition==="MISTO"&&<div className="sales-wide" style={{border:"1px solid var(--line)",borderRadius:10,padding:12}}>
       <div className="sales-payment-title"><b>Composição do pagamento</b><span>Permite receber parte agora e deixar o restante para outra data ou combinar várias formas de pagamento.</span></div>
       <div style={{display:"grid",gap:8,marginTop:10}}>
        {paymentParts.map((part,index)=><div key={part.id} style={{display:"grid",gridTemplateColumns:"minmax(180px,1fr) 150px minmax(160px,1fr) auto",gap:8,alignItems:"end"}}>
          <label style={{margin:0}}>Meio de pagamento
            <select value={part.methodId} onChange={e=>updatePaymentPart(part.id,{methodId:e.target.value})}><option value="">Selecione</option>{methods.map(m=><option key={m.id} value={m.id}>{m.name}{m.isCash?" · caixa":""}</option>)}</select>
          </label>
          <label style={{margin:0}}>Valor recebido<input type="number" min="0" step="0.01" value={part.amount} onChange={e=>updatePaymentPart(part.id,{amount:e.target.value})} placeholder="0,00"/></label>
          <label style={{margin:0}}>Referência<input value={part.reference} onChange={e=>updatePaymentPart(part.id,{reference:e.target.value})} placeholder="NSU, comprovante..."/></label>
          <button type="button" className="secondary" onClick={()=>removePaymentPart(part.id)}>Remover</button>
        </div>)}
       </div>
       <div className="sales-actions" style={{justifyContent:"space-between",marginTop:10}}>
        <button type="button" className="secondary" onClick={addPaymentPart}>+ Outra forma de pagamento</button>
        <b>Recebido agora: {money(mixedPaid)} · Saldo a receber: {money(mixedReceivable)}</b>
       </div>
       {mixedReceivable>0&&<div className="sales-form-grid" style={{marginTop:10}}>
         <label>Vencimento do saldo
           <input type="date" value={form.firstDueDate} onChange={e=>setForm({...form,firstDueDate:e.target.value})}/>
         </label>
         <label>Meio previsto para o saldo
           <select value={form.paymentMethodId} onChange={e=>setForm({...form,paymentMethodId:e.target.value})}><option value="">Definir depois</option>{methods.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>
         </label>
         <div className="sales-total-box"><span>Saldo programado</span><strong>{money(mixedReceivable)}</strong></div>
       </div>}
      </div>}
     {form.paymentCondition==="CARNÊ"&&<><label>Parcelas
       <select value={form.installments} onChange={e=>setForm({...form,installments:e.target.value})}>{Array.from({length:24},(_,i)=><option key={i+1} value={i+1}>{i+1}x</option>)}</select>
      </label><label>Entrada
       <input type="number" min="0" step="0.01" max={total} value={form.entryAmount} onChange={e=>setForm({...form,entryAmount:e.target.value})}/>
      </label><label>1º vencimento
       <input type="date" value={form.firstDueDate} onChange={e=>setForm({...form,firstDueDate:e.target.value})}/>
      </label></>}
     {form.paymentCondition==="PIX"&&<div className="sales-wide sales-pix-box">
       <div className="sales-payment-title"><b>PIX da loja</b><span>Selecione uma chave cadastrada ou cadastre uma nova.</span></div>
       <div className="sales-form-grid">
        <label>Chave PIX<select value={form.pixPayload} onChange={e=>setForm({...form,pixPayload:e.target.value})}><option value="">Selecione uma chave</option>{pixKeys.map(k=><option key={k.id} value={k.id}>{k.type} · {k.key} · {k.holderName}</option>)}</select></label>
        <div className="sales-actions"><button type="button" className="secondary" onClick={()=>setShowPixManager(v=>!v)}>⚙ Cadastrar chave PIX</button></div>
       </div>
       {form.pixPayload&&pixKeys.some(k=>k.id===form.pixPayload)&&<div className="sales-pix-preview"><span>QR será gerado automaticamente para o valor da venda.</span><img className="sales-pix-qr" src={"https://quickchart.io/qr?size=180&text="+encodeURIComponent(pixPayload(pixKeys.find(k=>k.id===form.pixPayload)!,total))}/></div>}
       {showPixManager&&<div className="sales-pix-manager"><div className="sales-form-grid">
        <label>Tipo<select value={pixForm.type} onChange={e=>setPixForm({...pixForm,type:e.target.value})}><option value="ALEATORIA">Aleatória</option><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option><option value="EMAIL">E-mail</option><option value="TELEFONE">Telefone</option></select></label>
        <label>Chave<input value={pixForm.key} onChange={e=>setPixForm({...pixForm,key:e.target.value})}/></label><label>Titular<input value={pixForm.holderName} onChange={e=>setPixForm({...pixForm,holderName:e.target.value})}/></label><label>Cidade<input value={pixForm.city} onChange={e=>setPixForm({...pixForm,city:e.target.value})}/></label>
       </div><button type="button" className="primary" onClick={async()=>{const rr=await fetch("/api/pix-keys",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(pixForm)});const dd=await rr.json();if(!rr.ok){setMsg(dd.error||"Erro ao cadastrar PIX");return}setPixForm({type:"ALEATORIA",key:"",holderName:"MB Óptica",holderDocument:"",city:"Joinville"});setShowPixManager(false);setMsg("Chave PIX cadastrada.");await load()}}>Salvar chave PIX</button></div>}
      </div>}
     {form.paymentCondition==="PIX"&&form.pixPayload&&<label className="sales-wide">PIX copia e cola<input value={pixKeys.some(k=>k.id===form.pixPayload)?pixPayload(pixKeys.find(k=>k.id===form.pixPayload)!,total):form.pixPayload} readOnly/></label>}
    </div>
    
   </div></div><label className="sales-wide">Observações<textarea rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Entrega, garantia, atendimento..."/></label><div className="sales-actions"><button type="button" className="secondary" onClick={()=>setOpen(false)}>Cancelar</button><button className="primary">Finalizar venda</button></div></form>
  </div></div>}

  <div className="toolbar sales-toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar venda, cliente ou CPF/CNPJ..."/><select value={filter} onChange={e=>setFilter(e.target.value)}><option>TODAS</option><option>ABERTAS</option><option>PAGAS</option><option>CANCELADAS</option></select></div>
  <div className="panel"><div className="panel-heading"><div><h2>Histórico de vendas</h2><p>{filtered.length} venda(s) · últimos 100 registros</p></div></div><div className="table sales-table"><div className="row header"><span>Venda</span><span>Cliente</span><span>Itens</span><span>Total</span><span>Pago</span><span>Status</span></div>
   {filtered.map(s=>{const paid=Number(s.payments?.filter((p:any)=>!p.reversedAt).reduce((a:number,p:any)=>a+Number(p.amount),0)||0);const status=s.canceled?"CANCELADA":paid>=Number(s.total)?"PAGA":paid?"PARCIAL":"ABERTA";return <div className="row sales-row" key={s.id} onClick={()=>setSelected(s)}><strong>#{s.number}</strong><span>{s.customer?.name||"—"}</span><span>{s.items?.length||0}</span><span>{money(s.total)}</span><span>{money(paid)}</span><span className={"sales-status "+status.toLowerCase()}>{status}</span></div>})}
   {!filtered.length&&<div style={{padding:24,textAlign:"center",color:"var(--muted)"}}>Nenhuma venda encontrada.</div>}</div></div>

  {selected&&<div className="panel sales-detail"><div className="panel-heading"><div><span className="eyebrow">VENDA #{selected.number}</span><h2>{selected.customer?.name||"Venda"}</h2><p>{dt(selected.createdAt)} · {selected.saleType==="PEDIDO_OPTICO"?"Pedido óptico":selected.saleType==="ENCOMENDA"?"Encomenda":selected.saleType==="SERVICO"?"Serviço":selected.saleType==="PRODUTOS"?"Produtos":"Balcão"} · Vendedor: {selected.seller?.name||"—"}</p></div><div className="sales-actions"><button className="secondary" onClick={()=>setPaying(selected)}>Receber pagamento</button><button className="secondary" onClick={()=>printSale("CUPOM")}>🖨 Cupom não fiscal</button><button className="secondary" onClick={()=>printSale("RECIBO")}>🖨 Recibo</button><button className="secondary" onClick={()=>printSale("CARNE")}>🖨 Carnê</button><button className="secondary" onClick={()=>printSale("PROMISSORIA")}>🖨 Promissória</button><button className="secondary" onClick={()=>printSale("NF_PREPARO")}>🧾 Preparar NF</button>{selected.fiscalDocument&&<button className="secondary" onClick={()=>printSale("FISCAL")}>🖨 NF autorizada</button>}<button className="secondary" onClick={()=>setSelected(null)}>Fechar</button></div></div>
   <div className="sales-detail-grid"><div><h3>Itens</h3>{(selected.items||[]).map((i:any)=><div className="sales-line" key={i.id}><span>{i.description} × {Number(i.quantity)}</span><b>{money(i.total)}</b></div>)}</div><div><h3>Resumo</h3><div className="sales-line"><span>Subtotal</span><b>{money(selected.subtotal)}</b></div><div className="sales-line"><span>Desconto</span><b>- {money(selected.discount)}</b></div><div className="sales-line"><span>Acréscimo</span><b>+ {money(selected.surcharge)}</b></div><div className="sales-line total"><span>Total</span><b>{money(selected.total)}</b></div></div></div>
   <div className="sales-payment-history"><h3>Pagamentos</h3>{(selected.payments||[]).map((p:any)=><div className="sales-line" key={p.id}><span>{p.method?.name||"—"}{p.cardMachine?.name?" · "+p.cardMachine.name:""}{p.cardInstallments?" · "+p.cardInstallments+"x":""}{p.cardFeeRate!==null&&p.cardFeeRate!==undefined?" · taxa "+Number(p.cardFeeRate)+"%":""} · {dt(p.paidAt)}{p.reference?" · "+p.reference:""}</span><b>{money(p.amount)}</b></div>)}{!selected.payments?.length&&<span style={{color:"var(--muted)"}}>Nenhum pagamento registrado.</span>}</div>
  </div>}

  {paying&&<div className="sales-pdv-overlay" role="dialog" aria-modal="true" aria-label={`Receber venda #${paying.number}`} onMouseDown={e=>{if(e.currentTarget===e.target)setPaying(null)}}><div className="panel sales-form sales-pdv-modal"><div className="panel-heading"><div><span className="eyebrow">RECEBIMENTO</span><h2>Receber venda #{paying.number}</h2><p>Saldo restante: <b>{money(remaining)}</b></p></div><button className="secondary" type="button" onClick={()=>setPaying(null)}>Fechar</button></div><form onSubmit={registerPayment}><div className="sales-form-grid"><label>Meio de pagamento<select required value={pay.methodId} onChange={e=>setPay({...pay,methodId:e.target.value})}><option value="">Selecione</option>{methods.map(m=><option key={m.id} value={m.id}>{m.name}{m.isCash?" · caixa":""}</option>)}</select></label><label>Valor<input required type="number" min="0.01" max={remaining} step="0.01" value={pay.amount||String(remaining)} onChange={e=>setPay({...pay,amount:e.target.value})}/></label><label>Referência<input value={pay.reference} onChange={e=>setPay({...pay,reference:e.target.value})} placeholder="NSU, autorização, comprovante..."/></label></div><div className="sales-actions"><button className="primary">Registrar pagamento</button></div></form></div></div>}
 </section>
}