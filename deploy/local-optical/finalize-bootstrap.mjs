import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const slug = process.argv[2]?.trim().toLowerCase();
if (!slug || !/^[a-z][a-z0-9-]{2,39}$/.test(slug)) {
  console.error("Uso: node deploy/local-optical/finalize-bootstrap.mjs <slug-da-optica>");
  process.exit(1);
}
const envPath = resolve(root, "deploy/local-optical/instances", slug, ".env");
let env = await readFile(envPath, "utf8");
if (!/^BOOTSTRAP_TOKEN=/m.test(env)) {
  console.error("BOOTSTRAP_TOKEN não encontrado; nenhuma alteração realizada.");
  process.exit(1);
}
env = env.replace(/^BOOTSTRAP_TOKEN=.*$/m, "BOOTSTRAP_TOKEN=DISABLED_AFTER_INITIAL_SETUP");
await writeFile(envPath, env, { mode: 0o600 });
if (process.platform !== "win32") {
  const { chmod } = await import("node:fs/promises");
  await chmod(envPath, 0o600);
}
const composeFile = resolve(root, "deploy/local-optical/compose.yaml");
const docker = process.platform === "win32" ? "docker.exe" : "docker";
const result = spawnSync(docker, ["compose", "--env-file", envPath, "-p", slug, "-f", composeFile, "up", "-d", "--no-deps", "--force-recreate", "app"], { cwd: root, stdio: "inherit" });
if (result.error || result.status !== 0) {
  console.error("Token desativado no arquivo, mas não foi possível recriar o contêiner. Verifique os logs e reinicie o serviço app para aplicar a alteração.");
  process.exit(result.status ?? 1);
}
console.log("Bootstrap desativado e contêiner da aplicação recriado. O endpoint /api/auth/bootstrap não poderá criar outro administrador.");
