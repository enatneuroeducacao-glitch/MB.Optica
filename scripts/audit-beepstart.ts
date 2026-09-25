import fs from "node:fs";
import path from "node:path";

type LegacyRecord={id?:string;collection_key?:string|null;[key:string]:unknown};

const input=process.argv[2]??process.env.BEEPSTART_BACKUP;
if(!input) throw new Error("Uso: npm run audit:beepstart -- ./backup.json");

const absolute=path.resolve(input);
if(!fs.existsSync(absolute)) throw new Error("Backup não encontrado: "+absolute);

const raw=JSON.parse(fs.readFileSync(absolute,"utf8"));
if(!Array.isArray(raw)) throw new Error("O backup precisa conter uma lista JSON.");

const records=raw as LegacyRecord[];
const byCollection=new Map<string,LegacyRecord[]>();
for(const record of records){
  const key=String(record.collection_key??"SEM_COLLECTION");
  const list=byCollection.get(key)??[];
  list.push(record);
  byCollection.set(key,list);
}

const idSet=(key:string)=>new Set((byCollection.get(key)??[]).map(r=>String(r.id??"")).filter(Boolean));
const refChecks:[
  string,string,string
][]=[
  ["Venda","Cliente","clienteId"],
  ["Venda","Usuario","usuarioId"],
  ["Venda","EnderecoLocal","enderecoLocalId"],
  ["Produto","Categoria","categoriaId"],
  ["Produto","Fornecedor","fornecedorId"],
  ["Lote","Produto","produtoId"],
  ["Lote","Venda","vendaId"],
  ["Ordem","Cliente","clienteId"],
  ["Ordem","Venda","vendaId"]
];

const report:{
  collections:Record<string,number>;
  references:{source:string,target:string,field:string,checked:number,missing:number}[];
  total:number;
  duplicateIds:number;
}={
  collections:{},
  references:[],
  total:records.length,
  duplicateIds:0
};

for(const [key,list] of byCollection.entries()) report.collections[key]=list.length;

const globalIds=new Map<string,number>();
for(const record of records){
  if(!record.id) continue;
  const key=String(record.collection_key??"SEM_COLLECTION");
  const compound=key+":"+record.id;
  globalIds.set(compound,(globalIds.get(compound)??0)+1);
}
report.duplicateIds=[...globalIds.values()].filter(v=>v>1).length;

for(const [source,target,field] of refChecks){
  const targetIds=idSet(target);
  let checked=0;
  let missing=0;
  for(const record of byCollection.get(source)??[]){
    const value=record[field];
    if(value===undefined||value===null||value==="") continue;
    checked++;
    if(!targetIds.has(String(value))) missing++;
  }
  report.references.push({source,target,field,checked,missing});
}

const missingRefs=report.references.filter(r=>r.missing>0);
console.log(JSON.stringify({
  ok:missingRefs.length===0,
  ...report,
  warnings:missingRefs.map(r=>`${r.source}.${r.field} -> ${r.target}: ${r.missing} referências não encontradas`)
},null,2));
