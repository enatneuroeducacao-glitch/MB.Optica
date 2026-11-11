# Auditoria de segurança das APIs — rollout multi-tenant

Branch de auditoria: `feature/tenant-api-security-rollout`
Base: `feature/tenant-composite-integrity`
Data da leitura: 2026-11-11

## Escopo e método

Foram enumerados os 106 arquivos `route.ts` sob `src/app/api` na árvore da branch base. Cada arquivo foi inspecionado quanto a:
- guardas no handler (`requireUser`, `requireRole`, `requirePermission`, `getCurrentUser`);
- chamadas Prisma de leitura/escrita;
- referência explícita a `organizationId`.

Resultado objetivo: nenhum dos 106 handlers contém referência explícita a `organizationId`. Isso não significa que todos sejam publicamente acessíveis: `middleware.ts` aplica autenticação e regras globais de perfil/permissão à maioria das rotas. Porém, middleware e JWT usam papel/permissões globais do User e não resolvem OrganizationMembership. Portanto, não há isolamento por empresa na camada HTTP/consulta.

## Conclusões críticas

1. **Escopo de tenant ausente nas APIs:** 106/106 handlers sem filtro/atribuição explícita de `organizationId`.
2. **Autorização ainda global:** `middleware.ts`, `auth.ts` e `permissions.ts` continuam usando `User.role` e permissões globais, não o papel e permissões do membership ativo.
3. **Contexto já existe, mas está desconectado:** `resolveTenantContext()` valida membership e organização ACTIVE, mas não é consumido por `requireUser`, `requireRole` nem pelas rotas.
4. **Assinatura global:** `getSubscriptionEntitlement()` usa `subscription.findFirst()` e `user.count()` sem organização; `MB_OPTICA_OWNER_INSTANCE=true` concede bypass para toda a instância.
5. **Superfície de API com guarda somente no middleware:** diversas rotas fazem operações Prisma sem chamar guarda no próprio handler. Isso não deve ser confundido com endpoint público, pois a maioria continua atrás do middleware; ainda assim, a autorização depende exclusivamente de papel global/token.
6. **Rotas públicas e exceções precisam ser explícitas:** login, logout, bootstrap, recuperação/reset de senha, health, branding e version têm tratamentos diferentes no middleware. Não devem ser convertidas em rotas operacionais multi-tenant por simples regra genérica.

## Rotas sem guarda explícita no handler

A lista abaixo significa ausência de chamada de guarda no arquivo `route.ts`, não ausência automática de autenticação no middleware.

- `src/app/api/branding/route.ts` — leitura de StoreSettings; middleware trata branding como API pública.
- `src/app/api/cash/close/route.ts`
- `src/app/api/cash/movement/route.ts`
- `src/app/api/cash/session/route.ts`
- `src/app/api/cash/summary/route.ts`
- `src/app/api/dashboard/economic-health/route.ts`
- `src/app/api/dashboard/route.ts`
- `src/app/api/finance/accounts/pay/route.ts`
- `src/app/api/finance/accounts/route.ts`
- `src/app/api/financeiro/route.ts`
- `src/app/api/gestao/indicadores/route.ts`
- `src/app/api/orders/[id]/status/route.ts`
- `src/app/api/payment-methods/[id]/route.ts`
- `src/app/api/payment-methods/route.ts`
- `src/app/api/pix-keys/route.ts`
- `src/app/api/relatorios/route.ts`
- `src/app/api/stock/route.ts`

Arquivos com handlers mistos (por exemplo, GET sem guarda e POST com `requireRole`) devem ser corrigidos por método, não classificados como inteiramente protegidos.

## Rotas de identidade e infraestrutura — tratamento separado

- `auth/login`, `auth/logout`, `auth/bootstrap`, `auth/forgot-password`, `auth/reset-password`: fluxos públicos/identidade, sem contexto de empresa no login; precisam continuar funcionais durante migração.
- `auth/me`, `auth/change-password`: sessão do usuário; não são autorização administrativa de plataforma.
- `health`, `version`: endpoints técnicos, sem dados operacionais.
- `branding`: atualmente consulta configuração global; antes de tornar multi-tenant, definir como identificar a marca pública por domínio/slug sem confiar em organizationId arbitrário fornecido pelo cliente.
- `entitlements`: autenticado, mas precisa devolver entitlement da organização ativa e tratar explicitamente ausência/seleção de membership.

## Separação de domínios de autorização

### Plataforma (controle central)
Somente operações explicitamente administrativas da plataforma devem usar `PlatformAccess`:
- cadastro/gestão de organizações;
- memberships e suporte central;
- visão central de assinaturas e cobrança;
- auditoria e operações de suporte cross-tenant.

Acesso de plataforma não deve conceder implicitamente leitura/escrita operacional em uma ótica. Acesso operacional exige membership ativo naquela organização.

### Organização (operação da ótica)
Clientes, receitas, agenda, catálogo, fornecedores, estoque, pedidos, vendas, pagamentos, caixa, financeiro, contabilidade, fiscal, relatórios, usuários locais, configurações, importação e auditoria devem resolver um único TenantContext no servidor e aplicar `organizationId` em toda leitura, escrita, agregação e relacionamento.

### Público / sistema
Login, reset de senha, health, version e vitrine pública precisam de contratos separados e mínimos. Nenhum endpoint público pode expor configurações fiscais, contatos privados ou dados operacionais.

## Matriz de risco por domínio

