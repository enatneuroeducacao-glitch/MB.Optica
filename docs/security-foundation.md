# Fundação de segurança — MB Óptica

## Autenticação

O sistema usa sessão assinada em cookie HTTP-only:

- cookie: `mb_optica_session`
- algoritmo: HS256
- duração: 12 horas
- senha: bcrypt com fator 12
- `AUTH_SECRET`: segredo obrigatório, com pelo menos 32 caracteres
- `sessionVersion`: invalida sessões existentes quando credenciais/perfil são alterados

O token nunca é exposto ao cliente JavaScript.

## Inicialização do administrador

A criação do primeiro administrador é feita uma única vez por `/setup`.

Ela exige `AUTH_BOOTSTRAP_TOKEN`, que deve ser configurado no ambiente da aplicação. Depois que existir qualquer usuário, o endpoint de bootstrap retorna conflito e não cria outro administrador.

Nunca colocar senhas ou tokens no Git.

## Perfis

- ADMIN: acesso total
- GERENTE: operação e gestão, sem migração
- VENDEDOR: clientes, receitas, orçamentos, pedidos e vendas
- FINANCEIRO: financeiro, caixa, fornecedores e relatórios
- LABORATORIO: pedidos, laboratório, produtos e estoque

O controle é aplicado no middleware por rota e por API. As operações administrativas também validam o perfil no servidor.

## Auditoria

Operações administrativas e de autenticação registram eventos em `AuditLog`, incluindo:

- login
- falha de login
- logout
- bootstrap administrativo
- criação/alteração de usuários
- alteração das configurações da loja

## Configurações da loja

A tabela `StoreSettings` centraliza:

- razão social
- nome fantasia
- documento
- telefones
- e-mail
- endereço
- cidade/UF
- CEP
- fuso horário
- moeda

## Variáveis obrigatórias

```env
DATABASE_URL=...
AUTH_SECRET=...
AUTH_BOOTSTRAP_TOKEN=...
```

O valor real dessas variáveis deve existir apenas no ambiente da aplicação, nunca no repositório.
