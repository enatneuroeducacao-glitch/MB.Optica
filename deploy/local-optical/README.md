# Instalação local independente — MB Gestão

## Arquitetura

Cada óptica terá uma instância própria do MB Gestão e um PostgreSQL próprio, executados no computador-servidor da loja por Docker Compose. Os dados ficam em um volume Docker persistente local. Nenhum banco de outra óptica é compartilhado.

- Aplicação: Next.js no contêiner `app`.
- Banco: PostgreSQL 16 no contêiner `db`.
- Acesso inicial: `http://127.0.0.1:3000`.
- Banco não publica porta no Windows host.
- Aplicação publica apenas em loopback por padrão.
- Segredos são gerados no primeiro provisionamento e guardados em `.env`, fora do Git.
- Migrações Prisma são aplicadas pela inicialização da aplicação.
- Reinicialização automática dos contêineres.

## Pré-requisitos do piloto

- Windows 10/11 64-bit atualizado.
- Docker Desktop instalado e iniciado, com backend Linux containers/WSL2.
- Virtualização habilitada e recursos suficientes para Docker, PostgreSQL e Next.js.
- Internet durante a primeira compilação para baixar imagens e dependências.
- Pelo menos 8 GB de RAM recomendados para homologação; 16 GB preferíveis se o computador também operar PDV, navegador e outros programas.

Docker Desktop pode exigir licença paga em determinadas empresas; validar os termos comerciais da Docker antes da distribuição. Para produção comercial em escala, avaliar runtime/container engine com suporte e licenciamento adequados.

## Provisionar uma óptica vazia

Execute o provisionador na raiz do repositório:

```bash
node deploy/local-optical/install.mjs --slug optica-piloto --name "Óptica Piloto" --state SC
```

O script:
1. valida Docker CLI e disponibilidade do daemon;
2. cria `deploy/local-optical/instances/<slug>/.env` sem sobrescrever arquivo existente;
3. gera senha PostgreSQL, AUTH_SECRET e BOOTSTRAP_TOKEN criptograficamente aleatórios;
4. sobe o PostgreSQL e a aplicação com um projeto Compose exclusivo;
5. espera o endpoint de saúde ficar disponível;
6. imprime o endereço local e o token de bootstrap uma única vez.

Guarde o token de bootstrap em local seguro. Ele é necessário para criar o primeiro administrador em `/setup`. Depois de inicializar o administrador, remova BOOTSTRAP_TOKEN do arquivo de ambiente e recrie apenas o contêiner da aplicação. O endpoint de bootstrap também recusa inicialização quando já existe usuário.

Não copie o diretório de instância de uma óptica para outra: isso duplicaria credenciais e dados. Para outra loja, gere outro slug e outro provisionamento.

## Acesso por outros computadores da mesma loja

O padrão é loopback, acessível somente no computador-servidor. Para homologar acesso pela rede local, altere `APP_BIND_ADDRESS=0.0.0.0` no arquivo `.env`, reinicie o projeto Compose e crie uma regra de firewall Windows restrita ao perfil/rede privada e à sub-rede da loja. Acesse por `http://IP-DO-SERVIDOR:3000`.

Não exponha a porta 3000 à internet. Para acesso remoto, use VPN/túnel seguro com autenticação e TLS, nunca encaminhamento direto de porta no roteador.

## Operação

A pasta da instância contém segredos e deve ter ACLs restritas aos administradores locais. Não sincronize `.env` em nuvem nem envie por WhatsApp.

Comandos na raiz do repositório:

```bash
docker compose --env-file deploy/local-optical/instances/optica-piloto/.env -p optica-piloto -f deploy/local-optical/compose.yaml ps
docker compose --env-file deploy/local-optical/instances/optica-piloto/.env -p optica-piloto -f deploy/local-optical/compose.yaml logs -f app
docker compose --env-file deploy/local-optical/instances/optica-piloto/.env -p optica-piloto -f deploy/local-optical/compose.yaml down
```

`down` não apaga o volume. **Nunca use `down -v`** em uma instalação com dados.

## Limites desta etapa

Este kit cria uma aplicação e um banco locais vazios. Ainda não é um instalador autossuficiente: exige Docker Desktop e o código/imagem da aplicação para construir a imagem. O instalador Tauri ainda precisa ser ajustado para abrir o endereço local e para iniciar/parar o serviço local com segurança. O provisionamento LAN, backup agendado, restauração testada, assinatura do instalador e homologação completa são etapas obrigatórias antes da distribuição comercial.

A instância atual da MB Óptica, seu Render e seu banco de produção não são alterados por este procedimento.
