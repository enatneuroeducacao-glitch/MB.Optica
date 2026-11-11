# Estratégia de escopo por organização — MB Gestão

Status: planejamento técnico; não altera schema nem dados.

## Princípio obrigatório

Todo dado pertencente a uma ótica deve ser filtrado no servidor por `organizationId` derivado de membership persistido. Um ID enviado pelo navegador nunca prova que um registro pertence ao tenant. Em relações entre registros, validar que pai e filho pertencem à mesma organização. Não confiar apenas em filtros na interface.

A identidade `User` permanece global para permitir que uma pessoa trabalhe em mais de uma ótica. A autorização operacional vem de `OrganizationMembership`; acesso central vem separadamente de `PlatformAccess`.

## Classificação dos modelos

### Identidade e plataforma — não são dados operacionais de uma ótica
- `User`: identidade global; e-mail único global. Papéis empresariais devem vir do membership, não do campo global `role`.
- `PasswordResetToken`: vinculado à identidade global.
- `Organization`, `OrganizationMembership`, `PlatformAccess`: núcleo de tenancy e controle central.
- `Subscription`: deve ser vinculada a uma única organização; remover a dependência operacional de `findFirst()` global. A assinatura legada precisa ser atribuída no backfill.

### Raízes operacionais — adicionar `organizationId` obrigatório após backfill
- Clientes e relacionamento: `Customer`.
- Catálogo e estoque: `Category`, `Supplier`, `Product`.
- Comercial: `Quote`, `OpticalOrder`, `Sale`.
- Financeiro e caixa: `Account`, `CashSession`.
- Fiscal: `FiscalConfig`.
- Contabilidade: `AccountingSettings`, `ChartOfAccount`, `AccountingPeriod`, `AccountingEntry`, `AccountingMapping`.
- Gestão e configuração: `PayrollSettings`, `StoreSettings`.
- Operação e serviços: `Appointment`, `BirthdayReminder`, `ServiceOrderSequence`, `ThirdPartyFrameIntake`, `FrameAdaptationOrder`.
- Migração e auditoria: `MigrationRun`, `LegacyRecord`, `AuditLog`.
- Catálogos configuráveis por ótica: `PaymentMethod`, `CardMachine`, `PixKey`.

### Dependentes — escopo próprio recomendado para integridade e consultas seguras
- Clientes: `Address`, `Prescription`.
- Estoque: `StockLot`, `StockMovement`, `StockMovementLot`.
- Orçamentos: `QuoteItem`.
- Pedidos: `OpticalOrderItem`, `OrderEvent`.
- Vendas: `SaleItem`, `Payment`.
- Financeiro: `AccountSettlement`, `CashMovement`.
- Mensagens: `MailMessageState`, `MailContactPreference` (escopo por usuário; manter vínculo à identidade e validar membership ativo quando usado dentro da ótica).
- Folha: `PayrollRecord`.
- Fiscal: `FiscalDocument`.
- Contabilidade: `AccountingEntryLine`, `AccountingEvent`.

## Relações que exigem validação de pertencimento

Não basta adicionar `organizationId` a uma tabela raiz. Antes de criar/atualizar relações, validar no banco que todos os IDs referenciados pertencem ao mesmo tenant:
- `Address`, `Prescription`, `Appointment`, `BirthdayReminder` e `ThirdPartyFrameIntake` → `Customer`.
- `Product` → `Category` e `Supplier`; `StockLot` e `StockMovement` → `Product`; `StockMovementLot` → lote e movimento da mesma organização.
- `Quote` → cliente, receita e vendedor; `QuoteItem` → orçamento e produto.
- `OpticalOrder` → cliente, receita, vendedor e orçamento; itens/eventos → pedido; itens → produto.
- `Sale` → cliente, vendedor e pedido; `SaleItem` → venda e produto; `Payment` → venda, método e máquina.
- `Account` → cliente, fornecedor e venda; `AccountSettlement` → conta, método e máquina; movimentos → sessão de caixa.
- `FiscalDocument` → configuração fiscal e venda.
- Contabilidade: períodos, lançamentos, linhas, plano de contas, mapeamentos e eventos devem permanecer no mesmo tenant; validar referências de origem antes de contabilizar.
- `FrameAdaptationOrder` → venda, cliente e receita.
- `LegacyRecord` → cliente e execução de migração do mesmo tenant.
- `AuditLog` deve registrar organização e usuário quando a ação for empresarial; logs centrais devem ser explicitamente classificados como plataforma.

