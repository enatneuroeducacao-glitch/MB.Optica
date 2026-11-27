import {NextResponse} from "next/server";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {db} from "@/lib/db";
import {requireRole} from "@/lib/auth";
import {apiError} from "@/lib/api-error";

const n=(v:any)=>Number(v||0);
const key=(value:any)=>{if(value===null||value===undefined||value==="")return null;const d=new Date(value);if(Number.isNaN(d.getTime()))return null;const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit"}).formatToParts(d);return parts.find(x=>x.type==="year")?.value+"-"+parts.find(x=>x.type==="month")?.value};
const saleTotal=(p:any)=>{const values=p?.valoresIDs;const gross=values&&typeof values==="object"?Object.values(values as Record<string,unknown>).reduce<number>((sum,v)=>sum+n(v),0):n(p?.valor??p?.total);return Math.max(0,gross-n(p?.desconto))};

export async function GET(){
 try{
  await requireRole(["ADMIN","GERENTE"]);
  const [sales,legacyRows,manualRows,historicalText,settings]=await Promise.all([
   db.sale.findMany({where:{canceled:false},select:{createdAt:true,total:true},orderBy:{createdAt:"desc"},take:1000}),
   db.legacyRecord.findMany({where:{source:"BEEPSTART",collectionKey:"Venda"},select:{payload:true},orderBy:{id:"asc"}}),
   db.legacyRecord.findMany({where:{source:"MANUAL_HISTORICO",collectionKey:"FATURAMENTO_MENSAL"},select:{payload:true},orderBy:{importedAt:"asc"}}),
   readFile(join(process.cwd(),"public","beepstart-historico-mensal.json"),"utf8").catch(()=>"{\"monthly\":[]}"),
   db.storeSettings.findFirst({where:{active:true},select:{monthlySalesGoal:true}})
  ]);
  const operationalMap=new Map<string,any>();
  for(const s of sales){const month=key(s.createdAt);if(!month)continue;const row=operationalMap.get(month)||{month,sales:0,total:0,partial:false};row.sales+=1;row.total+=n(s.total);operationalMap.set(month,row);}
  const legacyMap=new Map<string,any>();
  for(const row of legacyRows){const p=(row.payload||{}) as any;if(p.concluido===false)continue;const total=saleTotal(p);if(total<=0)continue;const month=key(n(p.data)?new Date(n(p.data)):null);if(!month)continue;const current=legacyMap.get(month)||{month,sales:0,total:0,partial:false};current.sales+=1;current.total+=total;legacyMap.set(month,current);}
  const manualMap=new Map<string,any>();
  for(const row of manualRows){const p=(row.payload||{}) as any;const month=String(p.month||"");if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))continue;manualMap.set(month,{month,sales:n(p.sales),total:n(p.total),partial:false});}
  const historical=JSON.parse(historicalText);
  const historicalMap=new Map<string,any>((historical?.monthly||[]).map((x:any)=>[String(x.month),{month:String(x.month),sales:n(x.sales),total:n(x.total),partial:Boolean(x.partial)}]));
  const now=new Date();
  const currentMonth=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit"}).format(now);
  const months=[...new Set<string>([...operationalMap.keys(),...historicalMap.keys(),...legacyMap.keys(),...manualMap.keys(),currentMonth])].sort();
  const monthly=months.map(month=>{const op=operationalMap.get(month),manual=manualMap.get(month),aggregate=historicalMap.get(month),legacy=legacyMap.get(month);if(op&&(op.sales>0||op.total>0))return {...op,origin:"MB Óptica",partial:false};if(manual)return {...manual,origin:"Manual"};if(aggregate)return {...aggregate,origin:"BeepStart agregado"};if(legacy)return {...legacy,origin:"BeepStart legado"};return {month,sales:0,total:0,partial:false,origin:"—"};});
  const targetFor=(index:number)=>{const previous=monthly.slice(0,index).filter(x=>n(x.total)>0&&!x.partial).slice(-3);return previous.length?previous.reduce((sum,x)=>sum+n(x.total),0)/previous.length*1.10:null;};
  const currentIndex=monthly.findIndex(x=>x.month===currentMonth);
  const adaptive=currentIndex>=0?targetFor(currentIndex):null;
  const configured=n(settings?.monthlySalesGoal);
  const target=configured>0?configured:adaptive;
  return NextResponse.json({ok:true,month:currentMonth,target:target===null?null:Math.round(target*100)/100,configured:configured>0,adaptive:adaptive===null?null:Math.round(adaptive*100)/100,basis:currentIndex>0?monthly.slice(0,currentIndex).filter(x=>n(x.total)>0&&!x.partial).slice(-3).map(x=>({month:x.month,total:Math.round(n(x.total)*100)/100,origin:x.origin})):[],rule:configured>0?"Meta mensal cadastrada em Configura??es (fonte ?nica para Vendas e Relat?rios).":"M?dia dos at? 3 meses anteriores com faturamento positivo, excluindo per?odos parciais, acrescida de 10%."});
 }catch(error){return apiError(error,"Não foi possível calcular a meta mensal adaptativa.");}
}
