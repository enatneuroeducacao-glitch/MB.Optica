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
