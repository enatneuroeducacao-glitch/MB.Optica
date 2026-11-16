const express = require('express');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
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
  <button type="submit">Validar e restaurar no banco temporário</button></form>\n  <form method="post" action="/audit"><label>Auditoria somente leitura</label><input name="token" type="password" required autocomplete="off"><button type="submit">Consultar dados restaurados</button></form>\n  <form method="post" action="/compare"><label>Comparação com Neon isolado</label><input name="token" type="password" required autocomplete="off"><button type="submit">Comparar registros por identificador</button></form>\n  <form method="post" action="/compare-business"><label>Comparação por chaves de negócio</label><input name="token" type="password" required autocomplete="off"><button type="submit">Validar números, códigos e chaves naturais</button></form>\n  <form method="post" action="/stage-source"><label>Preparar cópia integral dos dados comerciais no Neon de homologação</label><input name="token" type="password" required autocomplete="off"><button type="submit">Copiar dados para staging isolado</button></form>\n  <form method="post" action="/compare-detail"><label>Validação de conteúdo e integridade referencial</label><input name="token" type="password" required autocomplete="off"><button type="submit">Executar validação detalhada</button></form>
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

app.post('/compare', express.urlencoded({extended:false}), async (req,res) => {
  let source, target;
  try {
    if (!authorized(req)) return res.status(401).type('html').send(page('Token inválido para comparação.'));
    const targetUrl = process.env.NEON_TEST_DATABASE_URL || '';
    if (!DATABASE_URL.includes(TARGET_NAME) || !targetUrl.includes('ep-delicate-wildflower-b6r4m9uw')) return res.status(403).type('html').send(page('Bloqueado: origem/destino não correspondem aos bancos temporários de recuperação.'));
    source = new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:2});
    target = new Pool({connectionString:targetUrl,ssl:{rejectUnauthorized:false},max:2});
    const sourceTables = await source.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name");
    const targetTables = await target.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
    const targetNames = new Set(targetTables.rows.map(r=>r.table_name));
    const out = ['TABELA | RENDER | NEON TESTE | REGISTROS NO RENDER AUSENTES NO NEON'];
    for (const row of sourceTables.rows) {
      const t = row.table_name;
      if (!targetNames.has(t)) { out.push(t+' | tabela ausente no Neon teste | — | —'); continue; }
      const [sc,tc] = await Promise.all([
        source.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='id'",[t]),
        target.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='id'",[t])
      ]);
      if (!sc.rowCount || !tc.rowCount) { out.push(t+' | chave não é id simples | — | não comparada'); continue; }
      const [sr,tr] = await Promise.all([
        source.query('SELECT id::text AS id FROM public.'+ '"' + t.replace(/"/g,'""') + '"'),
        target.query('SELECT id::text AS id FROM public.'+ '"' + t.replace(/"/g,'""') + '"')
      ]);
      const ids = new Set(tr.rows.map(x=>x.id));
      const missing = sr.rows.filter(x=>!ids.has(x.id)).length;
      out.push(t+' | '+sr.rowCount+' | '+tr.rowCount+' | '+missing);
    }
    res.type('html').send(page('COMPARAÇÃO SOMENTE LEITURA — RENDER RECUPERADO x NEON TESTE\\n'+out.join('\\n')+'\\n\\nNenhuma tabela de negócio foi alterada. Destino: branch isolada '+(process.env.NEON_TEST_BRANCH_ID||'Neon teste')+'.'));
  } catch(e) { res.status(500).type('html').send(page('Falha na comparação: '+e.message)); }
  finally { if(source) await source.end(); if(target) await target.end(); }
});
app.post('/compare-business', express.urlencoded({extended:false}), async (req,res) => {
 let source,target;
 try {
  if(!authorized(req)) return res.status(401).type('html').send(page('Token inválido.'));
  const targetUrl=process.env.NEON_TEST_DATABASE_URL||'';
  if(!DATABASE_URL.includes(TARGET_NAME)||!targetUrl.includes('ep-delicate-wildflower-b6r4m9uw')) return res.status(403).type('html').send(page('Destino de teste não validado.'));
  source=new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:2});
  target=new Pool({connectionString:targetUrl,ssl:{rejectUnauthorized:false},max:2});
  const checks=[['Sale','number::text'],['OpticalOrder','number::text'],['Quote','number::text'],['Product','code'],['Customer','"cpfCnpj"'],['PaymentMethod','name'],['Supplier','name'],['Category','name']];
  const out=['TABELA | CHAVE DE NEGÓCIO | RENDER | NEON TESTE | CHAVES DO RENDER NÃO ENCONTRADAS NO NEON'];
  for(const [table,keyExpr] of checks){
   const exists=await Promise.all([source,target].map(p=>p.query("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1) AS ok",[table])));
   if(!exists[0].rows[0].ok||!exists[1].rows[0].ok){out.push(table+' | '+keyExpr+' | tabela ausente | — | —');continue;}
   const q='SELECT '+keyExpr+' AS k FROM "'+table+'" WHERE '+keyExpr+' IS NOT NULL';
   const [a,b]=await Promise.all([source.query(q),target.query(q)]);
   const targetKeys=new Set(b.rows.map(r=>String(r.k)));
   const missing=a.rows.filter(r=>!targetKeys.has(String(r.k))).length;
   out.push(table+' | '+keyExpr+' | '+a.rowCount+' | '+b.rowCount+' | '+missing);
  }
  const salesDetail=await source.query("SELECT s.number::text AS number, s.total::text AS total, s.canceled, to_char(s.\"createdAt\" AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY') AS date FROM \"Sale\" s WHERE s.\"createdAt\">=TIMESTAMP '2026-11-01' AND s.\"createdAt\"<TIMESTAMP '2026-12-01' ORDER BY s.number");
  out.push('VENDAS DE NOVEMBRO | número | valor | status | data');
  for(const r of salesDetail.rows) out.push([r.number,r.total,r.canceled?'CANCELADA':'VALIDA',r.date].join(' | '));
  res.type('html').send(page('COMPARAÇÃO POR CHAVES DE NEGÓCIO — SOMENTE LEITURA\\n'+out.join('\\n')+'\\n\\nAviso: CPF/CNPJ nulo não identifica cliente; pagamentos, itens e estoque ainda exigem conciliação relacional. Nenhuma escrita executada.'));
 }catch(e){res.status(500).type('html').send(page('Falha na comparação por chaves: '+e.message));}
 finally{if(source)await source.end();if(target)await target.end();}
});
app.post('/compare-detail', express.urlencoded({extended:false}), async (req,res) => {
 let source,target;
 try {
  if(!authorized(req)) return res.status(401).type('html').send(page('Token inválido.'));
  const targetUrl=process.env.NEON_TEST_DATABASE_URL||'';
  if(!DATABASE_URL.includes(TARGET_NAME)||!targetUrl.includes('ep-delicate-wildflower-b6r4m9uw')) return res.status(403).type('html').send(page('Destino de teste não validado.'));
  source=new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:2});
  target=new Pool({connectionString:targetUrl,ssl:{rejectUnauthorized:false},max:2});
  const checks=[['Sale','number'],['OpticalOrder','number'],['Quote','number'],['Product','code'],['Supplier','name'],['Category','name'],['PaymentMethod','name']];
  const out=['CHAVE | AUSENTES NO NEON TESTE | COLISÕES COM CONTEÚDO DIFERENTE'];
  for(const [table,key] of checks){
   const has=await Promise.all([source,target].map(p=>p.query("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2) AS ok",[table,key])));
   if(!has[0].rows[0].ok||!has[1].rows[0].ok){out.push(table+' | coluna indisponível | —');continue;}
   const q='SELECT "'+key+'"::text AS k, to_jsonb(t) - \'id\' AS payload FROM "'+table+'" t WHERE "'+key+'" IS NOT NULL';
   const [a,b]=await Promise.all([source.query(q),target.query(q)]);
   const map=new Map(b.rows.map(r=>[r.k,JSON.stringify(r.payload)]));
   const missing=a.rows.filter(r=>!map.has(r.k));
   const changed=a.rows.filter(r=>map.has(r.k)&&map.get(r.k)!==JSON.stringify(r.payload)).length;
   out.push(table+' ('+key+') | '+missing.length+' | '+changed);
  }
  const fkSql=`SELECT child.relname AS child, con.conname, parent.relname AS parent,
    json_agg(ca.attname ORDER BY ck.ord) AS child_cols, json_agg(pa.attname ORDER BY ck.ord) AS parent_cols
    FROM pg_constraint con
    JOIN pg_class child ON child.oid=con.conrelid
    JOIN pg_namespace ns ON ns.oid=child.relnamespace
    JOIN pg_class parent ON parent.oid=con.confrelid
    JOIN LATERAL unnest(con.conkey) WITH ORDINALITY ck(attnum,ord) ON true
    JOIN LATERAL unnest(con.confkey) WITH ORDINALITY pk(attnum,ord) ON pk.ord=ck.ord
    JOIN pg_attribute ca ON ca.attrelid=child.oid AND ca.attnum=ck.attnum
    JOIN pg_attribute pa ON pa.attrelid=parent.oid AND pa.attnum=pk.attnum
    WHERE con.contype='f' AND ns.nspname='public'
    GROUP BY child.relname,con.conname,parent.relname ORDER BY child.relname,con.conname`;
  const [sf,tf]=await Promise.all([source.query(fkSql),target.query(fkSql)]);
  out.push(''); out.push('INTEGRIDADE REFERENCIAL — referências órfãs (contagem real)');
  const qi=x=>'"'+String(x).replace(/"/g,'""')+'"';
  async function orphanCount(pool,f){
   const cols=f.child_cols.map(qi), pcols=f.parent_cols.map(qi);
   const join=cols.map((x,i)=>'p.'+pcols[i]+' = c.'+x).join(' AND ');
   const notnull=cols.map(x=>'c.'+x+' IS NOT NULL').join(' AND ');
   const sql='SELECT COUNT(*)::text AS n FROM public.'+qi(f.child)+' c WHERE '+notnull+' AND NOT EXISTS (SELECT 1 FROM public.'+qi(f.parent)+' p WHERE '+join+')';
   const r=await pool.query(sql); return r.rows[0].n;
  }
  for(const f of sf.rows){ const r=await orphanCount(source,f); out.push('RENDER '+f.child+'.'+f.conname+' -> '+f.parent+' | '+r); }
  for(const f of tf.rows){ const r=await orphanCount(target,f); out.push('NEON '+f.child+'.'+f.conname+' -> '+f.parent+' | '+r); }
  res.type('html').send(page('VALIDAÇÃO DETALHADA — SOMENTE LEITURA\\n'+out.join('\\n')+'\\n\\nComparação por chaves e conteúdo; nenhum registro foi alterado. A auditoria não exibe dados pessoais.'));
 }catch(e){res.status(500).type('html').send(page('Falha na validação detalhada: '+e.message));}
 finally{if(source)await source.end();if(target)await target.end();}
});

