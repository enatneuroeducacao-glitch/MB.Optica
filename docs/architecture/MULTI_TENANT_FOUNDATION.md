# Fundação multi-ótica — MB Gestão Inteligente

## Decisão aprovada

O MB Gestão será uma plataforma SaaS multi-tenant: uma aplicação compartilhada por várias óticas, com isolamento lógico e obrigatório dos dados de cada empresa.

O usuário administrador atual da instalação MB Óptica será promovido a **proprietário central da plataforma** (Platform Owner / Super Admin). A identificação técnica desse usuário deve ocorrer por ID/email confirmado no banco de produção antes da migração de dados ou atribuição de privilégios. Não atribuir automaticamente o papel central a todos os usuários ADMIN.

## Papéis e fronteiras

- **Platform Owner:** administra a plataforma inteira, cria e acompanha organizações, configura planos, períodos de avaliação, assinaturas, limites e suspensões. Acesso central auditado.
- **Organization Admin:** administra apenas a sua ótica, incluindo usuários, configurações e operações da empresa.
- **Usuários operacionais:** gerente, vendedor, laboratório e financeiro, sempre vinculados a uma organização e limitados às permissões dessa organização.

O papel ADMIN existente é de âmbito empresarial e não deve, por si só, conceder poderes globais.

## Modelo de tenancy proposto

- `Organization`: empresa/ótica, dados cadastrais, status e timezone.
- `OrganizationMembership`: vínculo entre usuário e organização, papel empresarial e permissões.
- `User`: identidade/autenticação; o mesmo usuário poderá ter vínculo com mais de uma organização se isso for necessário.
- `PlatformRole` (ou entidade equivalente): papel central independente dos papéis empresariais.
- `Subscription`: uma assinatura por organização, com plano, status, limites, módulos, início e fim da avaliação e ciclo de cobrança.
- Todos os registros operacionais e contábeis devem receber `organizationId` e índices/constraints adequados.

## Regras obrigatórias de segurança

1. O tenant ativo é resolvido no servidor a partir da sessão e de um vínculo válido; nunca confiar em `organizationId` enviado livremente pelo navegador.
2. Toda leitura, criação, alteração, exclusão, agregação, exportação e rotina em background deve filtrar pelo tenant.
3. Relações entre entidades devem impedir associação cruzada entre organizações.
4. Endpoints de administração central devem exigir papel central explícito e registrar auditoria.
5. Login deve resolver a identidade e o vínculo com a organização; não pode selecionar empresa apenas por parâmetro sem validar membership.
6. A suspensão de uma assinatura bloqueia o acesso operacional da organização, mas não apaga seus dados.
7. Avaliação de 60 dias deve ser calculada por organização, e não por uma assinatura global compartilhada.
8. O isolamento precisa ser testado por API e banco; esconder menus na interface não é controle de segurança.

## Migração segura da instalação atual

A MB Óptica atual será a primeira organização. Todos os dados existentes serão associados a ela em backfill transacional e auditável. Preservar IDs, histórico de vendas, ordens, clientes, estoque, pagamentos, eventos contábeis, documentos fiscais, usuários e configurações. Não executar migração destrutiva nem ativar múltiplos tenants antes da validação do backfill.

A identificação do usuário administrador atual como proprietário central será feita de forma explícita, usando o identificador confirmado da conta. Nenhum usuário ADMIN adicional receberá privilégio de Platform Owner por inferência.

## Sequência de implementação

1. Inventariar todos os modelos Prisma, rotas API, jobs, integrações e consultas sem tenant.
2. Introduzir organizações, memberships e papel central, mantendo compatibilidade temporária com a instalação atual.
3. Criar migração de backfill para a primeira organização e seus registros, com contagens e validação antes/depois.
4. Adicionar `organizationId`, índices e constraints aos modelos operacionais, financeiros, fiscais e contábeis.
5. Refatorar autenticação, autorização e todas as rotas para escopo obrigatório.
6. Migrar assinaturas e avaliação de 60 dias para o nível da organização.
7. Construir painel central e painel administrativo isolado de cada ótica.
8. Executar testes automatizados de isolamento, permissões, assinatura, migração e regressão.
9. Liberar criação de novas óticas somente após aprovação dos testes de isolamento.

