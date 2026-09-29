import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

type P=Record<string,unknown>;
const text=(v:unknown)=>v==null?"":String(v).trim();
const digits=(v:unknown)=>text(v).replace(/\D/g,"");
const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:0};
const money=(n:number)=>Math.round(n*100)/100;

function saleTotal(p:P){
  const values=p.valoresIDs;
  const gross=values&&typeof values==="object"
    ? Object.values(values as Record<string,unknown>).reduce((s:number,v:unknown)=>s+num(v),0)
    : num(p.valor??p.total);
  return Math.max(0,gross-num(p.desconto));
}
function paidFromSale(p:P){
  const payments=p.pagamentosIDs;
  if(!payments||typeof payments!=="object") return 0;
  return Object.values(payments as Record<string,unknown>).reduce((sum:number,v:unknown)=>{
    if(!Array.isArray(v)) return sum+num(v);
    if(v.length>=2) return sum+num(v[0])*num(v[1]);
    return sum+num(v[0]);
  },0);
}
function openReceivable(p:P){
  if(p.archived===true) return 0;
  const installments=Array.isArray(p.parcelas)?(p.parcelas as unknown[]).map(num):[];
  const paidCount=Array.isArray(p.pagos)?p.pagos.length:0;
  if(installments.length) return Math.max(0,installments.slice(Math.min(paidCount,installments.length)).reduce((s,v)=>s+v,0));
  return Math.max(0,num(p.valor));
}

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    await requireRole(["ADMIN","GERENTE","VENDEDOR","FINANCEIRO"]);
    const {id}=await params;
    const customer=await db.customer.findUnique({where:{id},select:{name:true,cpfCnpj:true,phone:true,whatsapp:true,email:true}});
    if(!customer) return NextResponse.json({ok:false,error:"Cliente não encontrado."},{status:404});

    const legacyCustomers=await db.legacyRecord.findMany({
      where:{source:"BEEPSTART",collectionKey:{equals:"Cliente",mode:"insensitive"}},
      select:{id:true,legacyId:true,payload:true,targetId:true}
    });
    const cn=digits(customer.cpfCnpj), cp=digits(customer.phone||customer.whatsapp);
    const nn=text(customer.name).toLowerCase().replace(/\\s+/g," ");
    const matches=legacyCustomers.filter(r=>{
      const p=(r.payload||{}) as P;
      const rc=digits(p.cnp||p.cpf||p.cpfCnpj||p.cnpj||p.documento);
      const rp=digits(p.phone||p.telefone||p.celular);
      const rn=text(p.name||p.nome).toLowerCase().replace(/\\s+/g," ");
      if(cn&&rc) return cn===rc;
      if(cp&&rp) return cp===rp;
      return !!nn&&!!rn&&nn===rn;
    });
    const legacyIds=matches.map(m=>m.legacyId).filter(Boolean) as string[];
    if(!legacyIds.length) return NextResponse.json({ok:true,matched:false,source:"BEEPSTART",matches:[],addresses:[],sales:[],accounts:[],summary:{sales:0,billed:0,paid:0,receivable:0}});

    const all=await db.legacyRecord.findMany({
      where:{source:"BEEPSTART",OR:[
        {collectionKey:{equals:"Venda",mode:"insensitive"}},
        {collectionKey:{equals:"ContaAReceber",mode:"insensitive"}},
        {collectionKey:{equals:"EnderecoLocal",mode:"insensitive"}}
      ]},
      select:{collectionKey:true,legacyId:true,payload:true}
    });
    const addresses=all.filter(r=>String(r.collectionKey).toLowerCase()==="enderecolocal" && legacyIds.includes(text((r.payload as P)?.clienteID))).map(r=>{
      const p=(r.payload||{}) as P;
      return {id:r.legacyId, label:text(p.label||p.identificacao||"Endereço legado"), street:text(p.logradouro||p.street), number:text(p.numero||p.number), complement:text(p.complemento||p.complement), district:text(p.distrito||p.district||p.bairro), city:text(p.cidade||p.city), state:text(p.estado||p.state), postalCode:text(p.cep||p.postalCode)};
    });
    const sales=all.filter(r=>String(r.collectionKey).toLowerCase()==="venda" && legacyIds.includes(text((r.payload as P)?.clienteID))).map(r=>{
      const p=(r.payload||{}) as P;
      return {id:r.legacyId,date:p.data,total:money(saleTotal(p)),paid:money(paidFromSale(p)),discount:money(num(p.desconto)),notes:text(p.observacoes),concluido:p.concluido!==false};
    }).filter(s=>s.concluido).sort((a,b)=>num(b.date)-num(a.date));
    const accounts=all.filter(r=>String(r.collectionKey).toLowerCase()==="contaareceber" && legacyIds.includes(text((r.payload as P)?.clienteID))).map(r=>{
      const p=(r.payload||{}) as P;
      return {id:r.legacyId,description:text(p.descricao),value:money(num(p.valor)),open:money(openReceivable(p)),vencimentos:Array.isArray(p.vencimentos)?p.vencimentos:[],pagos:Array.isArray(p.pagos)?p.pagos:[]};
    }).filter(a=>a.open>0);

    const summary={
      sales:sales.length,
      billed:money(sales.reduce((s,v)=>s+v.total,0)),
      paid:money(sales.reduce((s,v)=>s+v.paid,0)),
      receivable:money(accounts.reduce((s,v)=>s+v.open,0))
    };
    return NextResponse.json({ok:true,matched:true,source:"BEEPSTART",matches:matches.map(m=>({legacyId:m.legacyId,payload:m.payload})),addresses,sales:sales.slice(0,50),accounts:accounts.slice(0,50),summary});
  }catch(error){return apiError(error,"Não foi possível carregar o histórico BeepStart do cliente.");}
}