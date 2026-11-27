# Auditoria técnica — MB Gestão Desktop offline com sincronização opcional

**Data:** 2026-11-27  
**Repositório:** enatneuroeducacao-glitch/MB.Optica  
**Base auditada:** main @ 5a08ef56b7bbd448d5a19c8c9892a3149df459d2  
**Branch:** audit/mb-gestao-offline-hybrid-20261127  
**Escopo:** leitura de código, workflows e documentação; arquitetura e plano de homologação.  
**Fora do escopo:** produção, Render, Neon, Supabase remoto, dados reais, deploy, migração e publicação de instalador.

## 1. Decisão de arquitetura

Adotar o modo **offline-first com sincronização opcional**, inicialmente em um único computador Windows. O computador principal mantém a aplicação, o banco e os arquivos. A internet não pode ser requisito para iniciar sessão local, consultar/gravar cadastros, vender, movimentar estoque, emitir OS/orçamentos internos, registrar caixa/financeiro e gerar relatórios locais.

A sincronização com o site MB Óptica, backups externos e atualização de versão são capacidades secundárias: devem ocorrer apenas quando houver conectividade e nunca bloquear a operação local. A arquitetura deve permitir habilitar uma LAN segura no futuro, mas o primeiro release fica limitado ao loopback do computador principal.

## 2. Estado encontrado no repositório

Há três caminhos distintos e não equivalentes:

1. **Tauri + Docker Compose + PostgreSQL local**: workflow .github/workflows/mb-gestao-windows.yml, documentação deploy/local-optical/README.md e docs/EXECUCAO-LOCAL-INDEPENDENTE.md. Exige Docker Desktop e provisiona PostgreSQL em volume local. O workflow gera instalador de homologação.
2. **Tauri + runtime Node empacotado + PostgreSQL portátil**: workflow .github/workflows/mb-gestao-windows-native.yml. Apesar do nome “sem Docker”, o workflow baixa e empacota binários portáteis PostgreSQL; não é a arquitetura SQLite escolhida.
3. **Tauri + runtime Node empacotado + SQLite**: workflow experimental .github/workflows/mb-gestao-windows-sqlite.yml, schema prisma/schema.sqlite.prisma e caminho Rust native_prepare() em desktop/src-tauri/src/lib.rs. É a base mais próxima da decisão final, mas não está homologada.

O workflow SQLite mais recente encontrado foi executado em 2026-11-17 (run 43987368597, commit c97a94be) e falhou durante o typecheck do build Next.js. O schema SQLite passou em prisma validate e o Prisma Client SQLite foi gerado. Falha exata: src/app/api/financeiro/route.ts:391 — propriedade mode: "insensitive" não existe no tipo StringFilter<"PaymentMethod"> gerado para SQLite. O workflow não chegou à geração do instalador; portanto não existe evidência de um EXE SQLite completo homologado.

A main auditada tem commit 5a08ef56 (2026-11-17). O workflow Windows de homologação em main concluiu builds com sucesso, mas seu caminho usa imagem Docker/Compose/PostgreSQL e não comprova funcionamento offline sem Docker nem funcionamento SQLite.

## 3. Bloqueios e riscos técnicos

### P0 — impedir release

- **Compatibilidade PostgreSQL/SQLite no código:** o typecheck encontrou ao menos um filtro case-insensitive incompatível com SQLite. Corrigir sem alterar a semântica de busca e testar endpoints/relatórios. Uma correção pontual não prova ausência de outras incompatibilidades.
- **Prisma Client e CLI desalinhados:** package.json usa versões em faixa (^6.16.0); o log do build SQLite gerou Client 6.19.3, enquanto o empacotamento instala Prisma CLI 6.16.0 isoladamente. Fixar versões idênticas e validar Client/CLI/schema em CI.
- **Inicialização aplica prisma db push em toda abertura:** native_prepare() executa db push --skip-generate diretamente no arquivo de dados. Isso pode alterar o schema do banco do cliente durante uma inicialização. Substituir por migrações versionadas, preflight e backup verificável; nunca executar migração destrutiva ou reset automático.
- **Atualizador Tauri incompatível com SQLite:** desktop/src-tauri/src/updater.rs contém lógica de Docker Compose, imagem de servidor e backup/restauração PostgreSQL. Não pode ser habilitado no instalador SQLite até existir atualização segura com backup consistente do arquivo SQLite, verificação de integridade, rollback e compatibilidade de schema.
- **Ciclo de vida do servidor local:** Rust inicia node.exe server.js e guarda Child em estado global; é necessário comprovar encerramento limpo ao fechar a janela, tratamento de encerramento inesperado, detecção de instância já aberta, porta ocupada e recuperação após desligamento abrupto.
- **Teste real sem internet:** não há evidência de teste end-to-end em Windows com rede desativada, incluindo primeiro boot, reinício, login, operações de escrita e impressão.

