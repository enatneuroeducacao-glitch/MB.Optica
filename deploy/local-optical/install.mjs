import { randomBytes } from "node:crypto";
import { mkdir, writeFile, access, chmod } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const deployDir = resolve(root, "deploy/local-optical");
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}
function fail(message) { console.error(`ERRO: ${message}`); process.exit(1); }
function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: "inherit", ...options });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`${command} terminou com código ${result.status}`);
}
const slug = option("--slug", "").trim().toLowerCase();
const storeName = option("--name", "").trim();
const state = option("--state", "SC").trim().toUpperCase();
if (!/^[a-z][a-z0-9-]{2,39}$/.test(slug)) fail("Use --slug com 3 a 40 caracteres: letras minúsculas, números e hífen.");
if (storeName.length < 2 || storeName.length > 100 || /[$#=\\r\\n]/.test(storeName)) fail("Informe --name com 2 a 100 caracteres, sem $, # ou quebras de linha.");
if (!/^[A-Z]{2}$/.test(state)) fail("--state deve ser uma UF com duas letras.");
const docker = process.platform === "win32" ? "docker.exe" : "docker";
const check = spawnSync(docker, ["compose", "version"], { cwd: root, encoding: "utf8" });
if (check.status !== 0) fail("Docker Compose não encontrado. Instale e inicie Docker Desktop antes de continuar.");
const daemon = spawnSync(docker, ["info"], { cwd: root, stdio: "ignore" });
if (daemon.status !== 0) fail("Docker Desktop está instalado, mas o serviço ainda não está pronto.");

const instanceDir = resolve(deployDir, "instances", slug);
const envPath = resolve(instanceDir, ".env");
await mkdir(instanceDir, { recursive: true });
try {
  await access(envPath);
  fail(`A instância ${slug} já possui .env. Por segurança, o provisionador não sobrescreve dados ou credenciais existentes.`);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const secret = (bytes = 48) => randomBytes(bytes).toString("base64url");
const env = [
  `COMPOSE_PROJECT_NAME=${slug}`,
  `STORE_TRADE_NAME=${storeName.replace(/[\r\n]/g, " ")}`,
  `STORE_STATE=${state}`,
  "APP_BIND_ADDRESS=127.0.0.1",
  `DB_PASSWORD=${secret()}`,
  `AUTH_SECRET=${secret()}`,
  `BOOTSTRAP_TOKEN=${secret()}`,
  ""
].join("\n");
await writeFile(envPath, env, { flag: "wx", mode: 0o600 });
if (process.platform !== "win32") await chmod(envPath, 0o600);

const compose = ["compose", "--env-file", envPath, "-p", slug, "-f", resolve(deployDir, "compose.yaml")];
console.log(`Provisionando instância local vazia: ${storeName} (${slug})`);
run(docker, [...compose, "up", "-d", "--build"]);
const bootstrap = env.match(/^BOOTSTRAP_TOKEN=(.+)$/m)?.[1];
console.log("\\nAguardando aplicação e banco...");
let ready = false;
for (let attempt = 0; attempt < 90; attempt++) {
  try {
    const response = await fetch("http://127.0.0.1:3000/api/health/ready", { signal: AbortSignal.timeout(2500) });
    if (response.ok) { ready = true; break; }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 2000));
}
if (!ready) {
  console.error("A aplicação ainda não ficou pronta. Consulte os logs com docker compose; a instância e o volume foram preservados.");
  process.exit(2);
}
console.log("\\nInstância provisionada e pronta.");
console.log(`Configuração inicial: http://127.0.0.1:3000/setup`);
console.log(`Token de bootstrap (guarde com segurança; exibido uma única vez): ${bootstrap}`);
console.log(`Segredos e dados de configuração: ${envPath}`);
console.log("Acesso limitado ao computador-servidor (loopback). Acesso por outros computadores será habilitado somente após implantação de HTTPS e certificado confiável na LAN.");
console.log("A aplicação e o PostgreSQL têm volume/projeto exclusivos. Não copie o .env para outra óptica.");
