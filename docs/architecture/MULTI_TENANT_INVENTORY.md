# Inventário técnico para multi-tenant

Branch de trabalho atual: `feature/tenant-context-rollout` (a PR #151 da fundação inicial já foi integrada à main)

## Escopo encontrado

- 106 arquivos `route.ts` em `src/app/api`.
- 49 modelos Prisma persistentes.
- Autenticação atual usa cookie JWT de 12 horas; o token contém `userId`, `role`, `version` e permissões.
- A sessão recarrega o usuário pelo ID, mas ainda não resolve organização/membership.
- O login localiza usuário por e-mail globalmente (`User.email @unique`).
- As rotas operacionais usam `requireUser`, `requireRole` ou `requirePermission`; esses guardas ainda não aplicam tenant.
- A assinatura atual é global: `getSubscriptionEntitlement()` usa `subscription.findFirst()` e conta usuários globais.
- `MB_OPTICA_OWNER_INSTANCE=true` concede bypass global de assinatura, não representa uma identidade de proprietário central e não deve ser usado como controle de tenancy.

## Domínios de API identificados

| Domínio | Responsabilidade | Risco multi-tenant |
|---|---|---|
| auth / bootstrap / users | identidade, login, criação e gestão de usuários | crítico: membership e papel global ainda inexistentes no fluxo de sessão |
| assinatura / entitlements | planos, módulos, limites e degustação | crítico: assinatura e contagem de usuários são globais |
| customers / prescriptions / appointments / agenda | clientes, receitas, endereços e agenda | alto: dados pessoais podem cruzar empresas |
| products / categories / suppliers / stock | catálogo, fornecedores, lotes e movimentações | crítico: estoque e cadastros devem ser separados por ótica |
| quotes / orders / sales / payments / service-orders | orçamento, pedidos, vendas e recebimentos | crítico: transações e numeração não podem misturar empresas |
| finance / financeiro / cash | contas, liquidações, caixa e movimentos | crítico: risco financeiro e contábil |
| contabilidade / audit | eventos, lançamentos, períodos, mapeamentos e auditoria | crítico: plano de contas, eventos e períodos devem pertencer a cada ótica |
| fiscal | configuração, certificado, documentos e validações fiscais | crítico: credenciais e documentos fiscais precisam de isolamento rigoroso |
| settings / branding / site | identidade visual, configurações e vitrine | alto: cada ótica tem marca, domínio e configurações próprias |
| migration / legacy | importação, reconciliação e dados históricos | crítico: importações devem gravar exclusivamente no tenant autorizado |
| messages | mensagens e contatos | alto: escopo de usuário e organização precisa ser explícito |
| reports / dashboard / gestao | agregações, indicadores e relatórios | crítico: consultas agregadas precisam filtrar organização na origem |
| health / version | saúde técnica e versão | baixo, desde que não exponham dados ou segredos do tenant |

## Modelos Prisma encontrados

FiscalConfig, FiscalDocument, Subscription, User, MailMessageState, MailContactPreference, PasswordResetToken, Customer, Address, Prescription, Category, Supplier, Product, StockLot, StockMovement, StockMovementLot, Quote, QuoteItem, OpticalOrder, OpticalOrderItem, OrderEvent, Sale, SaleItem, PaymentMethod, CardMachine, PixKey, Payment, Account, AccountSettlement, CashSession, CashMovement, AuditLog, MigrationRun, LegacyRecord, PayrollSettings, PayrollRecord, StoreSettings, Appointment, BirthdayReminder, ServiceOrderSequence, AccountingSettings, ChartOfAccount, AccountingPeriod, AccountingEntry, AccountingEntryLine, AccountingMapping, AccountingEvent, ThirdPartyFrameIntake, FrameAdaptationOrder.

## Mudanças aditivas já preparadas nesta branch

- `Organization`: cadastro e status da ótica.
- `OrganizationMembership`: vínculo usuário/ótica com papel empresarial, ativo e permissões.
- `PlatformAccess`: papel central separado dos papéis empresariais (`OWNER`, `SUPER_ADMIN`, `SUPPORT`).
- `Subscription.organizationId`: vínculo opcional e único entre assinatura e organização, preservando a assinatura legada global até o backfill.
- Migration cria tabelas, índices e FKs; não cria organização, não atribui proprietário e não altera registros operacionais existentes.

## O que ainda não está protegido

**Esta etapa não implementa isolamento de dados.** Os 49 modelos de negócio ainda não têm `organizationId`; as rotas ainda não filtram por organização; login e assinatura ainda são globais. A migration é apenas fundação aditiva e não deve ser tratada como pronta para abrir cadastro de novas óticas.

## Implementação incremental — contexto de organização\n\nFoi adicionado nesta branch `src/lib/tenant-context.ts` com `resolveTenantContext(userId, requestedOrganizationId?)`. O helper consulta memberships ativos e organizações ACTIVE, valida qualquer organização solicitada contra o membership, resolve automaticamente quando há apenas um vínculo e exige seleção quando há vários. `PlatformAccess` é consultado separadamente e não substitui membership operacional. O helper ainda não foi conectado aos guardas nem às rotas: isso só deve ocorrer junto ao backfill e à cobertura das APIs, para não bloquear o administrador atual nem criar falsa segurança.\n\nA estratégia de classificação dos 49 modelos, relações, unicidades e sequência de migração está em `docs/architecture/MULTI_TENANT_MODEL_STRATEGY.md`.\n\n## Próximos passos técnicos

1. Implementar resolução de contexto de organização no servidor e sessão com membership validado.
2. Identificar o usuário administrador atual por consulta autenticada ao banco de produção; inserir um único registro `PlatformAccess` após confirmar o ID da conta.
3. Criar a primeira organização MB Óptica e membership ADMIN do usuário atual, em operação de backfill revisável.
4. Adicionar `organizationId` aos modelos raiz e dependentes, respeitando a ordem de FKs e constraints.
5. Atualizar cada rota, job, integração e consulta agregada para aplicar escopo obrigatório.
6. Fazer a assinatura e todos os limites funcionarem por organização.
7. Testar tentativas de leitura e escrita cruzadas em cada domínio antes de liberar novos tenants.

## Critérios mínimos de liberação

- Nenhuma API operacional retorna ou altera registros de outro tenant.
- Nenhuma relação aceita IDs de entidades pertencentes a outra organização.
- Admin de ótica não consegue invocar APIs de proprietário central.
- Platform Owner tem ações globais auditadas e não depende de `UserRole.ADMIN`.
- A MB Óptica mantém contagens e IDs históricos após o backfill.
- Assinaturas, degustação de 60 dias, limites e suspensão são independentes por organização.

## Descoberta de produção — 10/11/2026

O serviço Render publicado `mb-optica-gestao` está executando o commit de `main` e seus logs de inicialização do Prisma identificam o banco Render `mb_optica_db_contingencia` (recurso `dpg-db9p7flg1s2s739hstn0-a`). O recurso está no plano Free e informa expiração em 16/11/2026. A consulta administrativa via conector foi bloqueada porque a allowlist de rede do banco está vazia. A aplicação está acessível publicamente, mas o banco não está acessível pelo conector.

A lista de projetos Neon disponível não identificou um projeto chamado MB Óptica/MB Gestão. Logo, o Neon consultado anteriormente não pode ser assumido como origem dos dados de produção. Não alterar conexão, não migrar e não aplicar backfill sem acesso autenticado, backup restaurável e validação de contagens.

**Bloqueio de segurança:** os novos modelos `Organization`, `OrganizationMembership` e `PlatformAccess` e a coluna opcional `Subscription.organizationId` são somente a fundação. Nenhum dos 49 modelos de operação possui escopo por empresa ainda; as rotas continuam globais. Não existe ainda cadastro público multi-ótica seguro. A branch não foi implantada no Render.