## Unicidade e sequências

Índices globais atuais como `Customer.cpfCnpj`, `Product.code`, `Product.barcode`, `Category.name`, `Quote.number`, `OpticalOrder.number`, `Sale.number`, `FrameAdaptationOrder.number`, `ChartOfAccount.code`, `PaymentMethod.name`, `CardMachine.name`, `PixKey.key` e chaves de origem/idempotência precisam ser revisados. Para dados empresariais, preferir unicidade composta com `organizationId`, por exemplo `@@unique([organizationId, code])`. Sequências devem ser por organização e tipo documental, nunca compartilhadas acidentalmente entre óticas.

Não remover constraints globais antes de medir duplicidades existentes e preparar migração compatível.

## Ordem segura de migração

1. Backup completo e teste real de restauração em banco separado.
2. Confirmar banco de produção por conexão autenticada e registrar contagens/IDs por tabela.
3. Criar a organização MB Óptica e membership do administrador confirmado, em transação revisável; só depois atribuir PlatformAccess OWNER com confirmação explícita.
4. Adicionar colunas inicialmente nullable e índices sem destruir constraints legadas.
5. Backfill de raízes e dependentes usando o mapeamento da MB Óptica; validar zero registros órfãos e zero vínculos cruzados.
6. Aplicar NOT NULL e constraints compostas por fases, depois atualizar Prisma.
7. Migrar rotas, jobs, relatórios e integrações por domínio; cada operação deve exigir contexto resolvido no servidor.
8. Atualizar autenticação e assinatura por organização somente quando backfill e cobertura de APIs estiverem prontos.
9. Testar com duas organizações fictícias e usuários separados, incluindo tentativas de leitura, escrita, alteração, exclusão e nested writes cruzados.
10. Só então habilitar convite/cadastro de novas óticas.

## Testes negativos obrigatórios

- Usuário da ótica A tenta consultar ID de cliente, produto, venda, conta, documento fiscal e lançamento da ótica B.
- Usuário A envia IDs de relações pertencentes a B em POST/PUT/PATCH e nested writes.
- Alterar `organizationId` no corpo, query string, header ou cookie não muda o escopo autorizado.
- Relatórios, dashboard, exportações, contabilidade, busca global e contagens não agregam dados de outra ótica.
- Usuário ADMIN de uma ótica não obtém ações OWNER/SUPER_ADMIN.
- Membership suspenso/removido e organização suspensa perdem acesso imediatamente.
- Job agendado, fila, webhook, importação e rotinas de reconciliação executam com tenant explícito.

## Limites desta entrega

Este documento e `tenant-context.ts` não implementam isolamento por si sós. Nenhum modelo operacional recebeu `organizationId`, nenhum backfill foi executado, nenhuma rota foi alterada e nenhum cadastro público foi ativado. Não executar migration em produção nem publicar esta branch antes de backup restaurável, inventário de APIs e testes de isolamento.

## Fase aditiva 2 — modelos dependentes (11/11/2026)

A branch `feature/tenant-scope-phase2-dependent-models` adiciona `organizationId String?` e índices simples para os 16 modelos dependentes: `Address`, `Prescription`, `StockLot`, `StockMovement`, `StockMovementLot`, `QuoteItem`, `OpticalOrderItem`, `OrderEvent`, `SaleItem`, `Payment`, `AccountSettlement`, `CashMovement`, `PayrollRecord`, `FiscalDocument`, `AccountingEntryLine` e `AccountingEvent`.

