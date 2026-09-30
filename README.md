# MB Óptica

Sistema de gestão de última geração para uma óptica, construído do zero.

## Módulos
Clientes · Receitas · Orçamentos · Pedidos · Laboratório · Produtos · Estoque · Vendas · Financeiro · Caixa · Relatórios · Auditoria · Migração.

## Arquitetura
Next.js + TypeScript + PostgreSQL/Prisma.

Fluxo principal: **Cliente → Receita → Orçamento → Pedido → Laboratório → Conferência → Pronto → Entrega → Venda/Financeiro**.

## Migração BeepStart
O backup do BeepStart é fonte histórica, não código-base. A migração deverá validar, mapear, preservar payload original e transformar referências indiretas em relações reais. Receitas ópticas em texto livre só serão estruturadas quando os dados forem suficientemente confiáveis.

**Nunca versionar dados reais de clientes no GitHub.**

## Desenvolvimento
```bash
npm install
npx prisma generate
npm run dev
```
Configure `DATABASE_URL` em `.env.local`.

## Execução independente do Vercel

O MB Óptica pode ser executado em Docker com PostgreSQL sem depender do Vercel.

### Ambiente local completo

1. Copie `.env.docker.example` para um arquivo de ambiente local e troque os segredos.
2. Suba a stack:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

A stack sobe PostgreSQL 16, aplica as migrations Prisma e somente então inicia o MB Óptica em `http://localhost:3000`.

### Banco PostgreSQL externo

Para um servidor próprio ou PostgreSQL gerenciado, mantenha o aplicativo em Docker e forneça `DATABASE_URL`, `AUTH_SECRET` e `BOOTSTRAP_TOKEN` como variáveis de ambiente. As migrations devem ser aplicadas com a imagem `migrator` antes de iniciar o aplicativo.

O Vercel é, portanto, uma opção de hospedagem, não um requisito da aplicação.

