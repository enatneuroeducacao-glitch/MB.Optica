import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const slug = process.argv[2]?.trim().toLowerCase();
if (!slug || !/^[a-z][a-z0-9-]{2,39}$/.test(slug)) {
  console.error("Uso: node deploy/local-optical/backup.mjs <slug-da-optica> [arquivo-de-saida]");
  process.exit(1);
}
const envPath = resolve(root, "deploy/local-optical/instances", slug, ".env");
const composeFile = resolve(root, "deploy/local-optical/compose.yaml");
const output = resolve(root, process.argv[3] || `deploy/local-optical/backups/${slug}/${slug}-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}.dump`);
await mkdir(dirname(output), { recursive: true });
const docker = process.platform === "win32" ? "docker.exe" : "docker";
const args = ["compose", "--env-file", envPath, "-p", slug, "-f", composeFile, "exec", "-T", "db", "pg_dump", "-U", "mb_optica", "-d", "mb_optica", "-Fc"];
const child = spawn(docker, args, { cwd: root, stdio: ["ignore", "pipe", "inherit"] });
const file = createWriteStream(output, { flags: "wx" });
const streamDone = pipeline(child.stdout, file);
const childDone = new Promise((resolvePromise, reject) => {
  child.once("error", reject);
  child.once("close", resolvePromise);
});
const [streamResult, exitCode] = await Promise.allSettled([streamDone, childDone]);
if (streamResult.status === "rejected" || exitCode.status === "rejected" || exitCode.value !== 0) {
  console.error("pg_dump falhou. Verifique se a instância está ativa; não use um arquivo parcial como backup.");
  process.exit(1);
}
const info = await stat(output);
if (info.size < 100) {
  console.error("O arquivo gerado é pequeno demais para ser considerado um backup válido.");
  process.exit(1);
}
console.log(`Backup PostgreSQL criado: ${output} (${info.size} bytes)`);
console.log("Armazene uma cópia criptografada fora do computador-servidor. A restauração ainda deve ser testada em banco isolado.");
