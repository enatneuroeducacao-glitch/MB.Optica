const http = require("node:http");

const PORT = Number(process.env.PORT || 10000);
const BUILD = process.env.MB_CLOUD_BUILD || "0.1.0";
const STARTED_AT = new Date().toISOString();

function send(res, status, type, body) {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
  });
  res.end(body);
}

function page() {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MB Cloud · Centro de Controle</title>
<style>
:root{color-scheme:dark;--bg:#0b1220;--panel:#121c2e;--line:#29364b;--text:#eef4ff;--muted:#a7b5cc;--accent:#80b8ff}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at top,#172844,var(--bg) 60%);color:var(--text);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1050px;margin:auto;padding:32px 20px 64px}.brand{display:flex;align-items:center;gap:14px}.mark{display:grid;place-items:center;width:52px;height:52px;border:1px solid #486387;border-radius:15px;background:#1c3150;font-size:25px}
h1{font-size:clamp(28px,5vw,42px);margin:0;letter-spacing:-.04em}h2{font-size:18px;margin:0 0 8px}.muted{color:var(--muted)}.intro{max-width:720px;margin:20px 0 26px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}.card{border:1px solid var(--line);background:rgba(18,28,46,.94);border-radius:16px;padding:20px;min-height:150px}.icon{font-size:24px;margin-bottom:10px}.status{display:inline-block;margin-top:12px;padding:4px 9px;border-radius:99px;background:#3a2b17;color:#ffd99b;font-size:12px;font-weight:700}
.banner{margin:18px 0 24px;border:1px solid #42506a;border-radius:14px;padding:16px 18px;background:#111b2d}.banner strong{display:block;margin-bottom:4px}
footer{border-top:1px solid var(--line);margin-top:28px;padding-top:18px;color:var(--muted);font-size:13px}
</style></head><body><main>
<div class="brand"><div class="mark">☁</div><div><div class="muted">MB GESTÃO INTELIGENTE</div><h1>MB Cloud</h1></div></div>
<p class="intro muted">Camada independente de infraestrutura para dados, arquivos, extensões e recuperação de desastres. O objetivo é manter os dados portáteis e restauráveis sem dependência obrigatória do Neon ou Supabase.</p>
<div class="banner"><strong>Fundação criada · configuração operacional pendente</strong><span class="muted">Esta versão é um painel inicial. Não conecta nem altera bancos e ainda não executa backups. O banco, o armazenamento externo e as credenciais precisam ser configurados e testados antes de declarar a proteção ativa.</span></div>
<section class="grid">
<article class="card"><div class="icon">▤</div><h2>Banco independente</h2><p class="muted">PostgreSQL portátil, com credenciais fora do código.</p><span class="status">A configurar</span></article>
<article class="card"><div class="icon">⇧</div><h2>Backups externos</h2><p class="muted">Cópias completas, checksum, histórico e retenção.</p><span class="status">A configurar</span></article>
<article class="card"><div class="icon">↻</div><h2>Restauração</h2><p class="muted">Recuperação isolada e conferência antes de trocar a produção.</p><span class="status">A testar</span></article>
<article class="card"><div class="icon">▦</div><h2>Plugins</h2><p class="muted">Extensões versionadas, com permissões e trilha de auditoria.</p><span class="status">Fase seguinte</span></article>
</section>
<footer>MB Cloud ${BUILD} · Iniciado em ${STARTED_AT} · Painel informativo, sem acesso a dados operacionais.</footer>
</main></body></html>`;
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname;
  if (pathname === "/health" || pathname === "/api/health") {
    return send(res, 200, "application/json; charset=utf-8", JSON.stringify({
      ok: true,
      service: "mb-cloud-control-plane",
      version: BUILD,
      startedAt: STARTED_AT,
      databaseConfigured: Boolean(process.env.MB_CLOUD_DATABASE_URL),
      objectStorageConfigured: Boolean(process.env.S3_ENDPOINT && process.env.S3_BUCKET && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
      backupScheduleConfigured: Boolean(process.env.MB_CLOUD_BACKUP_SCHEDULE)
    }));
  }
  if (req.method !== "GET" || (pathname !== "/" && pathname !== "/index.html")) {
    return send(res, 404, "application/json; charset=utf-8", JSON.stringify({ error: "not_found" }));
  }
  return send(res, 200, "text/html; charset=utf-8", page());
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "mb_cloud_started", port: PORT, version: BUILD }));
});
