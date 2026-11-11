import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const targetUrl = required("MB_GESTAO_TARGET_URL");
const productName = required("MB_GESTAO_PRODUCT_NAME");
const identifier = required("MB_GESTAO_APP_IDENTIFIER");
const slug = required("MB_GESTAO_INSTALLER_SLUG");

let parsed;
try {
  parsed = new URL(targetUrl);
} catch {
  throw new Error("MB_GESTAO_TARGET_URL must be a valid absolute URL");
}
if (parsed.protocol !== "https:") throw new Error("Customer installer target must use HTTPS");
if (parsed.username || parsed.password || parsed.search || parsed.hash) {
  throw new Error("Customer installer URL cannot contain credentials, query parameters or fragments");
}
if (parsed.hostname.toLowerCase() === "gestao.mboptica.com.br") {
  throw new Error("Refusing to build a customer installer pointed at the MB Óptica production system");
}
if (!/^[a-z][a-z0-9-]{1,47}$/.test(slug)) {
  throw new Error("MB_GESTAO_INSTALLER_SLUG must be 2-48 lowercase letters, digits or hyphens");
}
if (!/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)+$/.test(identifier)) {
  throw new Error("MB_GESTAO_APP_IDENTIFIER must be a unique reverse-domain identifier");
}
if (identifier === "br.com.mboptica.gestao") {
  throw new Error("Customer installer must have a unique Tauri identifier");
}

const configPath = resolve("src-tauri/tauri.customer.generated.conf.json");
const config = {
  productName,
  identifier,
  app: {
    windows: [{
      title: productName,
      width: 1360,
      height: 900,
      minWidth: 980,
      minHeight: 680,
      url: targetUrl
    }]
  },
  bundle: {
    shortDescription: `${productName} — instalação independente`,
    longDescription: `${productName}. Instância independente; requer internet e autenticação.`
  }
};

writeFileSync(configPath, JSON.stringify(config, null, 2), { flag: "wx" });
try {
  if (process.argv.includes("--validate-only")) {
    console.log(JSON.stringify({ valid: true, targetHost: parsed.host, productName, identifier, slug }));
    process.exitCode = 0;
  } else {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const result = spawnSync(npm, ["exec", "--", "tauri", "build", "--config", configPath], {
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} finally {
  unlinkSync(configPath);
}
