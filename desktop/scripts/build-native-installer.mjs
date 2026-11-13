import { existsSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Variável obrigatória ausente: " + name);
  return value;
};
const productName = required("MB_GESTAO_PRODUCT_NAME");
const identifier = required("MB_GESTAO_APP_IDENTIFIER");
const slug = required("MB_GESTAO_INSTALLER_SLUG");
if (!/^[a-z][a-z0-9-]{1,47}$/.test(slug)) throw new Error("Slug inválido");
if (!/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)+$/.test(identifier)) throw new Error("Identificador inválido");
const resourceDir = resolve("resources/native");
for (const path of ["node.exe", "app/server.js", "prisma-cli/node_modules/prisma/build/index.js", "postgres/bin/initdb.exe", "postgres/bin/pg_ctl.exe", "postgres/bin/createdb.exe", "postgres/bin/psql.exe", "postgres/bin/postgres.exe"]) {
  if (!existsSync(resolve(resourceDir, path))) throw new Error("Recurso nativo ausente: " + path);
}
const configPath = resolve("src-tauri/tauri.native.generated.conf.json");
const config = {
  // PostgreSQL on Windows can fail during initdb when its executable path
  // contains non-ASCII characters (e.g. "Gestão" -> CP1252 byte 0xE3).
  // Keep the installed resource path ASCII-only; the window title below
  // retains the customer-facing Portuguese product name.
  productName: "MBGestaoOpticaImagem",
  identifier,
  app: { windows: [{ label: "main", title: productName, width: 1360, height: 900, minWidth: 980, minHeight: 680, visible: false, url: "http://127.0.0.1:3000/" }] },
  bundle: {
    // Map the external folder explicitly to $RESOURCES/native. Array notation
    // rewrites the leading ".." to "_up_", which does not match native_prepare().
    resources: { "../resources/native": "native" },
    shortDescription: productName + " — instalação nativa Windows",
    longDescription: productName + ". Aplicação local independente, sem Docker."
  }
};
writeFileSync(configPath, JSON.stringify(config, null, 2), { flag: "wx" });
try {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["run", "tauri:icon"], { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error("Falha ao preparar ícones Tauri");
  const build = spawnSync(npm, ["exec", "--", "tauri", "build", "--config", configPath], { stdio: "inherit", shell: process.platform === "win32" });
  if (build.error) throw build.error;
  if (build.status !== 0) throw new Error("Compilação do instalador nativo falhou");
} finally {
  if (existsSync(configPath)) unlinkSync(configPath);
}
