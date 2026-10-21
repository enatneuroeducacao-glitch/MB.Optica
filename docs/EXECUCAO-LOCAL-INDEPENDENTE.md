# Execução local independente (Docker)

Este procedimento é uma preparação para homologação local. Não executa nada automaticamente e não usa Render, Vercel ou Neon.

## Isolamento

- PostgreSQL local próprio em volume Docker `mb_optica_local_data`.
- Porta do PostgreSQL publicada somente em `127.0.0.1:5433`.
- Aplicação publicada somente em `127.0.0.1:3000`.
- O serviço `migrator` aplica migrações ao banco local antes de a aplicação iniciar.
- A aplicação não executa o comando de migração no início; o serviço `app` usa `node server.js` do estágio runner.
- A integração opcional de catálogo Supabase fica desativada neste perfil. Isso não prova que todos os recursos do sistema funcionam sem integrações externas; será necessário homologar os módulos.

## Pré-requisitos

Docker Engine/Desktop com Docker Compose e recursos livres suficientes. O build consome memória; em máquina com pouca RAM, não executar até fechar aplicações desnecessárias e confirmar espaço disponível.

## Preparação manual segura

1. Criar um arquivo local `.env.local` na raiz. Nunca versioná-lo nem colar seu conteúdo em chamados ou chats.
2. Preencher pelo menos:
   - `LOCAL_DB_PASSWORD`: senha longa, exclusiva para o banco local.
   - `AUTH_SECRET`: segredo aleatório com pelo menos 32 caracteres.
   - `BOOTSTRAP_TOKEN`: token aleatório com pelo menos 32 caracteres.
3. Não copiar credenciais de produção e não usar dados reais de clientes nesta primeira homologação.
4. Validar a configuração sem iniciar containers:
   ```powershell
   docker compose --env-file .env.local -f compose.local.yml config --quiet
   ```
5. Somente após revisar a saída e confirmar que o arquivo aponta para o perfil local:
   ```powershell
   docker compose --env-file .env.local -f compose.local.yml build
   ```
6. A inicialização fica para uma etapa autorizada separadamente, depois de revisar os efeitos do build e confirmar que não há conexão com bases externas.

## Observações

- Este perfil ainda não foi executado nem testado nesta alteração.
- O volume local é persistente. Não usar `down -v`, não apagar o volume e não apontar este perfil para bases existentes.
- Não executar scripts de importação, backup operacional ou migração de dados nesta etapa.
- O GitHub Actions usa banco efêmero nos testes; isso não é o banco local e não é produção.
