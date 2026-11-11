import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const slug = process.argv[2]?.trim().toLowerCase();
const lanHost = process.argv[3]?.trim().toLowerCase();
const ipv4Parts = lanHost?.split(".") ?? [];
const ipv4 = ipv4Parts.length === 4 && ipv4Parts.every(part => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
const hostname = !!lanHost && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(lanHost);

if (!slug || !/^[a-z][a-z0-9-]{2,39}$/.test(slug) || !lanHost || (!ipv4 && !hostname)) {
  console.error("Uso: node deploy/local-optical/enable-lan.mjs <slug> <ip-estatico-ou-hostname-da-rede>");
  process.exit(1);
}

const envPath = resolve(root, "deploy/local-optical/instances", slug, ".env");
let env = await readFile(envPath, "utf8");
function setEnv(key, value) {
  const line = new RegExp("^" + key + "=.*$", "m");
  if (line.test(env)) env = env.replace(line, key + "=" + value);
  else env += "\n" + key + "=" + value + "\n";
}
setEnv("LAN_HOST", lanHost);
setEnv("LAN_BIND_ADDRESS", ipv4 ? lanHost : "0.0.0.0");
await writeFile(envPath, env, { mode: 0o600 });
if (process.platform !== "win32") await chmod(envPath, 0o600);

const composeFile = resolve(root, "deploy/local-optical/compose.yaml");
const docker = process.platform === "win32" ? "docker.exe" : "docker";
const compose = ["compose", "--env-file", envPath, "-p", slug, "-f", composeFile, "--profile", "lan"];
const up = spawnSync(docker, [...compose, "up", "-d", "proxy"], { cwd: root, stdio: "inherit" });
if (up.error || up.status !== 0) process.exit(up.status ?? 1);

const certDir = resolve(root, "deploy/local-optical/certificates", slug);
await mkdir(certDir, { recursive: true });
const certPath = resolve(certDir, "local-root-ca.crt");
const wait = spawnSync(docker, [...compose, "exec", "-T", "proxy", "sh", "-c", "for i in $(seq 1 30); do test -s /data/caddy/pki/authorities/local/root.crt && exit 0; sleep 1; done; exit 1"], { cwd: root, stdio: "inherit" });
if (wait.error || wait.status !== 0) {
  console.error("Caddy não gerou a CA raiz no tempo esperado.");
  process.exit(wait.status ?? 1);
}
const copy = spawnSync(docker, [...compose, "cp", "proxy:/data/caddy/pki/authorities/local/root.crt", certPath], { cwd: root, stdio: "inherit" });
if (copy.error || copy.status !== 0) {
  console.error("Proxy iniciou, mas não foi possível exportar a CA. Consulte os logs; não distribua o certificado até verificar a origem.");
  process.exit(copy.status ?? 1);
}
console.log(\`HTTPS LAN configurado: https://\${lanHost}/\`);
console.log(\`Certificado raiz para instalar nos computadores autorizados: \${certPath}\`);
console.log("Instale a CA no repositório de Autoridades Raiz Confiáveis do Windows em cada estação, usando procedimento administrativo.");
console.log("Antes de conectar as estações, restrinja a porta TCP 443 no Firewall do Windows à sub-rede privada da óptica. Não faça encaminhamento no roteador.");