| Domínio | Risco | Requisito de rollout |
|---|---|---|
| Auth / usuários | Crítico | identidade global; role operacional via membership; plataforma via PlatformAccess |
| Assinatura / entitlements | Crítico | assinatura, usuários ativos e limites por organizationId |
| Clientes / receitas / agenda | Crítico | filtro obrigatório e validação de referências do mesmo tenant |
| Produtos / fornecedores / estoque | Crítico | catálogo, lotes e movimentos no mesmo tenant |
| Orçamentos / pedidos / vendas / pagamentos | Crítico | transações e relacionamentos tenant-scoped; numeração por organização |
| Financeiro / caixa / contabilidade | Crítico | saldos, períodos, liquidações e eventos isolados |
| Fiscal | Crítico | certificado, configuração e documentos isolados |
| Migração / legado | Crítico | importação autorizada e fingerprint/idempotência por organização |
| Configurações / branding / site | Alto | settings por organização; público resolvido por domínio/slug |
| Mensagens / contatos | Alto | escopo por usuário e organização, sem exposição de contatos de outras óticas |
| Dashboard / relatórios | Crítico | filtros aplicados na origem de cada agregação |
| Health / version | Baixo | somente metadados técnicos, sem dados do negócio |

## Plano de implementação segura

1. Criar guards separados: `requirePlatformAccess` e `requireTenantContext`; manter temporariamente os guards legados para não bloquear usuários sem membership durante o backfill.
2. Criar endpoints administrativos da plataforma separados dos endpoints operacionais da organização. Não reaproveitar `User.role=ADMIN` como papel central.
3. Fazer bootstrap/backfill revisável: identificar a conta proprietária, criar organização MB Óptica e membership ADMIN, atribuir `organizationId` a todos os registros legados e reconciliar contagens/relacionamentos. Não fazer isso em produção sem backup restaurável e autorização.
4. Atualizar as rotas por domínio, começando por clientes/catálogo e avançando para vendas, financeiro, fiscal, migração e relatórios. Toda query Prisma deve receber escopo derivado do TenantContext, nunca de um ID de organização confiado ao cliente.
5. Migrar a assinatura para `findUnique({ where: { organizationId } })` e contar somente memberships ativos da organização. O bypass do proprietário deve ser limitado a um controle central explícito, não ao tenant inteiro.
6. Criar testes de duas organizações para GET, POST, PATCH, DELETE, relações compostas, agregações, jobs e importação. Testar também usuário sem membership, usuário com dois memberships, organização suspensa e acesso de plataforma sem membership.
7. Só então avaliar NOT NULL, backfill final e liberação de novo tenant.

## Critérios de aceite

- Nenhuma rota operacional usa papel global como fonte final de autorização.
- Nenhuma leitura, escrita, agregação ou relacionamento operacional ignora organizationId.
- Nenhuma organização acessa registros, arquivos, configurações, caixa, relatórios ou dados fiscais de outra.
- PlatformAccess não equivale a membership operacional.
- Usuários legados da MB Óptica mantêm acesso somente após backfill validado; antes disso, rollout em modo compatibilidade sem abrir novas organizações.
- Testes negativos de isolamento passam no PostgreSQL e nas rotas HTTP.
- Nenhuma migration é executada em produção sem aprovação expressa.


## Atualização da implementação — 2026-11-11

### Implementado nesta branch
- Guards separados `requireTenantContext`, `requireTenantRole` e `requirePlatformAccess`.
- Entitlement por organização conectado ao guard operacional, com mapeamento de módulos também para endpoints `/api/*`.
- APIs de controle central:
  - `GET/POST /api/platform/organizations`: listar e criar organizações, criando vínculo ADMIN inicial e assinatura em transação.
  - `GET/POST /api/platform/organizations/[id]/memberships`: listar e criar/atualizar vínculos.
- A autorização dos endpoints centrais é feita por `PlatformAccess` persistido. O middleware deixa a requisição chegar ao guard, sem conceder o acesso por si só.
- `GET/POST /api/customers` migrados para membership role e escopo `organizationId`; endereços incluídos na leitura também são filtrados.
- `scripts/preflight-tenant-backfill.ts` e comando `npm run tenant:preflight`: relatório somente leitura de totais, registros sem organização, órfãos, memberships e assinatura legada.
- `scripts/integration-tenant-isolation.ts` e comando `npm run test:tenant-isolation`: teste HTTP com dois usuários e duas organizações; valida leitura do próprio cliente e bloqueio ao selecionar outra organização.
- CI ajustada para validar este branch e executar typecheck, build e teste de integração.

### Ainda não concluído
- As demais 105 rotas ainda precisam ser migradas e revisadas por domínio. Não se deve aplicar um wrapper genérico sem filtrar todas as consultas e validar as relações de cada handler.
- Os endpoints administrativos da plataforma ainda precisam de testes HTTP próprios e revisão de limites de criação/alteração.
- O backfill permanece apenas em modo preflight; nenhum dado foi alterado.
- O teste HTTP de isolamento só cobre a API de clientes nesta etapa; não comprova isolamento em produtos, estoque, vendas, financeiro, fiscal, mensagens, relatórios ou jobs.
- A execução do CI deste branch precisa concluir para confirmar typecheck, build e os testes. Falha ou sucesso parcial não equivale à homologação integral.

### Segurança de rollout
Não ativar as rotas não migradas para novos tenants. Não criar a organização MB Óptica nem atribuir registros automaticamente até o relatório de preflight ser revisado, as contagens serem reconciliadas e existir backup restaurável validado. Nenhuma ação de produção está autorizada por este PR.
