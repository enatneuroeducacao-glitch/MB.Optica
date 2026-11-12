# Instalador nativo do MB Gestão para Windows (sem Docker)

## Objetivo

Distribuir o MB Gestão como aplicativo Windows independente. O computador da óptica não precisa ter Docker Desktop, Node.js ou PostgreSQL previamente instalados.

## Conteúdo empacotado

- node.exe: runtime Node.js 22 incluído no pacote.
- app/: Next.js standalone, assets estáticos, Prisma Client/CLI e migrações.
- postgres/: binários portáteis PostgreSQL 16 para Windows x64, provenientes do pacote EDB 16.15-1.
- Banco e segredos criados no perfil local do Windows, fora da pasta de instalação.

## Inicialização

1. O Tauri localiza os recursos nativos empacotados.
2. Cria um diretório de dados exclusivo no AppData do usuário.
3. Inicializa o cluster PostgreSQL uma única vez, com autenticação SCRAM e senha aleatória.
4. Inicia PostgreSQL em 127.0.0.1:55432.
5. Executa prisma migrate deploy.
6. Inicia o Next standalone em 127.0.0.1:3000.
7. Aguarda /api/health/ready antes de exibir a janela.

O PostgreSQL é iniciado como processo local do usuário, não como serviço Windows global. Não é necessário criar conta de serviço nem instalar componentes do sistema. O processo do banco pode permanecer ativo depois de fechar a janela e é encerrado pelo Windows no desligamento.

## Isolamento

Cada instalador deve ter identificador Tauri e diretório AppData próprios. A instalação Ótica Imagem usa nome e identificador específicos do piloto; não compartilha o volume Docker nem o banco da Moni Becker.

## Integridade do pacote

A pipeline baixa o ZIP oficial EDB PostgreSQL 16.15-1 e confere o SHA-256 publicado pelo fornecedor antes de extrair. O payload é validado antes de gerar o instalador.

## Limitações desta etapa

Esta primeira etapa cria o payload nativo e o inicializador sem Docker. O atualizador nativo com backup/rollback, o ciclo de vida do processo PostgreSQL, assinatura digital do instalador e testes de upgrade de versões anteriores ainda precisam de homologação separada. Não substituir uma instalação em uso nem distribuir o artefato até todos os testes passarem.
