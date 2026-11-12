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
for (const path of ["node.exe", "app/server.js", "app/node_modules/prisma/build/index.js", "postgres/bin/initdb.exe", "postgres/bin/pg_ctl.exe", "postgres/bin/postgres.exe"]) {
  if (!existsSync(resolve(resourceDir, path))) throw new Error("Recurso nativo ausente: " + path);
}
const configPath = resolve("src-tauri/tauri.native.generated.conf.json");
const config = {
  productName,
  identifier,
  app: { windows: [{ label: "main", title: productName, width: 1360, height: 900, minWidth: 980, minHeight: 680, visible: false, url: "http://127.0.0.1:3000/" }] },
  bundle: {
    resources: ["../resources/native"],
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
