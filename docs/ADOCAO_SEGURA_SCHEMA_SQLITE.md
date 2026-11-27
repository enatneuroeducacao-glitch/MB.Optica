# Adoção segura do schema SQLite em instalações existentes

## Contexto

Versões anteriores do MB Gestão podem ter criado tabelas SQLite sem a tabela `_prisma_migrations` (por exemplo, por sincronização de schema). A nova versão não pode assumir que essas tabelas correspondem à baseline versionada.

## Comportamento

Na inicialização, se o banco contiver tabelas da aplicação e não possuir histórico Prisma, o MB Gestão interrompe o servidor e apresenta a ação **Fazer backup e verificar adoção**.

A ação:
1. exige o perfil SQLite nativo;
2. verifica a integridade do banco com `PRAGMA integrity_check`;
3. cria backup consistente pela API SQLite Backup e valida a cópia;
4. compara o banco existente com `prisma/sqlite/schema.baseline.prisma`, que representa a baseline anterior à fila de sincronização;
5. se houver qualquer diferença, cancela sem marcar migrações nem alterar o banco;
6. somente se a comparação não apontar diferenças, registra a baseline inicial como aplicada com `prisma migrate resolve --applied`;
7. executa `prisma migrate deploy` para aplicar migrações posteriores, incluindo a outbox;
8. verifica novamente a integridade do banco.

## Segurança

- Não executa `prisma db push`, `migrate reset` ou `migrate dev`.
- Não apaga tabelas nem recria o banco.
- Não tenta corrigir automaticamente diferenças de schema.
- O backup anterior à adoção permanece na pasta local `backups`.
- Se a comparação falhar, o relatório inclui a diferença do Prisma e o caminho do backup.
- Se a baseline for registrada e uma migração posterior falhar, a inicialização permanece bloqueada; a próxima abertura pode retomar `migrate deploy`.

## Limite importante

A adoção só pode ser executada após a comparação exata com a baseline. Bancos com colunas, índices, tabelas ou tipos diferentes precisam de uma migração específica revisada e testada sobre uma cópia do banco. Não se deve marcar a baseline manualmente nesses casos.

## Homologação obrigatória

Testar com:
- banco legado cuja estrutura corresponda exatamente à baseline;
- banco com uma coluna ausente;
- banco com uma tabela extra;
- banco com índice diferente;
- banco inválido/corrompido;
- falha simulada durante `migrate deploy`.

Em todos os cenários negativos, verificar que o backup está íntegro e que os dados originais não foram alterados.
