# Operação segura — banco e backup

## Objetivo

Preservar os Clientes e Produtos que já existem no MB Óptica antes de qualquer novo backup BeepStart.

## Regra principal

Nunca executar a reconciliação incremental antes de confirmar o banco operacional correto e obter um backup local dos dados atuais.

## 1. Identificar o banco

Configure no ambiente de execução uma variável chamada:

`MB_OPTICA_DATABASE_URL`

Ela deve apontar para o mesmo PostgreSQL utilizado pela aplicação em produção.

Não colocar a URL, usuário ou senha neste arquivo ou no repositório.

## 2. Preflight

Executar manualmente o workflow:

`.github/workflows/operational-preflight.yml`

O resultado mostra somente contagens:

- clientes totais;
- clientes ativos;
- produtos totais;
- produtos ativos;
- execuções de migração.

O objetivo é comparar essas contagens com o MB Óptica atual.

## 3. Backup operacional

Depois de confirmar que o banco é o correto, executar:

`ALLOW_OPERATIONAL_BACKUP=1 npm run backup:operational`

O backup contém somente os registros operacionais de Cliente e Produto.

Os arquivos ficam em `backups/`, que está no `.gitignore`.

**Nunca fazer commit de um backup operacional.**

## 4. Novo backup BeepStart

Somente depois da preservação do estado atual:

1. abrir Central de Legado;
2. preparar o novo backup;
3. conferir a quantidade de registros;
4. confirmar a reconciliação;
5. analisar o relatório.

A reconciliação é idempotente por fingerprint do backup e utiliza chaves de correspondência para evitar duplicação.

## 5. O que pode entrar operacionalmente

Somente:

- Cliente;
- Produto.

As demais coleções permanecem como legado/histórico.

## 6. O que não deve acontecer

- apagar Cliente existente;
- apagar Produto existente;
- substituir cadastro existente em massa;
- recriar o banco;
- executar `prisma db push` em produção;
- versionar dados reais no GitHub;
- executar o backup BeepStart diretamente no banco sem passar pela reconciliação.

## Estado atual

A branch `github-first` contém a infraestrutura preparada, mas permanece separada da `main`.

Nenhum backup real foi executado por este fluxo e nenhum dado operacional foi alterado por esta etapa.
