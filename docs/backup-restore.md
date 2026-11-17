# Backup integral e recuperação — MB Óptica

## Política de backup

- O workflow `Encrypted Full PostgreSQL Backup` executa um dump integral do PostgreSQL a cada 6 horas e também pode ser acionado manualmente.
- O dump é validado com `pg_restore --list`, criptografado com age antes de sair do runner e publicado como artefato do GitHub Actions por 90 dias.
- O banco Neon mantém seu próprio histórico/PITR conforme a retenção contratada. O dump externo é uma camada adicional e não substitui a retenção do provedor.
- Não gravar dumps, dados pessoais, chaves privadas ou credenciais no Git.

## Secrets do backup

1. `MB_OPTICA_BACKUP_DATABASE_URL`: URL direta (não pooler) do PostgreSQL de produção.
2. `MB_OPTICA_BACKUP_AGE_RECIPIENT`: chave pública age usada para criptografar os dumps.

## Teste automatizado de recuperação isolada

O workflow `Isolated PostgreSQL Recovery Test` foi criado para:

1. Selecionar o último backup bem-sucedido (ou uma execução informada manualmente).
2. Baixar o artefato criptografado e verificar o SHA-256.
3. Descriptografar o arquivo usando a identidade age protegida em secret.
4. Confirmar que o dump pode ser lido pelo `pg_restore`.
5. Restaurar o banco somente em um endpoint PostgreSQL isolado.
6. Verificar se há tabelas públicas no banco recuperado.

O teste está programado para todos os domingos às 04:30 UTC e também pode ser iniciado manualmente. Ele nunca altera a URL de produção nem faz failover automático para produção.

## Secrets adicionais necessários para habilitar o teste

3. `MB_OPTICA_BACKUP_AGE_IDENTITY`: conteúdo completo da chave privada age correspondente à chave pública usada no backup. Armazenar como GitHub Actions secret, nunca no repositório, em logs ou em mensagens.
4. `MB_OPTICA_RESTORE_DATABASE_URL`: URL direta de um banco Neon exclusivo para recuperação/testes, em branch ou projeto separado da produção. Não usar a URL de produção nem um pooler.

O workflow bloqueia a execução se o host do destino for igual ao host da produção. O destino deve ser um endpoint separado, vazio ou dedicado à recuperação, pois cada teste atualiza os objetos do banco de destino com `pg_restore --clean`.

## Configuração inicial e homologação

Antes de o agendamento semanal funcionar, cadastrar os dois secrets adicionais acima. Depois executar manualmente o workflow e confirmar:

- SHA-256 aprovado;
- descriptografia concluída;
- restauração concluída no banco isolado;
- uma ou mais tabelas públicas encontradas.

A verificação de tabelas é um teste técnico inicial, não uma homologação funcional completa do sistema. Ainda devem ser conferidos login, clientes, produtos, ordens de serviço, vendas e financeiro no ambiente de recuperação.

## Recuperação de produção

A restauração automatizada aqui implementada é deliberadamente isolada. Não redireciona a aplicação, não troca variáveis do Render e não restaura diretamente sobre produção. Um retorno à produção exige aprovação explícita, validação funcional, backup adicional do estado atual e plano de reversão.

Para recuperação entre snapshots de seis horas, avaliar o PITR do Neon conforme a retenção e os recursos disponíveis no plano contratado.
