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