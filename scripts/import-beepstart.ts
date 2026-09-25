import fs from "node:fs";import path from "node:path";
type LegacyRecord={id?:string;collection_key?:string|null;[key:string]:unknown};
const input=process.argv[2]??process.env.BEEPSTART_BACKUP;if(!input){console.error("Uso: npm run import:beepstart -- ./backup.json");process.exit(1)}
const absolute=path.resolve(input);if(!fs.existsSync(absolute)){console.error("Backup não encontrado:",absolute);process.exit(1)}
const raw=JSON.parse(fs.readFileSync(absolute,"utf8"));if(!Array.isArray(raw))throw new Error("O backup precisa conter uma lista JSON.");
const counts=new Map<string,number>();for(const item of raw as LegacyRecord[]){const key=item.collection_key??"SEM_COLLECTION";counts.set(key,(counts.get(key)??0)+1)}
console.log("Prévia de migração MB Óptica");console.log("Registros:",raw.length);for(const entry of [...counts.entries()].sort((a,b)=>b[1]-a[1]))console.log(entry[0]+": "+entry[1]);console.log("Nenhum dado será gravado por este comando de prévia.");
