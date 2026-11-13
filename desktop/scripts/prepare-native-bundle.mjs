import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve("..");
const resources = resolve("resources/native");
const app = join(resources, "app");
const required = [
  join(resources, "node.exe"),
  join(app, "server.js"),
  join(app, "prisma/schema.prisma"),
  join(resources, "prisma-cli/node_modules/prisma/build/index.js"),
  join(resources, "prisma-cli/node_modules/prisma/package.json"),
];
for (const file of required) {
  if (!existsSync(file)) throw new Error("Componente nativo obrigatório ausente: " + file);
}
console.log(JSON.stringify({
  valid: true,
  runtime: "Node.js bundled",
  database: "SQLite local por instalação",
  appFiles: readdirSync(app).length,
  prismaCli: true,
  sqliteSchema: true,
}, null, 2));
