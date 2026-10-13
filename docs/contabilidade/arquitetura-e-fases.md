# Contabilidade — arquitetura e fase 1

## Objetivo

Construir escrituração contábil por partidas dobradas integrada aos módulos existentes, preservando Next.js, Prisma, PostgreSQL, Docker, CI do GitHub Actions e deploy pelo Render.

## Princípios de segurança

- Esta fase é aditiva: não altera tabelas operacionais existentes nem processa dados históricos.
- Não usar prisma db push em produção; alterações de schema entram por migrações versionadas.
- O lançamento contabilizado deve ter débitos iguais aos créditos.
- Eventos operacionais deverão ser idempotentes; reprocessar a mesma origem não pode duplicar a contabilização.
- Lançamentos contabilizados serão corrigidos por estorno rastreável, não por exclusão silenciosa.
- A API e as páginas contábeis devem ser exclusivas do papel ADMIN. A proteção de interface nunca substitui a autorização no servidor.
- O regime configurado como Simples Nacional é uma preferência inicial, não confirmação de enquadramento legal. Confirmar atividade, receitas, segregação e situação fiscal antes de qualquer cálculo oficial.

## Modelos criados na fase 1

- AccountingSettings: preferências contábeis da unidade.
- ChartOfAccount: plano de contas hierárquico.
- AccountingPeriod: competências mensais e estado de fechamento.
- AccountingEntry e AccountingEntryLine: cabeçalho e linhas de partidas dobradas.
- AccountingMapping: mapeamento futuro entre tipos de evento e contas.
- AccountingEvent: trilha de processamento e chave de idempotência.

## Fases seguintes

1. Validar schema/migração e acesso administrativo em CI.
2. Criar interface e APIs para plano de contas, períodos e lançamentos manuais.
3. Implementar validação transacional dos lançamentos, trilha de auditoria e estornos.
4. Integrar os eventos de vendas, recebimentos, contas, caixa, compras e estoque, com testes de idempotência.
5. Gerar diário, razão, balancete, DRE e balanço; implementar fechamento de competência.
6. Preparar relatórios e exportações para obrigações aplicáveis ao Simples Nacional, sob revisão contábil.

## Critérios de liberação

- prisma validate, prisma migrate deploy no PostgreSQL de CI, typecheck, auditoria de segurança e build de produção aprovados.
- Build e execução Docker aprovados.
- Testes adicionais para partidas dobradas, período fechado, permissão administrativa, estornos e idempotência aprovados antes de liberar as fases funcionais.
- Merge em main só após aprovação da revisão e CI. O Render implantará a main automaticamente; validar saúde e testes de fumaça após o deploy.
- Nenhuma migração será aplicada manualmente à produção antes de homologação e plano de recuperação.