### P1 — necessário para operação confiável

- **Sincronização Supabase:** src/lib/site-stock-sync.ts faz PATCH remoto síncrono. Quando falha, grava erro no produto e retorna falha; não há nesse módulo fila durável de eventos, retry/backoff, idempotência, resolução de conflito ou painel de pendências. Tornar a sincronização assíncrona e desacoplada da transação local.
- **Serviços externos:** inventariar chamadas a Supabase, APIs fiscais, e-mail, reset de senha, mensagens, analytics, armazenamento e licenciamento. Cada integração deve ser classificada como bloqueante, opcional ou indisponível offline; a interface deve explicar o estado sem travar operações locais.
- **Autenticação e licença:** login/sessão devem usar dados locais. Reset por e-mail e validação remota não podem ser exigidos para entrar. Definir licença local assinada com período de tolerância e regras claras; não criar bypass de assinatura nem depender de resposta online a cada abertura.
- **Persistência e proteção:** banco em diretório de dados do usuário, fora da pasta de instalação; ACL restrita, proteção de segredos, backup automático e retenção definida.
- **Backup/restore SQLite:** backup consistente (checkpoint/backup API ou fechamento coordenado), verificação com PRAGMA integrity_check, cópia para mídia externa e ensaio de restauração em banco separado. Não basta copiar arquivo aberto sem coordenar WAL.
- **Armazenamento de anexos:** receitas, imagens, documentos e PDFs precisam de diretório local persistente, exportação e backup; nenhum arquivo essencial pode depender de URL temporária remota.
- **Observabilidade local:** logs rotativos, diagnóstico de saúde do Node/SQLite, espaço em disco, falhas de inicialização e exportação de diagnóstico sem segredos.

### P2 — evolução

- Habilitar rede local somente em fase posterior, com servidor escutando em interface de rede apenas mediante configuração explícita, TLS confiável, firewall restrito à sub-rede privada, sessões seguras e teste multiusuário.
- Sincronização de backups externos e atualizações com assinatura/verificação de integridade, sem atualizar automaticamente no meio do expediente.
- Definir suporte a múltiplas estações, bloqueio/concorrência e estratégia de backup do computador-servidor antes de ativar LAN.

## 4. Arquitetura-alvo

- Shell: Tauri 2.
- Runtime: Node.js Windows x64 empacotado junto com Next.js standalone e assets estáticos.
- Banco: SQLite local, arquivo persistente em diretório de dados do usuário (ou diretório de dados Tauri equivalente), nunca dentro da pasta de instalação.
- ORM: Prisma Client SQLite gerado na mesma versão da CLI e do schema.
- Servidor: somente loopback 127.0.0.1; health endpoint local; porta escolhida/reservada com detecção de conflito.
- Arquivos: pasta de dados dedicada com subpastas para anexos, logs, backups e fila de sincronização.
- Integrações: adaptadores isolados e fila outbox local. Operação local grava primeiro; sincronização remota ocorre em background e é idempotente.
- Atualização: pacote assinado, manifesto verificado, backup SQLite validado, migração versionada e rollback. Se não houver internet, permanece na versão instalada.
- LAN: desativada no primeiro release.

## 5. Plano de trabalho isolado

1. Congelar a referência main e manter todo o trabalho em branch de auditoria/desenvolvimento.
2. Fechar inventário de incompatibilidades SQLite em rotas, consultas Prisma, transações, agregações, Decimal/DateTime/Json, filtros e relatórios.
3. Corrigir o typecheck SQLite sem alterar regra de negócio; rodar testes unitários, integração e build Next.
4. Alinhar versões Prisma; validar geração do Client e runtime empacotado.
5. Implementar migrações versionadas com backup/preflight; retirar db push automático da inicialização.
6. Corrigir ciclo de vida do servidor e desabilitar o atualizador PostgreSQL/Docker no perfil SQLite.
7. Implementar backup/restauração e outbox de sincronização.
8. Fazer inventário das integrações externas e garantir degradação graciosa offline.
9. Gerar instalador em CI isolado e executar matriz de testes em máquina Windows limpa.
10. Somente após aprovação e backup reconciliado, preparar procedimento de migração de dados. Nenhum dado de produção será copiado ou alterado nesta etapa.

