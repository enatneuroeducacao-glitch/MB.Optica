import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { cp, copyFile, mkdir, rm } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve("..");
const resources = resolve("resources/native");
const app = join(resources, "app");
const pg = join(resources, "postgres");
const required = [
  join(resources, "node.exe"),
  join(app, "server.js"),
  join(resources, "prisma-cli/node_modules/prisma/build/index.js"),
  join(resources, "prisma-cli/node_modules/prisma/package.json"),
  join(pg, "bin/initdb.exe"),
  join(pg, "bin/pg_ctl.exe"),
  join(pg, "bin/createdb.exe"),
  join(pg, "bin/psql.exe"),
  join(pg, "bin/postgres.exe"),
];
for (const file of required) {
  if (!existsSync(file)) throw new Error("Componente nativo obrigatório ausente: " + file);
}
const pgBin = join(pg, "bin");
for (const name of ["lib", "share"]) {
  if (!existsSync(join(pg, name))) throw new Error("Diretório PostgreSQL ausente: " + name);
}
const prismaCli = join(resources, "prisma-cli/node_modules/prisma/build/index.js");
console.log(JSON.stringify({
  valid: true,
  prismaCli: existsSync(prismaCli),
  runtime: "Node.js bundled",
  database: "PostgreSQL portable",
  appFiles: readdirSync(app).length,
  postgresExecutables: ["initdb.exe", "pg_ctl.exe", "createdb.exe", "psql.exe", "postgres.exe"].every(x => existsSync(join(pgBin, x)))
}, null, 2));