const STAGE_TABLES = [
  'FiscalConfig','FiscalDocument','Organization','OrganizationMembership','Subscription',
  'Customer','Address','Prescription','Category','Supplier','Product','StockLot',
  'StockMovement','StockMovementLot','Quote','QuoteItem','OpticalOrder','OpticalOrderItem',
  'OrderEvent','Sale','SaleItem','PaymentMethod','CardMachine','PixKey','Payment','Account',
  'AccountSettlement','CashSession','CashMovement','PayrollSettings','PayrollRecord',
  'StoreSettings','Appointment','BirthdayReminder','ServiceOrderSequence','AccountingSettings',
  'ChartOfAccount','AccountingPeriod','AccountingEntry','AccountingEntryLine','AccountingMapping',
  'AccountingEvent','ThirdPartyFrameIntake','FrameAdaptationOrder'
];
app.post('/stage-source', express.urlencoded({extended:false}), async (req,res) => {
  let source, target;
  const snapshotId = crypto.randomUUID();
  try {
    if (!authorized(req)) return res.status(401).type('html').send(page('Token inválido para preparação de dados.'));
    const targetUrl = process.env.NEON_TEST_DATABASE_URL || '';
    const expectedBranch = process.env.NEON_TEST_BRANCH_ID || '';
    if (!DATABASE_URL || !DATABASE_URL.includes(TARGET_NAME)) return res.status(403).type('html').send(page('Origem bloqueada: o banco contingencial autorizado não foi identificado.'));
    if (!targetUrl.includes('ep-delicate-wildflower-b6r4m9uw') || expectedBranch !== 'br-noisy-hall-b6857yom') return res.status(403).type('html').send(page('Destino bloqueado: somente a branch Neon de homologação previamente definida pode receber a cópia.'));
    source = new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:2});
    target = new Pool({connectionString:targetUrl,ssl:{rejectUnauthorized:false},max:2});
    const sourceDb = await source.query('SELECT current_database() AS db');
    const targetDb = await target.query('SELECT current_database() AS db');
    if (sourceDb.rows[0].db !== 'mb_optica_db_contingencia' || targetDb.rows[0].db !== 'neondb') throw new Error('Identidade não confere. Banco de origem detectado: '+sourceDb.rows[0].db+' (esperado: mb_optica_db_contingencia); banco de destino detectado: '+targetDb.rows[0].db+' (esperado: neondb). Nenhum registro foi copiado.');
    await target.query('CREATE SCHEMA IF NOT EXISTS recovery');
    await target.query(`CREATE TABLE IF NOT EXISTS recovery.source_rows (
      snapshot_id uuid NOT NULL, source_table text NOT NULL, source_id text NOT NULL,
      payload jsonb NOT NULL, captured_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(snapshot_id, source_table, source_id)
    )`);
    const existing = await source.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
    const available = new Set(existing.rows.map(r=>r.table_name));
    const results = [];
    for (const table of STAGE_TABLES) {
      if (!available.has(table)) { results.push({table, count:0, skipped:'not_present'}); continue; }
      const rows = await source.query('SELECT to_jsonb(t) AS payload FROM public.' + '"' + table.replace(/"/g,'""') + '" t');
      for (let i=0; i<rows.rows.length; i+=100) {
        const batch = rows.rows.slice(i,i+100);
        const values = [], params = [];
        for (const item of batch) {
          const payload = item.payload;
          const id = payload.id == null ? crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex') : String(payload.id);
          const n = params.length;
          params.push(snapshotId, table, id, JSON.stringify(payload));
          values.push('($'+(n+1)+'::uuid,$'+(n+2)+'::text,$'+(n+3)+'::text,$'+(n+4)+'::jsonb)');
        }
        if (values.length) await target.query(
          'INSERT INTO recovery.source_rows(snapshot_id,source_table,source_id,payload) VALUES '+values.join(','),
          params
        );
      }
      results.push({table,count:rows.rowCount});
    }
    const total = results.reduce((n,r)=>n+r.count,0);
    const verify = await target.query('SELECT source_table, count(*)::int AS count FROM recovery.source_rows WHERE snapshot_id=$1 GROUP BY source_table ORDER BY source_table',[snapshotId]);
    const verifiedTotal = verify.rows.reduce((n,r)=>n+r.count,0);
    if (verifiedTotal !== total) throw new Error('A verificação pós-cópia não confere: origem '+total+', destino '+verifiedTotal+'. Snapshot preservado para investigação.');
    const report = ['CÓPIA DE PREPARAÇÃO CONCLUÍDA — NÃO APLICADA ÀS TABELAS DO SISTEMA','Snapshot: '+snapshotId,'Origem: banco contingencial Render','Destino: branch Neon de homologação','Total de registros copiados: '+verifiedTotal,'','TABELA | REGISTROS',...verify.rows.map(r=>r.source_table+' | '+r.count),'','Foram excluídas tabelas de autenticação, usuários, tokens, sessões, preferências de contato e auditoria. Os dados foram guardados como JSONB em recovery.source_rows para conciliação, sem sobrescrever tabelas operacionais.'];
    res.type('html').send(page(report.join('\n')));
  } catch(e) {
    res.status(500).type('html').send(page('Falha na preparação: '+e.message+'\nSnapshot: '+snapshotId));
  } finally {
    if(source) await source.end();
    if(target) await target.end();
  }
});

app.listen(PORT,'0.0.0.0',()=>console.log('Recovery console listening on '+PORT));