Esta fase é estritamente aditiva: colunas nullable, sem backfill, sem NOT NULL, sem alteração de constraints globais e sem mudança de APIs, autenticação ou consultas. `MailMessageState` e `MailContactPreference` permanecem vinculados à identidade do usuário, conforme a estratégia de escopo por usuário.

**Limite de segurança:** a presença da coluna não aplica isolamento. Nenhum tenant adicional pode ser ativado até backfill auditado, validação de relações intra-organização, escopo de todas as rotas/jobs/relatórios e testes negativos entre duas organizações.


## Fase de integridade referencial composta — 11/11/2026

Na branch `feature/tenant-composite-integrity`, o schema foi preparado com chaves candidatas compostas `(id, organizationId)` para 45 modelos que já possuem `organizationId`. Foram identificados e convertidos 51 relacionamentos entre modelos pertencentes a organizações para usar os campos `(foreignKey, organizationId)` apontando para `(id, organizationId)`.

A migration `20261111130000_add_composite_tenant_foreign_keys` cria os índices únicos compostos e as 51 FKs compostas. Relações com `User` e entidades globais da plataforma permanecem fora desse mecanismo; nelas, o servidor deve validar membership e autorização. Relações opcionais com comportamento legado `SetNull` foram alteradas para `Restrict` quando apagar o pai apagaria também o `organizationId` do filho e perderia seu escopo.

### Matriz de relacionamentos protegidos

- Cliente: Address, Prescription, Quote, OpticalOrder, Sale, Account, Appointment, BirthdayReminder, LegacyRecord, ThirdPartyFrameIntake e FrameAdaptationOrder.
- Catálogo/estoque: Product–Category/Supplier; StockLot–Product; StockMovement–Product; StockMovementLot–StockMovement/StockLot.
- Comercial: QuoteItem–Quote/Product; OpticalOrder–Customer/Prescription/Quote; OpticalOrderItem–OpticalOrder/Product; OrderEvent–OpticalOrder; Sale–Customer/OpticalOrder; SaleItem–Sale/Product.
- Financeiro: Payment–Sale/PaymentMethod/CardMachine/AccountSettlement; Account–Customer/Supplier/Sale; AccountSettlement–Account/PaymentMethod/CardMachine; CashMovement–CashSession.
- Fiscal: FiscalDocument–FiscalConfig/Sale.
- Migração: LegacyRecord–Customer/MigrationRun.
- Contabilidade: ChartOfAccount–parent; AccountingEntry–AccountingPeriod; AccountingEntryLine–AccountingEntry/ChartOfAccount; AccountingMapping–PaymentMethod/ChartOfAccount (débito/crédito); AccountingEvent–AccountingEntry.
- Adaptação: FrameAdaptationOrder–Sale/Customer/Prescription.

### Limites importantes

As FKs compostas rejeitam vínculos cruzados quando ambos os registros já têm `organizationId` preenchido. Como a coluna permanece nullable durante a migração, registros com `organizationId = NULL` ainda podem contornar a validação composta. Portanto, esta fase não substitui o backfill auditado, a posterior aplicação de NOT NULL, nem o escopo de APIs, autenticação, jobs e relatórios. Não habilitar novas óticas.

### Testes

- `scripts/validate-tenant-integrity.mjs`: verifica a presença dos 45 índices únicos e das 51 FKs compostas no contrato de migration/schema.
- `prisma/tests/tenant-composite-integrity.sql`: teste PostgreSQL isolado, com duas organizações fictícias; confirma que relação da mesma organização é aceita e relação cruzada é rejeitada.
- O workflow GitHub Actions executa Prisma validate/generate, validação do contrato e teste PostgreSQL. Nenhum banco Render é acessado.
