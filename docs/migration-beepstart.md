# Migração BeepStart → MB Óptica

## Fonte auditada

O backup histórico analisado foi `Backup - 2026-09-25_03h.db`, tratado como **JSON estruturado** e contendo **5.785 registros em 30 coleções**.

Contagens de referência já auditadas:

- Cliente: 470
- Produto: 617
- Venda: 474
- Lote: 1.479
- Movimentacao: 629
- Ordem: 9
- Total: 5.785

## Arquitetura da Fase 2

### 1. Importador definitivo

`scripts/import-beepstart.ts`

O importador:

- calcula SHA-256 do arquivo de origem;
- exige 5.785 registros por padrão;
- valida referências antes de gravar;
- rejeita chaves legadas duplicadas;
- não sobrescreve dados atuais;
- consolida clientes/produtos/fornecedores/categorias quando já existem;
- cria registros legados inativos para vendedores do BeepStart quando necessário;
- importa clientes, endereços, categorias, fornecedores, usuários legados, meios de pagamento, produtos, ordens, vendas, itens, pagamentos, contas, lotes e movimentações;
- preserva **todas as coleções**, inclusive as que ainda não possuem modelo operacional no MB Óptica, em `LegacyRecord`.

### 2. Importação transacional

Toda a escrita da migração é executada em uma única transação interativa do Prisma.

Se qualquer etapa crítica falhar, a transação é revertida e o `MigrationRun` fica como `FAILED`. O legado não fica parcialmente gravado.

### 3. Idempotência

Cada registro recebe:

`BEEPSTART:<coleção>:<id>`

e `LegacyRecord.legacyKey` é único.

O arquivo também recebe uma impressão SHA-256. Uma execução já concluída com a mesma impressão não é executada novamente.

### 4. Reconciliação

`scripts/reconcile-beepstart.ts`

A reconciliação verifica:

- total da fonte;
- total preservado em `LegacyRecord`;
- contagem por coleção;
- registros sem legado;
- chaves duplicadas;
- registros mapeados para entidades operacionais;
- vendas e ordens realmente encontradas no destino;
- divergências de consolidação de clientes/produtos.

Pode gerar relatório:

`npm run reconcile:beepstart -- ./backup.json --out=./beepstart-reconciliation.json`

### 5. Preservação do legado

Nenhum registro da fonte é descartado durante a migração.

Mesmo quando uma coleção ainda não possui correspondência operacional no MB Óptica, seu conteúdo fica preservado em `LegacyRecord.payload`, associado à coleção e ao identificador original.

## Execução segura

Primeiro:

`npm run migration:beepstart -- ./backup.json --dry-run`

Depois, somente após a validação:

`npm run migration:beepstart -- ./backup.json`

Se uma nova auditoria confirmar que o backup possui outra quantidade de registros, a proteção pode ser explicitamente liberada:

`npm run migration:beepstart -- ./backup.json --allow-count-change`

**A importação real não deve ser executada em produção até o relatório de divergências da prévia estar limpo.**