## Estado desta entrega

Esta especificação registra a decisão e orienta a implementação. Ainda não altera o schema nem os dados de produção. A ativação de tenancy antes da cobertura integral das rotas seria insegura, especialmente porque o projeto possui mais de 90 endpoints e modelos operacionais interligados.
## Progresso da implementação — 10/11/2026

- Criada a branch `feature/multi-tenant-foundation`; a branch `main` permanece intacta.
- Adicionados ao Prisma os modelos `Organization`, `OrganizationMembership` e `PlatformAccess`, além do vínculo opcional entre `Subscription` e `Organization`.
- Criada migration SQL aditiva `20261110120000_multi_tenant_core`; ela cria as estruturas e constraints, mas não cria tenants nem altera registros existentes.
- Criado `MULTI_TENANT_INVENTORY.md` com inventário de 106 rotas API, 49 modelos e domínios sensíveis.
- Ainda não foi atribuído `PlatformAccess` ao usuário administrador atual, pois é necessário identificar inequivocamente a conta no banco correto.
- Ainda não foi executada validação Prisma/CI nem aplicada migration em produção.

**Bloqueio para o próximo passo:** confirmar qual projeto Neon contém o banco de produção do MB Gestão/MB Óptica. A busca disponível encontrou um projeto chamado `universidade-mb-admin`, que não é suficiente para presumir que seja o banco correto. Não será consultado nem alterado um banco ambíguo.

## Atualização operacional — 10/11/2026

### Banco efetivamente usado pelo serviço publicado

A inspeção do serviço Render `mb-optica-gestao` (serviço `srv-davmcg60tbcc73ehhn6g`) mostrou que o deploy ativo de `main`, concluído em 10/11/2026 às 18:28 UTC, iniciou o Prisma apontando para o PostgreSQL Render `mb_optica_db_contingencia`, recurso `dpg-db9p7flg1s2s739hstn0-a`. Portanto, não é seguro presumir que o projeto Neon consultado anteriormente seja o banco que atende a aplicação publicada.

O PostgreSQL Render encontrado está no plano Free, com expiração informada para 16/11/2026. Sua allowlist de rede está vazia e o conector de consulta recebeu bloqueio de conexão externa. Não foi possível ler tabelas, conferir o usuário administrador, confirmar os dados do e-mail testado ou executar contagens de validação.

A listagem atual dos projetos Neon não apresentou um projeto identificado como banco do MB Óptica/MB Gestão. O projeto `universidade-mb-admin` não será tratado como banco do MB Gestão sem confirmação.

### Bloqueios de produção que precisam ser resolvidos antes do backfill

1. Confirmar e estabilizar o banco de dados que o serviço Render deve utilizar. O PostgreSQL de contingência tem expiração próxima; não alterar DATABASE_URL nem migrar dados sem backup e comparação de contagens.
2. Disponibilizar uma conexão administrativa segura ao banco Render atual (por exemplo, executar o conector Render localmente com acesso de rede apropriado ou fornecer um backup/exportação verificada). Não abrir a allowlist para `0.0.0.0/0`.
3. Inventariar o estado real do banco: migrations aplicadas, tabelas, contagens, usuário administrador e dados da tentativa de cadastro.
4. Executar backup restaurável e teste de restauração antes de qualquer migração.
5. Aplicar a migration multi-tenant aditiva somente após validar que o schema de produção corresponde ao commit base esperado.
6. Executar backfill transacional para a primeira organização e validar contagens/relacionamentos antes de habilitar qualquer nova empresa.

### Regra de liberação

O deploy atual de `main` continua sendo a instalação legada de uma única ótica. A branch desta fundação não está publicada no Render e não deve ser mesclada nem implantada como se já oferecesse isolamento. Não habilitar cadastro público, degustação autoatendida ou novas organizações até que todos os modelos operacionais, as 106 rotas, tarefas em background, consultas agregadas e relações entre registros estejam tenant-scoped e cobertos por testes negativos de acesso cruzado.