## 6. Critérios de aceite para o primeiro release

- Instalação e primeiro boot sem internet e sem Docker.
- Abrir/fechar/reabrir o aplicativo sem processos Node órfãos ou corrupção.
- Login local e permissões funcionando offline.
- CRUD de clientes, produtos, fornecedores e serviços.
- Estoque, OS, orçamento, vendas, pagamentos, caixa e financeiro com persistência após reinicialização.
- Relatórios locais coerentes com os registros.
- Impressão de OS/orçamento e exportação de documentos locais.
- Backup íntegro e restauração comprovada em ambiente descartável.
- Sem chamadas de rede obrigatórias para fluxos internos; nenhuma falha de integração remota pode desfazer gravação local.
- Desativar internet durante o uso não interrompe transações locais.
- Atualização não é exigida para abrir; sem conexão, versão atual permanece funcional.
- Teste de regressão e reconciliação de contagens/valores antes de qualquer migração de dados.

## 7. Salvaguardas

- Não executar prisma migrate reset, db push contra dados de cliente, docker compose down -v, exclusão de volumes, limpeza de banco ou scripts de importação.
- Não copiar credenciais de produção para o ambiente de homologação.
- Não alterar main, Render, Neon, Supabase remoto ou serviços fiscais nesta fase.
- Toda migração deve ocorrer primeiro em cópia isolada, com backup antes/depois e reconciliação de registros e totais financeiros.

**Conclusão:** o caminho SQLite é tecnicamente possível e já tem esqueleto, mas o projeto ainda não está pronto para distribuição. O primeiro objetivo deve ser obter build SQLite verde e seguro; depois validar servidor, banco, backup, sincronização e operação real sem rede.


## 8. Atualização de execução — 2026-11-27

Trabalho iniciado na branch isolada. A main permanece como base imutável.

### Alterações já registradas na branch

- `package.json`: Prisma CLI e `@prisma/client` fixados em `6.16.0` (versões exatas, sem caret), para eliminar a divergência de resolução observada entre Client e CLI.
- `.github/workflows/mb-gestao-windows-sqlite.yml`: workflow agora pode ser disparado por push nesta branch de auditoria; acrescentado `npm run typecheck` antes do build Next.js e verificação explícita de versão/geração do Prisma.

### Novas constatações que impedem avançar diretamente para o instalador

- Não existe `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml` ou `yarn.lock` na raiz. Fixar Prisma reduz a deriva, mas a instalação completa ainda não é totalmente reproduzível; será necessário gerar e versionar lockfile em ambiente Node/npm controlado.
- O diretório `prisma/migrations` contém migrações PostgreSQL, mas não foi encontrada uma trilha de migrações SQLite. Portanto, retirar `db push` agora sem antes gerar e validar uma baseline SQLite deixaria instalações novas sem inicialização segura. Não foi feita essa remoção prematura.
- `native_prepare()` executa `db push` antes de iniciar o Node em cada abertura. Isso continua sendo bloqueador P0 e precisa ser substituído por um migrador SQLite versionado com backup e preflight.
- `updater.rs` continua inteiramente orientado a Docker/PostgreSQL. A atualização não pode ser exposta no perfil SQLite até a implementação específica de backup, migração e rollback SQLite.
- O módulo de sincronização continua fazendo PATCH remoto dentro da chamada da rotina de sincronização e não possui outbox durável. A fila precisa ser desenhada junto com os pontos de gravação locais, usando chaves idempotentes e política de retry.

### Validação

- Commit de pinagem Prisma: `36140018380a20f50a19eb1459174c249776d6b4`.
- Commit de workflow: `b46c54e83bc963c3b35ba421d29fbc5ed5956f4f`.
- Comparação com `main`: branch à frente por 3 commits e atrás por 0; main não foi modificada.
- No momento desta atualização, a API de Actions não retornou execução do workflow nesta branch. Portanto, typecheck, build e instalador ainda não estão aprovados.
- Nenhuma operação foi executada em Render, Neon, Supabase remoto ou banco de produção.
