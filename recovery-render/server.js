const express = require('express');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const app = express();
const PORT = Number(process.env.PORT || 10000);
const TOKEN = process.env.RESTORE_TOKEN || '';
const DATABASE_URL = process.env.DATABASE_URL || '';
const TARGET_NAME = process.env.RESTORE_TARGET_NAME || 'mb_optica_recuperacao_temporaria';
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 100 * 1024 * 1024, files: 1 } });

function authorized(req) {
  const supplied = req.get('x-restore-token') || req.body?.token || '';
  if (!TOKEN || !supplied) return false;
  const a = Buffer.from(String(supplied));
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function run(cmd, args, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: process.env });
    let out = '', err = '';
    child.stdout.on('data', d => out += d.toString());
    child.stderr.on('data', d => err += d.toString());
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve({ out, err });
      else reject(new Error((err || out || 'Process failed').slice(-5000)));
    });
  });
}
function page(message = '') {
  return `<!doctype html><html lang="pt-br"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MB Óptica — Recuperação isolada</title>
  <style>body{font:16px system-ui;background:#f4f6f8;color:#17202a;margin:0;padding:28px}main{max-width:680px;margin:auto;background:white;padding:28px;border-radius:14px;box-shadow:0 4px 24px #0001}h1{font-size:24px}label{display:block;margin:16px 0 6px}input{width:100%;padding:12px;box-sizing:border-box}button{padding:12px 18px;background:#1456a0;color:white;border:0;border-radius:8px;margin-top:18px}small{color:#5b6570}.warn{background:#fff5df;padding:12px;border-radius:8px}.msg{white-space:pre-wrap;background:#eef5ee;padding:12px;border-radius:8px}</style>
  <main><h1>MB Óptica — Recuperação de dados</h1>
  <p>Ferramenta temporária para restaurar o arquivo Recovery em um banco PostgreSQL isolado.</p>
  <p class="warn"><b>Proteção:</b> o destino configurado é exclusivamente <b>${TARGET_NAME}</b>. Não use credenciais do Neon de produção nem do banco contingencial.</p>
  ${message ? '<div class="msg">'+message.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</div>' : ''}
  <form method="post" action="/restore" enctype="multipart/form-data">
  <label>Token de acesso</label><input name="token" type="password" required autocomplete="off">
  <label>Arquivo Recovery (.tar.gz)</label><input name="backup" type="file" accept=".gz,.tar.gz" required>
  <p><small>Limite de 100 MB. O arquivo será validado antes da restauração. A operação altera somente o banco temporário configurado.</small></p>
  <button type="submit">Validar e restaurar no banco temporário</button></form>\n  <form method="post" action="/audit"><label>Auditoria somente leitura</label><input name="token" type="password" required autocomplete="off"><button type="submit">Consultar dados restaurados</button></form>
  <p><small>Health: <a href="/health">/health</a></small></p></main></html>`;
}
app.get('/health', (req,res) => res.json({ ok: true, configured: !!TOKEN && !!DATABASE_URL && DATABASE_URL !== 'SET_IN_RENDER_DASHBOARD', target: TARGET_NAME }));
app.get('/', (req,res) => res.type('html').send(page()));
app.post('/restore', upload.single('backup'), async (req,res) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-recovery-'));
  try {
    if (!authorized(req)) return res.status(401).type('html').send(page('Token inválido.'));
    if (!DATABASE_URL || DATABASE_URL === 'SET_IN_RENDER_DASHBOARD') return res.status(503).type('html').send(page('Configuração pendente: adicione a Internal Database URL do banco temporário na variável DATABASE_URL do serviço Render.'));
    if (!req.file) return res.status(400).type('html').send(page('Selecione o arquivo Recovery.'));
    if (!DATABASE_URL.includes(TARGET_NAME)) return res.status(403).type('html').send(page('Bloqueado: a URL de destino não corresponde ao banco temporário autorizado.'));
    const listing = await run('tar', ['-tzf', req.file.path]);
    const entries = listing.out.split('\n').filter(Boolean);
    if (!entries.length || entries.some(e => e.startsWith('/') || e.split('/').includes('..'))) throw new Error('Estrutura TAR inválida ou caminho inseguro.');
    await run('tar', ['-xzf', req.file.path, '-C', temp]);
    let archiveDir = null;
    function findToc(dir, depth=0) {
      if (depth > 5) return null;
      if (fs.existsSync(path.join(dir,'toc.dat'))) return dir;
      for (const ent of fs.readdirSync(dir,{withFileTypes:true})) if(ent.isDirectory()) {
        const found=findToc(path.join(dir,ent.name),depth+1); if(found) return found;
      }
      return null;
    }
    archiveDir = findToc(temp);
    if (!archiveDir) throw new Error('toc.dat não encontrado: o arquivo não parece ser um backup em formato directory do pg_dump.');
    const check = await run('pg_restore', ['--list', archiveDir]);
    const tables = (check.out.match(/TABLE DATA/g) || []).length;
    if (tables < 1) throw new Error('O índice não contém entradas TABLE DATA; restauração cancelada.');
    await run('pg_restore', ['--exit-on-error','--no-owner','--no-privileges','--dbname',DATABASE_URL,archiveDir], 20*60*1000);
    const query = await run('psql', [DATABASE_URL, '-X','-A','-F',',','-c', "SELECT current_database(), count(*) FROM information_schema.tables WHERE table_schema='public';"]);
    res.type('html').send(page('Restauração concluída.\nEntradas TABLE DATA no índice: '+tables+'\nVerificação do banco: '+query.out+'\n\nGuarde o backup original. Próximo passo: auditoria das vendas e pagamentos.'));
  } catch (e) {
    res.status(500).type('html').send(page('Falha na validação/restauração: '+e.message));
  } finally {
    if (req.file?.path) fs.rmSync(req.file.path,{force:true});
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
app.post('/audit', express.urlencoded({extended:false}), async (req,res) => {
  try {
    if (!authorized(req)) return res.status(401).type('html').send(page('Token inválido para auditoria.'));
    if (!DATABASE_URL || DATABASE_URL === 'SET_IN_RENDER_DASHBOARD' || !DATABASE_URL.includes(TARGET_NAME)) return res.status(503).type('html').send(page('Banco temporário não configurado corretamente.'));
    const sql = `SELECT 'sales' AS section, COUNT(*)::text AS record_count, COALESCE(SUM(total) FILTER (WHERE canceled = false),0)::numeric(14,2)::text AS valid_total, COALESCE(SUM(total) FILTER (WHERE canceled = false AND "createdAt" >= TIMESTAMP '2026-11-01' AND "createdAt" < TIMESTAMP '2026-12-01'),0)::numeric(14,2)::text AS november_total, COUNT(*) FILTER (WHERE canceled = false AND "createdAt" >= TIMESTAMP '2026-11-01' AND "createdAt" < TIMESTAMP '2026-12-01')::text AS november_count, MAX("createdAt")::text AS latest_sale FROM "Sale" UNION ALL SELECT 'customers', COUNT(*)::text, '', '', '', '' FROM "Customer" UNION ALL SELECT 'products', COUNT(*)::text, '', '', '', '' FROM "Product" UNION ALL SELECT 'payments', COUNT(*)::text, '', '', '', '' FROM "Payment" UNION ALL SELECT 'stock_movements', COUNT(*)::text, '', '', '', '' FROM "StockMovement";`;
    const q = await run('psql', [DATABASE_URL,'-X','-A','-F',' | ','-c',sql]);
    const detailSql = `SELECT s.number, to_char(s."createdAt" AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') AS sale_date, s.total::text, CASE WHEN s.canceled THEN 'CANCELADA' ELSE 'VALIDA' END AS status, COALESCE(SUM(p.amount) FILTER (WHERE p."reversedAt" IS NULL),0)::numeric(14,2)::text AS paid_total, COUNT(p.id)::text AS payment_count FROM "Sale" s LEFT JOIN "Payment" p ON p."saleId"=s.id WHERE s."createdAt" >= TIMESTAMP '2026-11-01' AND s."createdAt" < TIMESTAMP '2026-12-01' GROUP BY s.id ORDER BY s."createdAt",s.number;`;
    const detail = await run('psql',[DATABASE_URL,'-X','-A','-F',' | ','-c',detailSql]);
    res.type('html').send(page('AUDITORIA SOMENTE LEITURA\n'+q.out+'\n\nDETALHE DAS VENDAS DE NOVEMBRO (sem dados pessoais)\n'+detail.out+'\n\nNenhum dado foi alterado. Pagamentos somados sem reversões.'));
  } catch(e) { res.status(500).type('html').send(page('Falha na auditoria: '+e.message)); }
});
app.listen(PORT,'0.0.0.0',()=>console.log('Recovery console listening on '+PORT));
