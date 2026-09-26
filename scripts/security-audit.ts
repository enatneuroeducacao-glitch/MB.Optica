import fs from "node:fs";
import path from "node:path";
import { effectivePermissions, hasPermission, ROLE_DEFAULT_PERMISSIONS, API_PERMISSIONS, API_PUBLIC_AUTHENTICATED } from "../src/lib/permissions";

const root=process.cwd();
const assert=(condition:boolean,message:string)=>{if(!condition)throw new Error("SECURITY AUDIT FAILED: "+message)};

for(const role of ["ADMIN","GERENTE","VENDEDOR","FINANCEIRO","LABORATORIO"]){
  const perms=effectivePermissions(role,{});
  assert(Object.keys(perms).length>0, role+" has no permission matrix");
}
assert(hasPermission("ADMIN",{}, "financeiro"), "ADMIN must access finance");
assert(hasPermission("ADMIN",{}, "configuracoes"), "ADMIN must access settings");
assert(!hasPermission("VENDEDOR",{}, "financeiro"), "VENDEDOR must not access finance by default");
assert(hasPermission("FINANCEIRO",{}, "financeiro"), "FINANCEIRO must access finance");
assert(!hasPermission("FINANCEIRO",{}, "estoque"), "FINANCEIRO must not access stock by default");
assert(hasPermission("LABORATORIO",{}, "estoque"), "LABORATORIO must access stock");
assert(!hasPermission("LABORATORIO",{}, "financeiro"), "LABORATORIO must not access finance");
assert(hasPermission("VENDEDOR",{financeiro:true}, "financeiro"), "explicit permission grant must be effective");
assert(!hasPermission("GERENTE",{financeiro:false}, "financeiro"), "explicit permission denial must override role default");
assert(API_PERMISSIONS["/api/financeiro"]==="financeiro", "finance center API must be protected");
assert(API_PERMISSIONS["/api/sales"]==="vendas", "sales API must be protected by sales permission");
assert(API_PERMISSIONS["/api/users"]==="usuarios", "users API must be protected by users permission");

const walk=(dir:string):string[]=>{
  const entries=fs.readdirSync(dir,{withFileTypes:true});
  return entries.flatMap(entry=>{
    const full=path.join(dir,entry.name);
    return entry.isDirectory()?walk(full):entry.name==="route.ts"?[full]:[];
  });
};
const apiRoot=path.join(root,"src/app/api");
const unmapped=walk(apiRoot).map(file=>{
  const rel=path.relative(apiRoot,path.dirname(file)).split(path.sep).filter(Boolean);
  return "/api/"+rel.join("/");
}).filter(route=>!API_PUBLIC_AUTHENTICATED.has(route)&&!["/api/auth/login","/api/auth/logout","/api/auth/bootstrap","/api/health"].includes(route)&&!Object.keys(API_PERMISSIONS).some(prefix=>route===prefix||route.startsWith(prefix+"/")));
assert(unmapped.length===0, "unmapped API routes: "+unmapped.join(", "));

const schema=fs.readFileSync(path.join(root,"prisma/schema.prisma"),"utf8");
assert(/model StoreSettings[\s\S]*logoData String\?/.test(schema), "StoreSettings.logoData is not persisted in Prisma schema");

const login=fs.readFileSync(path.join(root,"src/app/api/auth/login/route.ts"),"utf8");
assert(!login.includes('body.password === "admin"'), "temporary admin/admin login is still present");
assert(!login.includes('identifier === "admin"'), "temporary admin identifier is still present");

const middleware=fs.readFileSync(path.join(root,"middleware.ts"),"utf8");
assert(middleware.includes("permissionForApi"), "middleware does not enforce API permissions");
assert(middleware.includes("effectivePermissionFromToken"), "middleware does not evaluate session permissions");

console.log("Security audit: PASS");
console.log("Profiles checked: ADMIN, GERENTE, VENDEDOR, FINANCEIRO, LABORATORIO");
console.log("API permission map checked: "+Object.keys(API_PERMISSIONS).length+" prefixes");
console.log("Logo persistence, session permissions and temporary login checks: PASS");
